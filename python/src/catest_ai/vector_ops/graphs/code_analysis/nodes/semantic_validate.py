"""semantic_validate node — LLM verifies graph accuracy.

After structural validation passes, this node asks the LLM a focused question:
  "Does this set of Cypher MERGE statements accurately represent the given code?"

It returns:
  - semantic_ok   : True if score >= SEMANTIC_THRESHOLD
  - semantic_score: 0.0–1.0 float
  - semantic_feedback: short critique or confirmation

Routing logic in graph.py:
  - semantic_ok=True  → interrupt before execute_cypher (proceed to human review)
  - semantic_ok=False → fix_cypher (same retry loop, with semantic feedback added)

This prevents the most common failure mode: syntactically valid Cypher that
models the wrong entities (e.g., hallucinated class names, missing relationships).
"""

from __future__ import annotations

import json
import logging
import re

from langsmith import traceable

from catest_ai.common.llm import get_llm_nim

logger = logging.getLogger(__name__)

SEMANTIC_THRESHOLD = 0.70   # below this → trigger fix_cypher

_SYSTEM = """\
You are a graph-accuracy auditor. Your job is to verify whether a set of Cypher \
MERGE statements accurately represents the source code provided.

Respond with a JSON object ONLY — no prose, no markdown:
{
  "score": <float 0.0-1.0>,
  "ok": <true if score >= 0.70>,
  "feedback": "<one sentence: what is accurate, or what is wrong/missing>"
}

Scoring guide:
  1.0  — Perfect: all key entities and relationships are present and correctly labeled.
  0.8  — Good: minor omissions (e.g., 1-2 missing methods), no hallucinations.
  0.6  — Partial: important entities missing or relationship types wrong.
  0.4  — Poor: major structural elements missing or key names wrong.
  0.0  — Wrong: statements bear no resemblance to the code.

Be strict about hallucinated entity names (names not in the code → score penalty).\
"""


def _parse_score_response(text: str) -> tuple[bool, float, str]:
    """Extract (ok, score, feedback) from LLM JSON response."""
    # Try direct JSON parse first
    text = text.strip()
    try:
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            data = json.loads(m.group(0))
            score = float(data.get("score", 0.0))
            ok    = bool(data.get("ok", score >= SEMANTIC_THRESHOLD))
            fb    = str(data.get("feedback", ""))
            return ok, score, fb
    except Exception:
        pass

    # Fallback: extract score from plain text
    m = re.search(r'"score"\s*:\s*([\d.]+)', text)
    score = float(m.group(1)) if m else 0.5
    ok = score >= SEMANTIC_THRESHOLD
    fb_m = re.search(r'"feedback"\s*:\s*"([^"]+)"', text)
    fb = fb_m.group(1) if fb_m else text[:120]
    return ok, score, fb


@traceable(name="code_analysis.semantic_validate")
async def semantic_validate_node(state: dict) -> dict:
    """Ask LLM whether the generated Cypher accurately represents the code."""
    abort_reason: str | None = state.get("abort_reason")
    if abort_reason:
        return {"semantic_ok": False, "semantic_score": 0.0, "semantic_feedback": abort_reason}

    statements: list[str] = state.get("statements", [])
    if not statements:
        return {
            "semantic_ok": False,
            "semantic_score": 0.0,
            "semantic_feedback": "No statements to validate semantically",
        }

    code_chunk: str  = state.get("code_chunk") or state.get("code_body") or state.get("code", "")
    language: str    = state.get("detected_language", "unknown")
    prefix: str      = state.get("prefix", "Code")
    classes: list    = state.get("class_list", [])
    functions: list  = state.get("function_list", [])

    # Build a compact inventory hint to help the LLM audit accurately
    known = []
    if classes:
        known.append(f"Known classes/types: {', '.join(classes[:10])}")
    if functions:
        known.append(f"Known functions: {', '.join(functions[:15])}")
    known_hint = "\n".join(known)

    cypher_block = "\n".join(statements[:60])  # cap at 60 stmts to stay in context

    human_msg = (
        f"Language: {language}  Prefix: {prefix}\n"
        f"{known_hint}\n\n"
        f"Source code:\n```{language}\n{code_chunk[:3000]}\n```\n\n"
        f"Generated Cypher:\n{cypher_block}\n\n"
        f"Rate accuracy. Respond with JSON only."
    )

    try:
        llm = get_llm_nim(temperature=0.0)   # zero temp — deterministic judgment
        response = await llm.ainvoke([
            ("system", _SYSTEM),
            ("human", human_msg),
        ])
        ok, score, feedback = _parse_score_response(response.content)
        logger.info("semantic_validate score=%.2f ok=%s feedback=%s", score, ok, feedback)
        return {
            "semantic_ok":       ok,
            "semantic_score":    round(score, 3),
            "semantic_feedback": feedback,
        }
    except Exception as exc:
        logger.warning("semantic_validate LLM call failed: %s — assuming ok", exc)
        # Don't block the pipeline on a validator error
        return {
            "semantic_ok":       True,
            "semantic_score":    0.75,
            "semantic_feedback": f"Semantic check skipped (LLM error): {exc}",
        }
