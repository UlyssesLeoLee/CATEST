"""adapter-claude-code — consumes adapter.claude_code.request, invokes Claude Code.

Unlike other adapters, Claude Code is typically invoked as a CLI subprocess
or via the Claude Agent SDK. This adapter prepares the invocation and
monitors execution.
"""

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
from catest_ai.adapter_claude_code.transform import to_claude_code_payload

logger = logging.getLogger(__name__)

kafka_producer_svc = KafkaProducerService()
_consumer_task: asyncio.Task | None = None

MCP_RELAY_URL = os.getenv("MCP_RELAY_URL", "")


async def _invoke_claude_code(payload: dict, trace_id: str) -> dict:
    """Invoke Claude Code via the Agent SDK HTTP API or CLI.

    Strategy:
    1. If CLAUDE_CODE_API_URL is set → use HTTP API
    2. Otherwise → push to MCP relay and wait for agent to pull & submit
    """
    api_url = os.getenv("CLAUDE_CODE_API_URL", "")

    if api_url:
        # Direct API invocation
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(
                api_url,
                json=payload,
                headers={"Authorization": f"Bearer {os.getenv('ANTHROPIC_API_KEY', '')}"},
            )
            resp.raise_for_status()
            return resp.json()
    else:
        # MCP relay mode: the context is already pushed by dispatch-router.
        # Claude Code will connect to MCP relay, pick up the task, and submit_result.
        # We poll the relay for the result.
        if MCP_RELAY_URL:
            return await _poll_for_result(trace_id, timeout=300)
        return {"status": "queued", "message": "Task pushed to MCP relay, awaiting agent pickup"}


async def _poll_for_result(trace_id: str, timeout: int = 300) -> dict:
    """Poll the MCP relay for an adapter result."""
    deadline = time.monotonic() + timeout
    async with httpx.AsyncClient(timeout=10.0) as client:
        while time.monotonic() < deadline:
            try:
                resp = await client.get(f"{MCP_RELAY_URL}/relay/result/{trace_id}")
                if resp.status_code == 200:
                    return resp.json()
            except httpx.HTTPError:
                pass
            await asyncio.sleep(5)
    return {"status": "timeout", "message": f"No result after {timeout}s"}


async def _handle_request(raw: dict) -> None:
    event = OrchestrationEvent(**raw)
    envelope = event.payload
    trace_id = event.trace_id
    start = time.monotonic()

    cc_payload = to_claude_code_payload(envelope)

    try:
        result = await _invoke_claude_code(cc_payload, trace_id)
        status = result.get("status", "success")
        if status not in ("success", "partial", "failed", "timeout", "queued"):
            status = "success"
        adapter_result = AdapterResult(
            trace_id=trace_id,
            adapter="claude_code",
            status=status,
            output=result,
            duration_ms=int((time.monotonic() - start) * 1000),
        )
    except Exception as e:
        logger.exception("[%s] Claude Code invocation failed", trace_id[:8])
        adapter_result = AdapterResult(
            trace_id=trace_id,
            adapter="claude_code",
            status="failed",
            error=str(e),
            duration_ms=int((time.monotonic() - start) * 1000),
        )

    await kafka_producer_svc.send_event(
        OrchestrationTopics.ADAPTER_RESULT,
        OrchestrationEvent(
            event_type=OrchestrationTopics.ADAPTER_RESULT,
            trace_id=trace_id,
            source_service="adapter-claude-code",
            status=adapter_result.status,
            payload=adapter_result.model_dump(mode="json"),
        ),
    )


async def _consume_loop() -> None:
    consumer = AIOKafkaConsumer(
        OrchestrationTopics.ADAPTER_CLAUDE_CODE_REQUEST,
        bootstrap_servers=settings.kafka_broker,
        group_id="orchestration_claude_code_group",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    await consumer.start()
    logger.info("adapter-claude-code consumer started")
    try:
        async for msg in consumer:
            try:
                await _handle_request(msg.value)
            except Exception:
                logger.exception("adapter-claude-code failed")
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


app = FastAPI(title="adapter-claude-code", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "adapter-claude-code"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=34095)
