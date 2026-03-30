"""Qdrant operations for orchestration collections.

Uses SEPARATE collections from the main CATEST RAG — zero interference.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from qdrant_client import AsyncQdrantClient, models

from catest_ai.common.config import settings
from catest_ai.orchestration_schemas import RAGMetadata, RAGPayload

logger = logging.getLogger(__name__)

COLLECTION_REQUIREMENTS = "orchestration_requirements"
COLLECTION_MEMORY = "orchestration_memory"
VECTOR_DIM = 384  # e5-small


class OrchestrationQdrant:
    """Qdrant wrapper scoped to orchestration collections only."""

    def __init__(self) -> None:
        self._client: AsyncQdrantClient | None = None

    async def start(self) -> None:
        self._client = AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
        )
        await self._ensure_collections()
        logger.info("OrchestrationQdrant ready → %s", settings.qdrant_url)

    async def stop(self) -> None:
        if self._client:
            await self._client.close()

    @property
    def client(self) -> AsyncQdrantClient:
        if not self._client:
            raise RuntimeError("OrchestrationQdrant not started")
        return self._client

    async def _ensure_collections(self) -> None:
        """Create collections if they don't exist."""
        for name in (COLLECTION_REQUIREMENTS, COLLECTION_MEMORY):
            exists = await self.client.collection_exists(name)
            if not exists:
                await self.client.create_collection(
                    collection_name=name,
                    vectors_config=models.VectorParams(
                        size=VECTOR_DIM,
                        distance=models.Distance.COSINE,
                    ),
                )
                logger.info("Created Qdrant collection: %s", name)

    # ─── Store ───

    async def store_requirement(self, payload: RAGPayload) -> str:
        """Upsert a structured requirement into orchestration_requirements."""
        await self.client.upsert(
            collection_name=COLLECTION_REQUIREMENTS,
            points=[
                models.PointStruct(
                    id=payload.id,
                    vector=payload.vector,
                    payload=payload.metadata.model_dump(),
                ),
            ],
        )
        logger.info("Stored requirement %s (trace=%s)", payload.id, payload.metadata.trace_id)
        return payload.id

    async def store_memory(self, point_id: str, vector: list[float], metadata: dict) -> str:
        """Store an execution result/memory into orchestration_memory."""
        await self.client.upsert(
            collection_name=COLLECTION_MEMORY,
            points=[
                models.PointStruct(id=point_id, vector=vector, payload=metadata),
            ],
        )
        return point_id

    # ─── Search ───

    async def search_requirements(
        self,
        vector: list[float],
        project: str | None = None,
        top_k: int = 5,
        score_threshold: float = 0.3,
    ) -> list[dict]:
        """Semantic search over stored requirements."""
        query_filter = None
        if project:
            query_filter = models.Filter(
                must=[models.FieldCondition(key="project", match=models.MatchValue(value=project))]
            )
        results = await self.client.query_points(
            collection_name=COLLECTION_REQUIREMENTS,
            query=vector,
            query_filter=query_filter,
            limit=top_k,
            score_threshold=score_threshold,
        )
        return [
            {"id": str(r.id), "score": r.score, **r.payload}
            for r in results.points
        ]

    async def search_memory(
        self,
        vector: list[float],
        project: str | None = None,
        top_k: int = 5,
    ) -> list[dict]:
        """Search execution history/memory."""
        query_filter = None
        if project:
            query_filter = models.Filter(
                must=[models.FieldCondition(key="project", match=models.MatchValue(value=project))]
            )
        results = await self.client.query_points(
            collection_name=COLLECTION_MEMORY,
            query=vector,
            query_filter=query_filter,
            limit=top_k,
        )
        return [
            {"id": str(r.id), "score": r.score, **r.payload}
            for r in results.points
        ]

    # ─── Dedup ───

    async def check_duplicate(self, vector: list[float], threshold: float = 0.95) -> bool:
        """Check if a near-duplicate requirement already exists."""
        results = await self.client.query_points(
            collection_name=COLLECTION_REQUIREMENTS,
            query=vector,
            limit=1,
            score_threshold=threshold,
        )
        return len(results.points) > 0

    # ─── History ───

    async def get_project_history(self, project: str, limit: int = 20) -> list[dict]:
        """Get recent requirements for a project (scroll by filter)."""
        result = await self.client.scroll(
            collection_name=COLLECTION_REQUIREMENTS,
            scroll_filter=models.Filter(
                must=[models.FieldCondition(key="project", match=models.MatchValue(value=project))]
            ),
            limit=limit,
        )
        points, _next = result
        return [{"id": str(p.id), **p.payload} for p in points]


orchestration_qdrant = OrchestrationQdrant()
