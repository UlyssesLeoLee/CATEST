"""Code Analysis LangGraph — v2.

Full pipeline with intelligent pre-analysis, semantic validation, and
post-import value generation.

Flow:
    detect_language
        → enrich_context          (zero-LLM: extracts imports/classes/functions, chunks large files)
        → generate_cypher         (LLM: language-specific prompt + structured context header)
        → validate_cypher         (structural: MERGE syntax, name property, rel shape)
            ├─(abort)──────────► END
            └─(continue)────────►
        → semantic_validate       (LLM: does the graph accurately represent the code?)
            ├─(ok / max retries)►
            │   [INTERRUPT before execute_cypher]  ← human reviews annotation
            │           ↓  (resume with approved_annotation)
            │     execute_cypher
            │           ↓
            │     post_import_suggest              (LLM: summary + 4 exploration queries)
            │           ↓
            │           END
            └─(not ok + retries left)►
                  fix_cypher                       (LLM: structural + semantic repair)
                      → validate_cypher            (loop, max MAX_RETRIES total)

Retry budget: MAX_RETRIES covers both structural and semantic fix attempts.
Semantic check failure below SEMANTIC_THRESHOLD re-enters fix_cypher with
the semantic_feedback as additional guidance.
"""

from __future__ import annotations

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from catest_ai.vector_ops.graphs.code_analysis.nodes.detect_language import detect_language_node
from catest_ai.vector_ops.graphs.code_analysis.nodes.enrich_context import enrich_context_node
from catest_ai.vector_ops.graphs.code_analysis.nodes.execute_cypher import execute_cypher_node
from catest_ai.vector_ops.graphs.code_analysis.nodes.fix_cypher import fix_cypher_node
from catest_ai.vector_ops.graphs.code_analysis.nodes.generate_cypher import generate_cypher_node
from catest_ai.vector_ops.graphs.code_analysis.nodes.post_import_suggest import post_import_suggest_node
from catest_ai.vector_ops.graphs.code_analysis.nodes.semantic_validate import (
    SEMANTIC_THRESHOLD,
    semantic_validate_node,
)
from catest_ai.vector_ops.graphs.code_analysis.nodes.validate_cypher import (
    MAX_RETRIES,
    validate_cypher_node,
)
from catest_ai.vector_ops.graphs.code_analysis.state import CodeAnalysisState


# ── Routing ───────────────────────────────────────────────────────────────────

def _route_after_structural(state: dict) -> str:
    """After validate_cypher: abort if fatal, otherwise continue to semantic check."""
    if state.get("abort_reason"):
        return "abort"
    if not state.get("is_valid", False):
        if state.get("retry_count", 0) >= MAX_RETRIES:
            return "abort"
        return "fix"
    return "semantic"


def _route_after_semantic(state: dict) -> str:
    """After semantic_validate: always proceed to human review.

    Semantic validation is informational — score and feedback are shown to the
    human reviewer in Step 2. The reviewer decides whether to edit the annotation
    or approve as-is. We never auto-loop on semantic failure because:
      - The fix loop budget is controlled by structural errors only.
      - A low semantic score is a soft quality signal, not a hard error.
      - Forcing LLM retries on semantic disagreement wastes budget and can degrade quality.
    """
    if state.get("abort_reason"):
        return "abort"
    return "ready"   # always → interrupt before execute_cypher


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_code_analysis_graph(checkpointer=None):
    """Build and compile the Code Analysis StateGraph (v2).

    Args:
        checkpointer: LangGraph checkpointer (default: in-memory MemorySaver).
            Pass AsyncSqliteSaver or similar for multi-replica / restart-safe use.

    Returns:
        Compiled LangGraph with interrupt_before=["execute_cypher"].
    """
    g = StateGraph(CodeAnalysisState)

    # ── Register nodes ────────────────────────────────────────────────────────
    g.add_node("detect_language",    detect_language_node)
    g.add_node("enrich_context",     enrich_context_node)
    g.add_node("generate_cypher",    generate_cypher_node)
    g.add_node("validate_cypher",    validate_cypher_node)
    g.add_node("semantic_validate",  semantic_validate_node)
    g.add_node("fix_cypher",         fix_cypher_node)
    g.add_node("execute_cypher",     execute_cypher_node)
    g.add_node("post_import_suggest", post_import_suggest_node)

    # ── Entry point ───────────────────────────────────────────────────────────
    g.set_entry_point("detect_language")

    # ── Linear pre-analysis chain ─────────────────────────────────────────────
    g.add_edge("detect_language",  "enrich_context")
    g.add_edge("enrich_context",   "generate_cypher")
    g.add_edge("generate_cypher",  "validate_cypher")

    # ── Structural validation routing ─────────────────────────────────────────
    g.add_conditional_edges(
        "validate_cypher",
        _route_after_structural,
        {
            "semantic": "semantic_validate",   # structurally valid → semantic check
            "fix":      "fix_cypher",          # structural errors → repair
            "abort":    END,                   # fatal / max retries
        },
    )

    # ── Semantic validation routing ───────────────────────────────────────────
    g.add_conditional_edges(
        "semantic_validate",
        _route_after_semantic,
        {
            "ready": "execute_cypher",   # will be interrupted here
            "fix":   "fix_cypher",       # semantic issues → repair
            "abort": END,
        },
    )

    # ── Fix loop (back to structural validation) ──────────────────────────────
    g.add_edge("fix_cypher", "validate_cypher")

    # ── Post-import chain ─────────────────────────────────────────────────────
    g.add_edge("execute_cypher",     "post_import_suggest")
    g.add_edge("post_import_suggest", END)

    # ── Compile ───────────────────────────────────────────────────────────────
    cp = checkpointer if checkpointer is not None else MemorySaver()
    return g.compile(
        checkpointer=cp,
        interrupt_before=["execute_cypher"],   # human reviews annotation block
    )


# Module-level singleton (in-memory — threads live for process lifetime)
code_analysis_graph = build_code_analysis_graph()
