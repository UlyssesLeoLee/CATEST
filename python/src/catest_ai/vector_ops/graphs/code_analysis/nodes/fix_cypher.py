"""fix_cypher node — LLM repairs structurally or semantically invalid Cypher.

Receives combined error signal from:
  - validate_cypher  → structural errors (syntax, missing name property, etc.)
  - semantic_validate → semantic feedback (wrong entity names, missing relationships)

The enriched prompt gives the LLM both the original code inventory AND the
specific critique, significantly improving one-shot fix success rate.
"""

from __future__ import annotations

import logging

from langsmith import traceable

from catest_ai.common.llm import get_llm_nim
from catest_ai.vector_ops.graphs.code_analysis.nodes.generate_cypher import (
    _build_annotation,
    _parse_statements,
)

logger = logging.getLogger(__name__)

_SYSTEM = """\
You are a Cypher repair specialist. You will receive:
1. Source code that was analyzed
2. Cypher MERGE statements that were generated but contain errors
3. Structural validation errors (syntax, missing properties)
4. Semantic feedback (accuracy issues — wrong names, missing entities)

Your task: output CORRECTED Cypher MERGE statements that fix ALL listed issues.

Rules:
- Use MERGE (never CREATE).
- Node labels must use prefix "{prefix}_".
- Every node must have `name` and `kind` properties.
- Use relationship types: CONTAINS CALLS IMPORTS EXTENDS IMPLEMENTS USES RETURNS ACCEPTS_PARAM DECORATES.
- Output ONLY Cypher. One statement per line, each ending with semicolon.
- No markdown, no prose, no comments.
- Language: {language}
"""


@traceable(name="code_analysis.fix_cypher")
async def fix_cypher_node(state: dict) -> dict:
    """Ask LLM to repair structurally and semantically invalid Cypher."""
    code_chunk: str    = state.get("code_chunk") or state.get("code_body") or state.get("code", "")
    raw_cypher: str    = state.get("raw_cypher", "")
    struct_errors: list[str] = state.get("validation_errors", [])
    semantic_fb: str   = state.get("semantic_feedback", "")
    retry_count: int   = state.get("retry_count", 0)
    language: str      = state.get("detected_language", "unknown")
    prefix: str        = state.get("prefix", "Code")
    classes: list      = state.get("class_list", [])
    functions: list    = state.get("function_list", [])

    system = _SYSTEM.format(prefix=prefix, language=language)

    # Build a combined error section (structural + semantic)
    error_parts: list[str] = []
    if struct_errors:
        error_parts.append("Structural errors:\n" + "\n".join(f"  - {e}" for e in struct_errors))
    if semantic_fb and "skipped" not in semantic_fb.lower():
        error_parts.append(f"Semantic feedback:\n  - {semantic_fb}")
    if not error_parts:
        error_parts.append("(No specific errors — please improve completeness)")

    # Give LLM the structural inventory as a grounding hint
    inventory = ""
    if classes:
        inventory += f"Known classes/types: {', '.join(classes[:12])}\n"
    if functions:
        inventory += f"Known functions: {', '.join(functions[:18])}\n"

    human_msg = (
        f"{inventory}\n"
        f"Source code (language={language}):\n```{language}\n{code_chunk[:3000]}\n```\n\n"
        f"Existing Cypher (attempt {retry_count + 1}):\n{raw_cypher[:2000]}\n\n"
        f"Issues to fix:\n" + "\n".join(error_parts) + "\n\n"
        "Output corrected Cypher statements only."
    )

    try:
        llm = get_llm_nim(temperature=0.05)
        response = await llm.ainvoke([("system", system), ("human", human_msg)])
        fixed_raw: str = response.content

        statements     = _parse_statements(fixed_raw)
        annotation_block = _build_annotation(statements, prefix, language)

        return {
            "raw_cypher":       fixed_raw,
            "statements":       statements,
            "annotation_block": annotation_block,
            "retry_count":      retry_count + 1,
        }
    except Exception as exc:
        logger.error("fix_cypher failed: %s", exc)
        return {
            "retry_count":  retry_count + 1,
            "abort_reason": f"fix_cypher LLM call failed: {exc}",
        }
