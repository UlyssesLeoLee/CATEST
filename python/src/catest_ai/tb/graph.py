"""LangGraph: TB workflows — check pipeline + discover pipeline.

═══ Check Pipeline (used by ai-note for CAT terminology QA) ═══
  term_recognize → consistency_check → END

═══ Discover Pipeline (used by ai-consumer for term extraction) ═══
  corpus_analyze → dedup → domain_classify → END
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from catest_ai.common.schemas import TBRecognitionHit, TBViolationSeverity
from catest_ai.tb.nodes.consistency_check import consistency_check_node
from catest_ai.tb.nodes.corpus_analyze import corpus_analyze_node
from catest_ai.tb.nodes.dedup import dedup_node
from catest_ai.tb.nodes.domain_classify import domain_classify_node
from catest_ai.tb.nodes.term_recognize import term_recognize_node


# ━━━━━━━━━━━━━━━━━━━━ Check State ━━━━━━━━━━━━━━━━━━━━


class TBCheckState(TypedDict, total=False):
    # Input
    source_text: str
    target_text: str
    tb_names: list[str]
    domain: str
    source_lang: str
    target_lang: str
    check_morphological: bool
    check_case_sensitive: bool

    # Recognition output
    tb_hits: list[TBRecognitionHit]

    # Consistency output
    tb_violations: list[TBRecognitionHit]
    tb_error_count: int
    tb_warning_count: int
    tb_passed: bool


def build_tb_check_graph():
    """TB check pipeline — mirrors memoQ QA / Trados QA Checker.

    term_recognize → consistency_check
    """
    graph = StateGraph(TBCheckState)

    graph.add_node("term_recognize", term_recognize_node)
    graph.add_node("consistency_check", consistency_check_node)

    graph.set_entry_point("term_recognize")
    graph.add_edge("term_recognize", "consistency_check")
    graph.add_edge("consistency_check", END)

    return graph.compile()


# ━━━━━━━━━━━━━━━━━━━━ Discover State ━━━━━━━━━━━━━━━━━━━━


class TBDiscoverState(TypedDict, total=False):
    # Input
    texts: list[str]
    text: str                            # single text fallback
    source_lang: str
    target_lang: str
    domain: str
    min_frequency: int
    existing_tb_names: list[str]

    # Corpus analysis output
    candidates: list[dict[str, Any]]

    # After dedup
    new_candidates: list[dict[str, Any]]

    # After domain classification
    scored_candidates: list[dict[str, Any]]


def build_tb_discover_graph():
    """TB discovery pipeline — corpus analysis + classification.

    corpus_analyze → dedup → domain_classify
    """
    graph = StateGraph(TBDiscoverState)

    graph.add_node("corpus_analyze", corpus_analyze_node)
    graph.add_node("dedup", dedup_node)
    graph.add_node("domain_classify", domain_classify_node)

    graph.set_entry_point("corpus_analyze")
    graph.add_edge("corpus_analyze", "dedup")
    graph.add_edge("dedup", "domain_classify")
    graph.add_edge("domain_classify", END)

    return graph.compile()


# ━━━━━━━━━━━ Compiled Graphs (singletons) ━━━━━━━━━━━

tb_check_graph = build_tb_check_graph()
tb_discover_graph = build_tb_discover_graph()
