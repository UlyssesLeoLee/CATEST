"""AI Vector-Ops service — the ROPE_CS ↔ Python bridge.

Provides comprehensive vector/graph CRUD operations for the
Bevy-based ROPE_CS visualization tool:

- Query vectors from Qdrant with 3D projection
- Semantic search (find neighbors)
- Write-back: adjust vectors, payloads, delete points
- Graph query/write for Memgraph
- Clustering for color-coded visualization
- Backend status for connection panel

Port: 34085

Future: WebSocket endpoint for real-time Bevy ↔ Python sync.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from catest_ai.common.config import settings
from catest_ai.common.llm import init_tracing
from catest_ai.common.qdrant_service import qdrant_service
from catest_ai.vector_ops.routes import cluster_ops, graph_ops, qdrant_ops

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_tracing()
    await qdrant_service.start()
    logger.info("ai-vector-ops ready on :%s", settings.service_port)
    yield
    await qdrant_service.stop()


def create_app() -> FastAPI:
    app = FastAPI(
        title="CATEST AI Vector-Ops (ROPE_CS Bridge)",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS: ROPE_CS (Bevy) may use HTTP from a local client
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Bevy desktop app — no specific origin
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "service": "ai-vector-ops"}

    app.include_router(qdrant_ops.router, prefix="/v1")
    app.include_router(graph_ops.router, prefix="/v1")
    app.include_router(cluster_ops.router, prefix="/v1")

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("catest_ai.vector_ops.app:app", host="0.0.0.0", port=34085, reload=True)
