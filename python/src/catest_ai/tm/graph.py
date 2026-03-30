"""LangGraph: TM workflows — lookup pipeline + enrichment pipeline.

═══ Lookup Pipeline (used by ai-note for CAT auto-note) ═══
  normalize → match_classify → penalty → fragment_assembly → rank → END

═══ Enrichment Pipeline (used by ai-consumer for TM ingestion) ═══
  normalize → dedup → [skip if dup] → lifecycle → END
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from catest_ai.common.schemas import TMMatchResult, TMMatchType
from catest_ai.tm.nodes.dedup import dedup_node
from catest_ai.tm.nodes.fragment_assembly import fragment_assembly_node
from catest_ai.tm.nodes.lifecycle import lifecycle_node
from catest_ai.tm.nodes.match_classify import match_classify_node
from catest_ai.tm.nodes.normalize import normalize_node
from catest_ai.tm.nodes.penalty import penalty_node
from catest_ai.tm.nodes.rank import rank_node


# ━━━━━━━━━━━━━━━━━━━━ Lookup State ━━━━━━━━━━━━━━━━━━━━


class TMLookupState(TypedDict, total=False):
    # Input
    source_text: str
    target_text: str
    prev_source: str
    next_source: str
    tm_banks: list[str]
    primary_bank: str
    domain: str
    min_fuzzy_score: int
    max_results: int
    enable_fragments: bool
    enable_ice: bool

    # Normalize output
    normalized_source: str
    source_tags: list[str]

    # Match output
    tm_matches: list[TMMatchResult]
    source_vector: list[float] | None

    # Fragment output
    fragment_matches: list[TMMatchResult]

    # Final output
    best_match_type: TMMatchType
    best_match_score: int
    auto_populate_target: str | None


def build_tm_lookup_graph():
    """TM lookup pipeline — mirrors Trados/memoQ TM search behavior.

    normalize → match_classify → penalty → fragment_assembly → rank
    """
    graph = StateGraph(TMLookupState)

    graph.add_node("normalize", normalize_node)
    graph.add_node("match_classify", match_classify_node)
    graph.add_node("penalty", penalty_node)
    graph.add_node("fragment_assembly", fragment_assembly_node)
    graph.add_node("rank", rank_node)

    graph.set_entry_point("normalize")
    graph.add_edge("normalize", "match_classify")
    graph.add_edge("match_classify", "penalty")
    graph.add_edge("penalty", "fragment_assembly")
    graph.add_edge("fragment_assembly", "rank")
    graph.add_edge("rank", END)

    return graph.compile()


# ━━━━━━━━━━━━━━━━━━━━ Enrichment State ━━━━━━━━━━━━━━━━━━━━


class TMEnrichState(TypedDict, total=False):
    # Input
    source_text: str
    target_text: str

    # Normalize
    normalized_source: str
    source_tags: list[str]

    # Dedup
    is_duplicate: bool
    source_vector: list[float] | None

    # Lifecycle
    quality_score: float
    lifecycle_action: str       # add | review | reject | skip
    tags: list[str]
    domain: str
    quality_issues: list[str]
    lifecycle_reason: str


def route_after_dedup(state: TMEnrichState) -> str:
    if state.get("is_duplicate"):
        return "end"
    return "lifecycle"


def build_tm_enrich_graph():
    """TM enrichment pipeline — quality gate + lifecycle management.

    normalize → dedup → [skip if dup] → lifecycle
    """
    graph = StateGraph(TMEnrichState)

    graph.add_node("normalize", normalize_node)
    graph.add_node("dedup", dedup_node)
    graph.add_node("lifecycle", lifecycle_node)

    graph.set_entry_point("normalize")
    graph.add_edge("normalize", "dedup")
    graph.add_conditional_edges("dedup", route_after_dedup, {
        "end": END,
        "lifecycle": "lifecycle",
    })
    graph.add_edge("lifecycle", END)

    return graph.compile()


# ━━━━━━━━━━━ Compiled Graphs (singletons) ━━━━━━━━━━━

tm_lookup_graph = build_tm_lookup_graph()
tm_enrich_graph = build_tm_enrich_graph()
