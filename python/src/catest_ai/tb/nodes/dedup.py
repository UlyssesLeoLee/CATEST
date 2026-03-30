"""Node: check candidates against existing TB to avoid duplicates."""

from __future__ import annotations

import logging

from langsmith import traceable

from catest_ai.common.rust_client import rust_client

logger = logging.getLogger(__name__)


@traceable(name="tb_dedup")
async def dedup_node(state: dict) -> dict:
    """Filter out candidates that already exist in the term base."""
    candidates = state.get("candidates", [])
    if not candidates:
        return {"new_candidates": []}

    try:
        existing_terms = await rust_client.get_terms()
        existing_set = {t.get("source_term", "").lower() for t in existing_terms}
    except Exception as e:
        logger.warning("TB fetch failed, skipping dedup: %s", e)
        return {"new_candidates": candidates}

    new_candidates = [
        c for c in candidates
        if c.get("term", "").lower() not in existing_set
    ]

    return {"new_candidates": new_candidates}
