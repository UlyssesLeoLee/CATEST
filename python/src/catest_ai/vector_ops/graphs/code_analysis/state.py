from __future__ import annotations

from typing import TypedDict


class CodeAnalysisState(TypedDict, total=False):
    # ── Input ────────────────────────────────────────────────────────────────
    code: str            # raw source code (may include existing annotation block)
    language: str        # language hint from user ("auto" or explicit)
    prefix: str          # Memgraph label prefix, e.g. "MyProject"
    file_name: str       # optional filename (e.g. "utils.ts"); "input" if absent

    # ── detect_language ──────────────────────────────────────────────────────
    detected_language: str   # resolved language after heuristic/LLM detection
    code_body: str           # code stripped of any existing /* annotation */ header
    existing_annotation: str # the /* annotation */ block that was stripped (if any)

    # ── enrich_context ───────────────────────────────────────────────────────
    # Structured pre-analysis — extracted without LLM, used to guide generation
    import_list: list[str]       # top-level imports / uses / requires
    class_list: list[str]        # top-level class / struct / trait names
    function_list: list[str]     # top-level function / method names
    complexity_hint: str         # "small" | "medium" | "large" (by line count)
    code_chunk: str              # truncated code sent to LLM (first N chars if large)

    # ── generate_cypher ──────────────────────────────────────────────────────
    raw_cypher: str          # full LLM output (may contain markdown fences)
    statements: list[str]    # parsed individual MERGE statements
    annotation_block: str    # formatted /* ... */ header ready for insertion

    # ── validate_cypher ──────────────────────────────────────────────────────
    is_valid: bool
    validation_errors: list[str]
    retry_count: int         # number of fix_cypher attempts so far

    # ── semantic_validate ────────────────────────────────────────────────────
    # LLM checks whether the generated graph accurately represents the code
    semantic_ok: bool            # True when LLM confirms graph is accurate
    semantic_score: float        # 0.0–1.0 confidence
    semantic_feedback: str       # LLM's critique / explanation

    # ── fix_cypher ───────────────────────────────────────────────────────────
    # (overwrites raw_cypher / statements on each fix iteration)

    # ── human_review  [interrupt before execute_cypher] ──────────────────────
    approved_annotation: str   # annotation_block, possibly edited by user

    # ── execute_cypher ───────────────────────────────────────────────────────
    nodes_upserted: int      # nodes created by MERGE (new + matched)
    edges_upserted: int      # relationships created by MERGE (new + matched)
    node_count: int          # alias kept for backward compat (= nodes_upserted)
    edge_count: int          # alias kept for backward compat (= edges_upserted)
    execution_errors: list[str]

    # ── post_import_suggest ──────────────────────────────────────────────────
    code_summary: str            # AI-generated natural language summary of code
    suggested_queries: list[str] # 3-5 Cypher queries to explore the imported graph

    # ── meta ─────────────────────────────────────────────────────────────────
    abort_reason: str | None   # set when graph aborts early
