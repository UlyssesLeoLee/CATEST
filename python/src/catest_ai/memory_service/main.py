"""memory-service — local Qdrant RAG for orchestration domain.

Dual interface:
1. Kafka consumer: listens to orchestration.rag.store.request
2. HTTP API: search/history queries from dispatch-router and MCP relay
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import uvicorn
from aiokafka import AIOKafkaConsumer
from fastapi import FastAPI
from pydantic import BaseModel

from catest_ai.common.config import settings
from catest_ai.common.embedding import embed_text
from catest_ai.common.kafka_producer import KafkaProducerService
from catest_ai.orchestration_schemas import (
    OrchestrationEvent,
    OrchestrationTopics,
    RAGMetadata,
    RAGPayload,
)
from catest_ai.memory_service.qdrant_ops import orchestration_qdrant

logger = logging.getLogger(__name__)

kafka_producer_svc = KafkaProducerService()
_consumer_task: asyncio.Task | None = None


# ─── Kafka Consumer Loop ───


async def _consume_loop() -> None:
    """Consume RAG store requests from Kafka and write to Qdrant."""
    consumer = AIOKafkaConsumer(
        OrchestrationTopics.RAG_STORE_REQUEST,
        bootstrap_servers=settings.kafka_broker,
        group_id="orchestration_memory_group",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    await consumer.start()
    logger.info("memory-service Kafka consumer started")
    try:
        async for msg in consumer:
            try:
                await _handle_store_request(msg.value)
            except Exception:
                logger.exception("Failed to handle store request")
    finally:
        await consumer.stop()


async def _handle_store_request(raw: dict) -> None:
    """Process a single rag.store.request event."""
    event = OrchestrationEvent(**raw)
    payload_data = event.payload
    trace_id = event.trace_id

    # Extract envelope fields
    embedding = payload_data.pop("_embedding", None)
    title = payload_data.get("title", "")
    summary = payload_data.get("summary", "")
    tasks_raw = payload_data.get("tasks", [])
    tasks = [t["description"] if isinstance(t, dict) else str(t) for t in tasks_raw]

    # Generate embedding if not provided
    if not embedding:
        text = f"{summary} {' '.join(tasks)}".strip()
        embedding = await embed_text(text)

    # Dedup check
    is_dup = await orchestration_qdrant.check_duplicate(embedding)
    if is_dup:
        logger.info("[%s] Near-duplicate detected, skipping store", trace_id[:8])
        return

    now = datetime.now(timezone.utc).isoformat()
    rag_payload = RAGPayload(
        vector=embedding,
        metadata=RAGMetadata(
            trace_id=trace_id,
            project=payload_data.get("project", "default"),
            title=title,
            summary=summary,
            tasks=tasks,
            constraints=payload_data.get("constraints", []),
            keywords=payload_data.get("keywords", []),
            status="stored",
            dispatch_target=payload_data.get("dispatch_config", {}).get("target", ""),
            created_at=now,
            updated_at=now,
        ),
    )

    point_id = await orchestration_qdrant.store_requirement(rag_payload)

    # Publish completion event
    await kafka_producer_svc.send_event(
        OrchestrationTopics.RAG_STORE_COMPLETED,
        OrchestrationEvent(
            event_type=OrchestrationTopics.RAG_STORE_COMPLETED,
            trace_id=trace_id,
            source_service="memory-service",
            status="completed",
            payload={"qdrant_point_id": point_id},
        ),
    )
    logger.info("[%s] Stored to Qdrant → %s", trace_id[:8], point_id)


# ─── FastAPI App ───


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _consumer_task
    await orchestration_qdrant.start()
    await kafka_producer_svc.start()
    _consumer_task = asyncio.create_task(_consume_loop())
    logger.info("memory-service ready")
    yield
    if _consumer_task:
        _consumer_task.cancel()
    await kafka_producer_svc.stop()
    await orchestration_qdrant.stop()


app = FastAPI(title="memory-service", lifespan=lifespan)


class SearchRequest(BaseModel):
    query: str
    project: str | None = None
    top_k: int = 5


class StoreRequest(BaseModel):
    trace_id: str
    title: str
    summary: str
    tasks: list[str]
    constraints: list[str] = []
    keywords: list[str] = []
    project: str = "default"


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "memory-service"}


@app.post("/search")
async def search_requirements(req: SearchRequest):
    """Semantic search over stored requirements."""
    vector = await embed_text(req.query)
    results = await orchestration_qdrant.search_requirements(
        vector=vector, project=req.project, top_k=req.top_k
    )
    return {"results": results}


@app.post("/search/memory")
async def search_memory(req: SearchRequest):
    """Search execution history."""
    vector = await embed_text(req.query)
    results = await orchestration_qdrant.search_memory(
        vector=vector, project=req.project, top_k=req.top_k
    )
    return {"results": results}


@app.get("/history/{project}")
async def get_history(project: str, limit: int = 20):
    """Get recent requirements for a project."""
    results = await orchestration_qdrant.get_project_history(project, limit)
    return {"project": project, "results": results}


@app.post("/store")
async def store_direct(req: StoreRequest):
    """Direct HTTP store (used by MCP relay for push-sync)."""
    text = f"{req.summary} {' '.join(req.tasks)}".strip()
    vector = await embed_text(text)

    is_dup = await orchestration_qdrant.check_duplicate(vector)
    if is_dup:
        return {"status": "duplicate", "trace_id": req.trace_id}

    now = datetime.now(timezone.utc).isoformat()
    rag_payload = RAGPayload(
        vector=vector,
        metadata=RAGMetadata(
            trace_id=req.trace_id,
            project=req.project,
            title=req.title,
            summary=req.summary,
            tasks=req.tasks,
            constraints=req.constraints,
            keywords=req.keywords,
            created_at=now,
            updated_at=now,
        ),
    )
    point_id = await orchestration_qdrant.store_requirement(rag_payload)
    return {"status": "stored", "point_id": point_id, "trace_id": req.trace_id}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=34092)
