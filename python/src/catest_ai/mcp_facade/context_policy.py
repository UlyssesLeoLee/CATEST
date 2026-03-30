"""Context retrieval policy — ensures MCP returns the RIGHT context, not just similar content.

Strategy: metadata filter FIRST → vector search SECOND → rerank THIRD.

Priority rules:
1. Current trace_id → exact match, highest priority
2. Current session_id → scoped to session
3. Current project → scoped to project
4. Status: confirmed > draft > archived
5. Recency: newer first within same relevance tier
6. task_type / source_type: matching types preferred
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any

from qdrant_client import models


@dataclass
class ContextQuery:
    """Structured context query with all filtering dimensions."""
    query_text: str
    trace_id: str | None = None
    session_id: str | None = None
    project: str | None = None
    status_filter: list[str] = field(default_factory=lambda: ["confirmed", "stored", "draft"])
    task_type: str | None = None
    source_type: str | None = None
    time_window_hours: int | None = 72  # default: last 72 hours
    top_k: int = 5
    score_threshold: float = 0.3


def build_qdrant_filter(ctx: ContextQuery) -> models.Filter:
    """Build Qdrant filter from context query — metadata first, then vector search.

    This is the core of context correctness: we never let vector search
    run unbounded across the entire collection.
    """
    must_conditions: list[models.Condition] = []
    should_conditions: list[models.Condition] = []

    # --- Hard filters (must) ---

    # If trace_id is specified, it's an exact lookup — skip everything else
    if ctx.trace_id:
        must_conditions.append(
            models.FieldCondition(key="trace_id", match=models.MatchValue(value=ctx.trace_id))
        )
        return models.Filter(must=must_conditions)

    # Project scope — mandatory when provided
    if ctx.project:
        must_conditions.append(
            models.FieldCondition(key="project", match=models.MatchValue(value=ctx.project))
        )

    # Status filter — only return allowed statuses
    if ctx.status_filter:
        must_conditions.append(
            models.FieldCondition(key="status", match=models.MatchAny(any=ctx.status_filter))
        )

    # Time window — prevent returning ancient results
    if ctx.time_window_hours:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=ctx.time_window_hours)
        must_conditions.append(
            models.FieldCondition(
                key="created_at",
                range=models.Range(gte=cutoff.isoformat()),
            )
        )

    # --- Soft filters (should) — boost matching content ---

    # Session scope — prefer same session
    if ctx.session_id:
        should_conditions.append(
            models.FieldCondition(key="session_id", match=models.MatchValue(value=ctx.session_id))
        )

    # Task type preference
    if ctx.task_type:
        should_conditions.append(
            models.FieldCondition(key="task_type", match=models.MatchValue(value=ctx.task_type))
        )

    # Source type preference
    if ctx.source_type:
        should_conditions.append(
            models.FieldCondition(key="source_type", match=models.MatchValue(value=ctx.source_type))
        )

    filter_obj = models.Filter(must=must_conditions if must_conditions else None)
    if should_conditions:
        filter_obj.should = should_conditions

    return filter_obj


def rerank_results(results: list[dict], ctx: ContextQuery) -> list[dict]:
    """Rerank search results by context relevance priority.

    Order of priority:
    1. Exact trace_id match (already filtered, score=1.0 boost)
    2. Same session results (+0.2 boost)
    3. Status: confirmed (+0.15) > stored (+0.05) > draft (0) > archived (-0.1)
    4. Recency bonus (exponential decay over time)
    """
    STATUS_BOOST = {
        "confirmed": 0.15,
        "stored": 0.05,
        "draft": 0.0,
        "archived": -0.1,
    }

    now = datetime.now(timezone.utc)

    for r in results:
        boost = 0.0

        # Session boost
        if ctx.session_id and r.get("session_id") == ctx.session_id:
            boost += 0.2

        # Status boost
        status = r.get("status", "stored")
        boost += STATUS_BOOST.get(status, 0.0)

        # Recency bonus (max +0.1 for very recent, decays over 72 hours)
        created = r.get("created_at", "")
        if created:
            try:
                age_hours = (now - datetime.fromisoformat(created)).total_seconds() / 3600
                recency_bonus = max(0.0, 0.1 * (1.0 - age_hours / 72))
                boost += recency_bonus
            except (ValueError, TypeError):
                pass

        r["_reranked_score"] = r.get("score", 0.0) + boost

    results.sort(key=lambda r: r.get("_reranked_score", 0.0), reverse=True)
    return results
