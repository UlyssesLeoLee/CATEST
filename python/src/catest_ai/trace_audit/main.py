"""trace-audit — consumes ALL orchestration events, writes to LangSmith + PostgreSQL.

This is the observability backbone of the orchestration domain.
Every event with a trace_id gets correlated into a trace tree.
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import asyncpg
import uvicorn
from aiokafka import AIOKafkaConsumer
from fastapi import FastAPI

from catest_ai.common.config import settings
from catest_ai.common.llm import init_tracing
from catest_ai.orchestration_schemas import OrchestrationEvent, OrchestrationTopics
from catest_ai.trace_audit.langsmith_bridge import record_event

logger = logging.getLogger(__name__)

_consumer_task: asyncio.Task | None = None
_db_pool: asyncpg.Pool | None = None

AUDIT_DB_URL = "postgres://catest:password@postgres:34321/catest_orchestration"

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS audit_events (
    id              BIGSERIAL PRIMARY KEY,
    event_id        TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    trace_id        TEXT NOT NULL,
    source_service  TEXT NOT NULL,
    status          TEXT NOT NULL,
    payload         JSONB,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_trace_id ON audit_events (trace_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events (timestamp);
"""


async def _init_db() -> None:
    global _db_pool
    try:
        _db_pool = await asyncpg.create_pool(AUDIT_DB_URL, min_size=1, max_size=5)
        async with _db_pool.acquire() as conn:
            await conn.execute(CREATE_TABLE_SQL)
        logger.info("Audit database initialized")
    except Exception:
        logger.exception("Failed to initialize audit database — will run without persistence")
        _db_pool = None


async def _store_event(event: OrchestrationEvent) -> None:
    """Store event in PostgreSQL."""
    if _db_pool is None:
        return
    try:
        async with _db_pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO audit_events (event_id, event_type, trace_id, source_service, status, payload, timestamp)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                event.event_id,
                event.event_type,
                event.trace_id,
                event.source_service,
                event.status,
                json.dumps(event.payload, default=str),
                event.timestamp,
            )
    except Exception:
        logger.exception("Failed to store audit event")


async def _handle_event(raw: dict) -> None:
    event = OrchestrationEvent(**raw)

    # 1) Write to PostgreSQL
    await _store_event(event)

    # 2) Write to LangSmith
    record_event(
        trace_id=event.trace_id,
        event_type=event.event_type,
        source_service=event.source_service,
        status=event.status,
        payload=event.payload,
        timestamp=event.timestamp,
    )

    logger.debug("[%s] Audited: %s from %s",
                 event.trace_id[:8], event.event_type, event.source_service)


async def _consume_loop() -> None:
    consumer = AIOKafkaConsumer(
        *OrchestrationTopics.ALL,
        bootstrap_servers=settings.kafka_broker,
        group_id="orchestration_audit_group",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    await consumer.start()
    logger.info("trace-audit consumer started (subscribing to %d topics)", len(OrchestrationTopics.ALL))
    try:
        async for msg in consumer:
            try:
                await _handle_event(msg.value)
            except Exception:
                logger.exception("trace-audit failed to handle event")
    finally:
        await consumer.stop()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _consumer_task
    init_tracing()
    await _init_db()
    _consumer_task = asyncio.create_task(_consume_loop())
    logger.info("trace-audit ready")
    yield
    if _consumer_task:
        _consumer_task.cancel()
    if _db_pool:
        await _db_pool.close()


app = FastAPI(title="trace-audit", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "trace-audit"}


@app.get("/traces/{trace_id}")
async def get_trace(trace_id: str):
    """Get all events for a trace_id."""
    if _db_pool is None:
        return {"error": "Database not available"}
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM audit_events WHERE trace_id = $1 ORDER BY timestamp",
            trace_id,
        )
    return {
        "trace_id": trace_id,
        "events": [dict(r) for r in rows],
    }


@app.get("/traces")
async def list_traces(limit: int = 50):
    """List recent traces."""
    if _db_pool is None:
        return {"error": "Database not available"}
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT trace_id, MIN(timestamp) as started, MAX(timestamp) as latest,
                      COUNT(*) as event_count, array_agg(DISTINCT source_service) as services
               FROM audit_events
               GROUP BY trace_id
               ORDER BY MAX(timestamp) DESC
               LIMIT $1""",
            limit,
        )
    return {"traces": [dict(r) for r in rows]}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=34097)
