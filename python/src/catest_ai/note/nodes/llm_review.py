"""Node: LLM-powered comprehensive review — synthesizes TM/TB/QA results.

The LLM receives the full context of all automated checks and produces:
1. A synthesized review note (actionable, concise)
2. An improved target suggestion if warranted
3. An overall quality score
4. Auto-approval decision

The prompt is designed to understand CAT-specific match types, term status
hierarchy, and QA violation severity levels.
"""

from __future__ import annotations

import json
import logging

from langsmith import traceable

from catest_ai.common.llm import get_llm
from catest_ai.common.schemas import NoteItem, NoteType, TMMatchType

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a senior translation reviewer in a Computer-Assisted Translation (CAT) tool.

You receive a source text, target text, and comprehensive automated check results:

**TM Matches** (Translation Memory):
- ICE (101%): Identical text with matching context — highest confidence
- Exact (100%): Identical text, different context
- Fuzzy (50-99%): Similar but not identical — check differences carefully
- Fragment: Partial matches for subsegments — use as reference only
- Penalties may apply (age, domain mismatch, machine-translated source)

**TB Violations** (Terminology):
- ERROR: Forbidden term used, or preferred term missing — must fix
- WARNING: Deprecated term in source, or non-preferred translation used
- INFO: Admitted alternative used instead of preferred (acceptable)

**QA Issues**:
- Placeholder mismatches, number inconsistencies, formatting errors

Your job:
1. Synthesize all information into a brief, actionable review note (2-3 sentences).
2. If the target has issues, suggest an improved translation.
3. Score overall quality (0.0 to 1.0):
   - 0.9+ = production ready
   - 0.7-0.9 = minor issues
   - 0.5-0.7 = significant issues
   - <0.5 = needs retranslation
4. Auto-approve only if: score >= 0.9, no TB errors, no QA critical issues,
   and either an ICE/Exact TM match exists or the LLM review is confident.

Respond in JSON:
{
  "review_note": "...",
  "suggested_target": "..." or null,
  "quality_score": 0.85,
  "auto_approved": false
}
"""


@traceable(name="note_llm_review")
async def llm_review_node(state: dict) -> dict:
    """Call Claude to synthesize all checks into a final review."""
    source = state["source_text"]
    target = state["target_text"]
    context = state.get("context", {})

    # Gather all prior check results
    tm_matches = state.get("tm_matches", [])
    best_type = state.get("best_match_type", TMMatchType.NO_MATCH)
    best_score = state.get("best_match_score", 0)
    tb_violations = state.get("tb_violations", [])
    tb_error_count = state.get("tb_error_count", 0)
    qa_issues = state.get("qa_issues", [])
    existing_notes = state.get("notes", [])

    # Serialize TM matches for LLM
    tm_summary = []
    for m in (tm_matches[:5] if tm_matches else []):
        entry = {
            "type": m.match_type.value if hasattr(m, "match_type") else str(m),
            "score": m.match_score if hasattr(m, "match_score") else 0,
            "target": m.target_text if hasattr(m, "target_text") else "",
        }
        if hasattr(m, "penalties") and m.penalties:
            entry["penalties"] = [
                {"type": p.type.value, "value": p.value} for p in m.penalties
            ]
        if hasattr(m, "diff_source") and m.diff_source:
            entry["diff"] = m.diff_source
        tm_summary.append(entry)

    # Serialize TB violations
    tb_summary = []
    for v in (tb_violations[:10] if tb_violations else []):
        tb_summary.append({
            "severity": v.severity.value if v.severity else "info",
            "message": v.violation_message,
            "term": v.term_entry.source_term if hasattr(v, "term_entry") else "",
        })

    checks = {
        "tm": {"best_type": best_type.value if hasattr(best_type, "value") else str(best_type),
               "best_score": best_score, "matches": tm_summary},
        "tb": {"error_count": tb_error_count, "violations": tb_summary},
        "qa": {"issues": qa_issues},
    }

    user_prompt = (
        f"Source: {source}\n"
        f"Target: {target}\n"
        f"Context: {json.dumps(context, ensure_ascii=False)}\n"
        f"Checks: {json.dumps(checks, ensure_ascii=False, default=str)}"
    )

    llm = get_llm(temperature=0.0)
    messages = [("system", SYSTEM_PROMPT), ("human", user_prompt)]

    try:
        response = await llm.ainvoke(messages)
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        result = json.loads(content.strip())
    except Exception as e:
        logger.error("LLM review failed: %s", e)
        result = {
            "review_note": "LLM review unavailable",
            "suggested_target": None,
            "quality_score": 0.5,
            "auto_approved": False,
        }

    notes = list(existing_notes)
    if result.get("review_note"):
        notes.append(NoteItem(
            type=NoteType.LLM_REVIEW,
            content=result["review_note"],
            score=result.get("quality_score", 0.5),
        ))

    return {
        "notes": notes,
        "quality_score": result.get("quality_score", 0.5),
        "suggested_target": result.get("suggested_target"),
        "auto_approved": result.get("auto_approved", False),
    }
