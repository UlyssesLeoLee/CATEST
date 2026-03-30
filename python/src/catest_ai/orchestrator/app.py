"""AI Orchestrator — FastAPI gateway that routes AI requests to downstream services."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from catest_ai.common.config import settings
from catest_ai.common.kafka_producer import kafka_producer
from catest_ai.common.llm import init_tracing
from catest_ai.common.rust_client import rust_client
from catest_ai.orchestrator.routes import auto_note, health, quality, tb, tm, vectors

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start/stop shared resources."""
    init_tracing()
    await kafka_producer.start()
    await rust_client.start()
    logger.info("ai-orchestrator ready on :%s", settings.service_port)
    yield
    await kafka_producer.stop()
    await rust_client.stop()


def create_app() -> FastAPI:
    app = FastAPI(
        title="CATEST AI Orchestrator",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(health.router)
    app.include_router(auto_note.router, prefix="/ai")
    app.include_router(tm.router, prefix="/ai/tm")
    app.include_router(tb.router, prefix="/ai/tb")
    app.include_router(quality.router, prefix="/ai/quality")
    app.include_router(vectors.router, prefix="/ai")
    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "catest_ai.orchestrator.app:app",
        host="0.0.0.0",
        port=settings.service_port,
        reload=True,
    )
