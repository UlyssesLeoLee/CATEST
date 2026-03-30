"""Node: check if a near-duplicate TM entry already exists."""

from __future__ import annotations

import logging

from langsmith import traceable

from catest_ai.common.embedding import embed_text
from catest_ai.common.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)


@traceable(name="tm_dedup")
async def dedup_node(state: dict) -> dict:
    """Vector similarity check — skip if duplicate exists (>= 0.95)."""
    source = state["source_text"]

    try:
        vector = await embed_text(source)
        is_dup = await qdrant_service.check_duplicate(vector, threshold=0.95)
    except Exception as e:
        logger.warning("Dedup check failed: %s", e)
        is_dup = False

    return {"is_duplicate": is_dup, "source_vector": vector if not is_dup else None}
