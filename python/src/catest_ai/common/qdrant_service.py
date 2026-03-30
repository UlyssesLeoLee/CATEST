"""Qdrant vector search client."""

from __future__ import annotations

import logging

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import ScoredPoint

from catest_ai.common.config import settings

logger = logging.getLogger(__name__)


class QdrantService:
    def __init__(self) -> None:
        self._client: AsyncQdrantClient | None = None

    async def start(self) -> None:
        self._client = AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
        )
        logger.info("Qdrant client → %s", settings.qdrant_url)

    async def stop(self) -> None:
        if self._client:
            await self._client.close()

    @property
    def client(self) -> AsyncQdrantClient:
        if not self._client:
            raise RuntimeError("Qdrant client not started")
        return self._client

    async def search_similar(
        self,
        vector: list[float],
        top_k: int = 5,
        score_threshold: float = 0.0,
    ) -> list[ScoredPoint]:
        return await self.client.query_points(
            collection_name=settings.qdrant_collection,
            query=vector,
            limit=top_k,
            score_threshold=score_threshold,
        ).points

    async def check_duplicate(self, vector: list[float], threshold: float = 0.95) -> bool:
        """Check if a near-duplicate exists in the collection."""
        results = await self.search_similar(vector, top_k=1, score_threshold=threshold)
        return len(results) > 0


qdrant_service = QdrantService()
