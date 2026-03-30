"""adapter-codex — consumes adapter.codex.request, transforms, calls Codex API."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager

import httpx
import uvicorn
from aiokafka import AIOKafkaConsumer
from fastapi import FastAPI

from catest_ai.common.config import settings
from catest_ai.common.kafka_producer import KafkaProducerService
from catest_ai.orchestration_schemas import (
    AdapterResult,
    OrchestrationEvent,
    OrchestrationTopics,
)
from catest_ai.adapter_codex.transform import to_codex_payload

logger = logging.getLogger(__name__)

kafka_producer_svc = KafkaProducerService()
_consumer_task: asyncio.Task | None = None

CODEX_API_URL = os.getenv("CODEX_API_URL", "https://api.openai.com/v1/responses")
CODEX_API_KEY = os.getenv("CODEX_API_KEY", "")


async def _call_codex(payload: dict) -> dict:
    """Call Codex API and return result."""
    headers = {
        "Authorization": f"Bearer {CODEX_API_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(CODEX_API_URL, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


async def _handle_request(raw: dict) -> None:
    event = OrchestrationEvent(**raw)
    envelope = event.payload
    trace_id = event.trace_id
    start = time.monotonic()

    codex_payload = to_codex_payload(envelope)

    try:
        result = await _call_codex(codex_payload)
        adapter_result = AdapterResult(
            trace_id=trace_id,
            adapter="codex",
            status="success",
            output=result,
            duration_ms=int((time.monotonic() - start) * 1000),
        )
    except Exception as e:
        logger.exception("[%s] Codex call failed", trace_id[:8])
        adapter_result = AdapterResult(
            trace_id=trace_id,
            adapter="codex",
            status="failed",
            error=str(e),
            duration_ms=int((time.monotonic() - start) * 1000),
        )

    await kafka_producer_svc.send_event(
        OrchestrationTopics.ADAPTER_RESULT,
        OrchestrationEvent(
            event_type=OrchestrationTopics.ADAPTER_RESULT,
            trace_id=trace_id,
            source_service="adapter-codex",
            status=adapter_result.status,
            payload=adapter_result.model_dump(mode="json"),
        ),
    )


async def _consume_loop() -> None:
    consumer = AIOKafkaConsumer(
        OrchestrationTopics.ADAPTER_CODEX_REQUEST,
        bootstrap_servers=settings.kafka_broker,
        group_id="orchestration_codex_group",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    await consumer.start()
    logger.info("adapter-codex consumer started")
    try:
        async for msg in consumer:
            try:
                await _handle_request(msg.value)
            except Exception:
                logger.exception("adapter-codex failed")
    finally:
        await consumer.stop()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _consumer_task
    await kafka_producer_svc.start()
    _consumer_task = asyncio.create_task(_consume_loop())
    yield
    if _consumer_task:
        _consumer_task.cancel()
    await kafka_producer_svc.stop()


app = FastAPI(title="adapter-codex", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "adapter-codex"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=34094)
