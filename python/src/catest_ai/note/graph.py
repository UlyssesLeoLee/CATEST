"""LangGraph: CAT auto-note generation — the main translator-facing workflow.

Integrates TM lookup, TB check, QA rules, and LLM synthesis into a single
pipeline that mirrors what a translator sees in Trados/memoQ suggestion pane.

═══ Full Mode ═══
  tm_lookup → tb_check → qa_rules → llm_synthesize → END

═══ Fast Mode (skip TM/TB, no persistence) ═══
  llm_direct → END
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from langgraph.graph import END, StateGraph

from catest_ai.common.schemas import (
    NoteItem,
    TBRecognitionHit,
    TMMatchResult,
    TMMatchType,
)
from catest_ai.note.nodes.llm_review import llm_review_node
from catest_ai.note.nodes.qa_check import qa_check_node
from catest_ai.note.nodes.tb_lookup import tb_lookup_node
from catest_ai.note.nodes.tm_search import tm_search_node


# ━━━━━━━━━━━━━━━━━━━━ State ━━━━━━━━━━━━━━━━━━━━


class NoteState(TypedDict, total=False):
    # ─── Input ───
    source_text: str
    target_text: str
    prev_source: str
    next_source: str
    context: dict[str, Any]
    tm_banks: list[str]
    tb_names: list[str]
    primary_bank: str
    domain: str
    source_lang: str
    target_lang: str
    mode: str                    # "fast" | "full"

    # ─── TM Lookup results ───
    normalized_source: str
    tm_matches: list[TMMatchResult]
    fragment_matches: list[TMMatchResult]
    best_match_type: TMMatchType
    best_match_score: int
    auto_populate_target: str | None

    # ─── TB Check results ───
    tb_hits: list[TBRecognitionHit]
    tb_violations: list[TBRecognitionHit]
    tb_error_count: int
    tb_warning_count: int
    tb_passed: bool

    # ─── QA results ───
    qa_issues: list[str]

    # ─── Accumulated notes ───
    notes: Annotated[list[NoteItem], operator.add]

    # ─── Final output ───
    quality_score: float
    suggested_target: str | None
    auto_approved: bool


# ━━━━━━━━━━━━━━━━━━━━ Graph ━━━━━━━━━━━━━━━━━━━━


def route_by_mode(state: NoteState) -> str:
    if state.get("mode") == "fast":
        return "llm_direct"
    return "tm_lookup"


def build_note_graph():
    graph = StateGraph(NoteState)

    # Full pipeline nodes
    graph.add_node("tm_lookup", tm_search_node)
    graph.add_node("tb_check", tb_lookup_node)
    graph.add_node("qa_rules", qa_check_node)
    graph.add_node("llm_synthesize", llm_review_node)

    # Fast pipeline node (same LLM, no prior context)
    graph.add_node("llm_direct", llm_review_node)

    # Entry routing
    graph.set_conditional_entry_point(route_by_mode, {
        "tm_lookup": "tm_lookup",
        "llm_direct": "llm_direct",
    })

    # Full pipeline: sequential
    graph.add_edge("tm_lookup", "tb_check")
    graph.add_edge("tb_check", "qa_rules")
    graph.add_edge("qa_rules", "llm_synthesize")
    graph.add_edge("llm_synthesize", END)

    # Fast pipeline: straight to output
    graph.add_edge("llm_direct", END)

    return graph.compile()


note_graph = build_note_graph()
