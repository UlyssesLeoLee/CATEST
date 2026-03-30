"""HTTP client for communicating with the Rust Gateway (low-coupling interface)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from catest_ai.common.config import settings

logger = logging.getLogger(__name__)


class RustGatewayClient:
    """All writes to TM/TB go through Rust Gateway REST API."""

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.rust_gateway_url,
            timeout=httpx.Timeout(10.0),
        )
        logger.info("Rust Gateway client → %s", settings.rust_gateway_url)

    async def stop(self) -> None:
        if self._client:
            await self._client.aclose()

    @property
    def client(self) -> httpx.AsyncClient:
        if not self._client:
            raise RuntimeError("Rust Gateway client not started")
        return self._client

    # ─── RAG / Ingest ───

    async def ingest_rag(self, source_text: str, target_text: str, **kwargs: Any) -> dict:
        resp = await self.client.post(
            "/api/ingest-rag",
            json={"source_text": source_text, "target_text": target_text, **kwargs},
        )
        resp.raise_for_status()
        return resp.json()

    # ─── TM Search (read path) ───

    async def search_memory(self, query: str, top_k: int = 5) -> dict:
        resp = await self.client.post(
            "/api/rag/memory",
            json={"query": query, "top_k": top_k},
        )
        resp.raise_for_status()
        return resp.json()

    # ─── TB Terms (read path) ───

    async def get_terms(self) -> list[dict]:
        resp = await self.client.get("/api/rag/terms")
        resp.raise_for_status()
        return resp.json()

    # ─── Graph Search ───

    async def search_graph(self, query: str) -> dict:
        resp = await self.client.post(
            "/api/rag/graph",
            json={"query": query},
        )
        resp.raise_for_status()
        return resp.json()

    # ─── Health ───

    async def health(self) -> bool:
        try:
            resp = await self.client.get("/healthz")
            return resp.status_code == 200
        except httpx.HTTPError:
            return False


rust_client = RustGatewayClient()
