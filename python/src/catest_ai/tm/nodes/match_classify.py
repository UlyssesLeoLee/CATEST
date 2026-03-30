"""Node: multi-level TM matching — the core of any CAT TM engine.

Implements the match hierarchy used by Trados/memoQ/Memsource:
  ICE (101%)  → exact match + context match (prev/next segment)
  Exact (100%) → identical normalized source
  Fuzzy (50-99%) → edit-distance based
  Fragment → subsegment / n-gram matches

This node queries multiple sources (Qdrant vectors + Rust Gateway fulltext)
and classifies each result into the proper match level.
"""

from __future__ import annotations

import logging

from langsmith import traceable

from catest_ai.common.embedding import embed_text
from catest_ai.common.qdrant_service import qdrant_service
from catest_ai.common.rust_client import rust_client
from catest_ai.common.schemas import TMMatchResult, TMMatchType
from catest_ai.tm.nodes.normalize import (
    compute_fuzzy_score,
    generate_diff,
    normalize_segment,
)

logger = logging.getLogger(__name__)


def classify_match(
    query_source: str,
    tm_source: str,
    tm_target: str,
    *,
    query_prev: str = "",
    query_next: str = "",
    tm_prev: str = "",
    tm_next: str = "",
    enable_ice: bool = True,
    **tm_metadata,
) -> TMMatchResult:
    """Classify a TM hit into the proper match level."""
    q_norm = normalize_segment(query_source)
    t_norm = normalize_segment(tm_source)

    # 1. ICE check (101%) — exact + context
    if enable_ice and q_norm == t_norm:
        prev_match = (
            normalize_segment(query_prev) == normalize_segment(tm_prev)
            if query_prev and tm_prev
            else False
        )
        next_match = (
            normalize_segment(query_next) == normalize_segment(tm_next)
            if query_next and tm_next
            else False
        )
        if prev_match or next_match:
            return TMMatchResult(
                match_type=TMMatchType.ICE,
                match_score=101,
                raw_score=101,
                source_text=tm_source,
                target_text=tm_target,
                diff_source="",
                **tm_metadata,
            )

    # 2. Exact check (100%)
    if q_norm == t_norm:
        return TMMatchResult(
            match_type=TMMatchType.EXACT,
            match_score=100,
            raw_score=100,
            source_text=tm_source,
            target_text=tm_target,
            diff_source="",
            **tm_metadata,
        )

    # 3. Fuzzy scoring
    score = compute_fuzzy_score(query_source, tm_source)
    diff = generate_diff(query_source, tm_source)

    if score >= 85:
        match_type = TMMatchType.FUZZY_HIGH
    elif score >= 70:
        match_type = TMMatchType.FUZZY_MID
    elif score >= 50:
        match_type = TMMatchType.FUZZY_LOW
    else:
        match_type = TMMatchType.NO_MATCH

    return TMMatchResult(
        match_type=match_type,
        match_score=score,
        raw_score=score,
        source_text=tm_source,
        target_text=tm_target,
        diff_source=diff,
        **tm_metadata,
    )


@traceable(name="tm_match_classify")
async def match_classify_node(state: dict) -> dict:
    """Multi-source TM lookup with match classification.

    Queries:
    1. Qdrant vector search (semantic similarity)
    2. Rust Gateway fulltext search (lexical match)
    Then classifies each result using the CAT match hierarchy.
    """
    source = state["source_text"]
    normalized = state.get("normalized_source", normalize_segment(source))
    prev_source = state.get("prev_source", "")
    next_source = state.get("next_source", "")
    enable_ice = state.get("enable_ice", True)
    min_score = state.get("min_fuzzy_score", 50)

    raw_hits: list[dict] = []

    # 1. Vector search via Qdrant — catches semantic similarity
    try:
        vector = await embed_text(normalized)
        results = await qdrant_service.search_similar(vector, top_k=10, score_threshold=0.5)
        for hit in results:
            p = hit.payload or {}
            raw_hits.append({
                "source_text": p.get("source_text", ""),
                "target_text": p.get("target_text", ""),
                "prev_source": p.get("prev_source", ""),
                "next_source": p.get("next_source", ""),
                "tm_bank": p.get("tm_bank", ""),
                "domain": p.get("domain", ""),
                "quality_score": p.get("quality_score", 0.0),
                "is_machine_translated": p.get("is_machine_translated", False),
                "created_at": p.get("created_at"),
                "vector_score": hit.score,
            })
    except Exception as e:
        logger.warning("Qdrant search failed: %s", e)

    # 2. Fulltext search via Rust Gateway
    try:
        gw_results = await rust_client.search_memory(source, top_k=10)
        for item in gw_results.get("results", []):
            raw_hits.append({
                "source_text": item.get("source_text", ""),
                "target_text": item.get("target_text", ""),
                "prev_source": item.get("prev_source", ""),
                "next_source": item.get("next_source", ""),
                "tm_bank": item.get("tm_bank", ""),
                "domain": item.get("domain", ""),
                "quality_score": item.get("quality_score", 0.0),
                "is_machine_translated": item.get("is_machine_translated", False),
                "created_at": item.get("created_at"),
                "vector_score": 0.0,
            })
    except Exception as e:
        logger.warning("Gateway TM search failed: %s", e)

    # 3. Classify each hit
    matches: list[TMMatchResult] = []
    seen_targets: set[str] = set()

    for hit in raw_hits:
        tgt = hit["target_text"]
        if not tgt or tgt in seen_targets:
            continue
        seen_targets.add(tgt)

        metadata = {
            "tm_bank": hit.get("tm_bank", ""),
            "domain": hit.get("domain", ""),
            "quality_score": hit.get("quality_score", 0.0),
            "is_machine_translated": hit.get("is_machine_translated", False),
            "created_at": hit.get("created_at"),
        }

        result = classify_match(
            source,
            hit["source_text"],
            hit["target_text"],
            query_prev=prev_source,
            query_next=next_source,
            tm_prev=hit.get("prev_source", ""),
            tm_next=hit.get("next_source", ""),
            enable_ice=enable_ice,
            **metadata,
        )

        if result.match_score >= min_score:
            matches.append(result)

    # Sort: ICE first, then by score descending
    type_priority = {
        TMMatchType.ICE: 0,
        TMMatchType.EXACT: 1,
        TMMatchType.FUZZY_HIGH: 2,
        TMMatchType.FUZZY_MID: 3,
        TMMatchType.FUZZY_LOW: 4,
    }
    matches.sort(key=lambda m: (type_priority.get(m.match_type, 9), -m.match_score))

    return {
        "tm_matches": matches[:state.get("max_results", 5)],
        "source_vector": vector if "vector" in dir() else None,
    }
