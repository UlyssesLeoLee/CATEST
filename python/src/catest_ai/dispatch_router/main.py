"""dispatch-router — consumes llm.dispatch.request, enriches with RAG context,
routes to the correct adapter topic.

Optionally queries memory-service for related historical context before dispatch.
Also pushes context to cloud MCP relay so remote agents can access it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

import httpx
import uvicorn
from aiokafka import AIOKafkaConsumer
from fastapi import FastAPI

from catest_ai.common.config import settings
from catest_ai.common.kafka_producer import KafkaProducerService
from catest_ai.orchestration_schemas import (
    OrchestrationEvent,
    OrchestrationTopics,
)
from catest_ai.dispatch_router.strategy import resolve_topic

logger = logging.getLogger(__name__)

kafka_producer_svc = KafkaProducerService()
_consumer_task: asyncio.Task | None = None

MEMORY_SERVICE_URL = os.getenv("MEMORY_SERVICE_URL", "http://catest-memory-service:34092")
MCP_RELAY_URL = os.getenv("MCP_RELAY_URL", "")


async def _enrich_with_rag(envelope: dict) -> list[dict]:
    """Query memory-service for related context."""
    try:
        query = f"{envelope.get('summary', '')} {' '.join(envelope.get('keywords', []))}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{MEMORY_SERVICE_URL}/search",
                json={
                    "query": query,
                    "project": envelope.get("project", "default"),
                    "top_k": 3,
                },
            )
            resp.raise_for_status()
            return resp.json().get("results", [])
    except httpx.HTTPError as e:
        logger.warning("RAG enrichment failed: %s", e)
        return []


async def _push_to_mcp_relay(envelope: dict) -> None:
    """Push task context to cloud MCP relay so remote agents can access it."""
    if not MCP_RELAY_URL:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(f"{MCP_RELAY_URL}/relay/push", json=envelope)
        logger.info("[%s] Pushed to MCP relay", envelope.get("trace_id", "?")[:8])
    except httpx.HTTPError as e:
        logger.warning("MCP relay push failed: %s", e)


async def _consume_loop() -> None:
    consumer = AIOKafkaConsumer(
        OrchestrationTopics.LLM_DISPATCH_REQUEST,
        bootstrap_servers=settings.kafka_broker,
        group_id="orchestration_dispatch_group",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    await consumer.start()
    logger.info("dispatch-router Kafka consumer started")
    try:
        async for msg in consumer:
            try:
                await _handle_dispatch(msg.value)
            except Exception:
                logger.exception("dispatch-router failed to handle message")
    finally:
        await consumer.stop()


async def _handle_dispatch(raw: dict) -> None:
    event = OrchestrationEvent(**raw)
    envelope = event.payload
    trace_id = event.trace_id

    # 1) Enrich with RAG context
    rag_results = await _enrich_with_rag(envelope)
    envelope["rag_context"] = rag_results

    # 2) Determine target topic
    dispatch_config = envelope.get("dispatch_config", {})
    target = dispatch_config.get("target", "claude_code")
    topic = resolve_topic(target)

    # 3) Push to cloud MCP relay (so remote agents can access via MCP tools)
    await _push_to_mcp_relay(envelope)

    # 4) Publish to adapter-specific topic
    await kafka_producer_svc.send_event(
        topic,
        OrchestrationEvent(
            event_type=topic,
            trace_id=trace_id,
            source_service="dispatch-router",
            payload=envelope,
        ),
    )
    logger.info("[%s] Dispatched to %s → %s", trace_id[:8], target, topic)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _consumer_task
    await kafka_producer_svc.start()
    _consumer_task = asyncio.create_task(_consume_loop())
    logger.info("dispatch-router ready")
    yield
    if _consumer_task:
        _consumer_task.cancel()
    await kafka_producer_svc.stop()


app = FastAPI(title="dispatch-router", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "dispatch-router"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=34093)
