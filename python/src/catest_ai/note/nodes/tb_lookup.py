"""Node: TB consistency check — delegates to the TB check graph.

Wraps the TB pipeline (term_recognize → consistency_check) and converts
violations into NoteItem format for the auto-note workflow.
"""

from __future__ import annotations

import logging

from langsmith import traceable

from catest_ai.common.schemas import NoteItem, NoteType, TBViolationSeverity
from catest_ai.tb.graph import tb_check_graph

logger = logging.getLogger(__name__)


@traceable(name="note_tb_lookup")
async def tb_lookup_node(state: dict) -> dict:
    """Execute TB check pipeline and convert to notes."""
    check_input = {
        "source_text": state["source_text"],
        "target_text": state["target_text"],
        "tb_names": state.get("tb_names", ["default"]),
        "domain": state.get("domain", ""),
        "source_lang": state.get("source_lang", "en"),
        "target_lang": state.get("target_lang", "zh"),
        "check_morphological": True,
        "check_case_sensitive": False,
    }

    try:
        result = await tb_check_graph.ainvoke(check_input)
    except Exception as e:
        logger.error("TB check pipeline failed: %s", e)
        return {
            "tb_hits": [],
            "tb_violations": [],
            "tb_error_count": 0,
            "tb_warning_count": 0,
            "tb_passed": True,
            "notes": [],
        }

    hits = result.get("tb_hits", [])
    violations = result.get("tb_violations", [])
    error_count = result.get("tb_error_count", 0)
    warning_count = result.get("tb_warning_count", 0)

    # Convert violations to notes
    notes: list[NoteItem] = []
    for v in violations:
        if v.severity == TBViolationSeverity.ERROR:
            note_type = NoteType.TB_FORBIDDEN if "orbidden" in v.violation_message else NoteType.TB_WARNING
            notes.append(NoteItem(
                type=note_type,
                content=v.violation_message,
                score=1.0,
                severity=v.severity,
                metadata={
                    "source_term": v.term_entry.source_term,
                    "target_term": v.term_entry.target_term,
                    "status": v.term_entry.source_status.value,
                    "matched_form": v.matched_form,
                },
            ))
        elif v.severity == TBViolationSeverity.WARNING:
            notes.append(NoteItem(
                type=NoteType.TB_WARNING,
                content=v.violation_message,
                score=0.7,
                severity=v.severity,
                metadata={
                    "source_term": v.term_entry.source_term,
                    "status": v.term_entry.source_status.value,
                },
            ))

    # Also add info-level hits as positive signals
    clean_hits = [h for h in hits if h.severity is None and h.target_found]
    if clean_hits:
        terms_ok = ", ".join(h.term_entry.source_term for h in clean_hits[:5])
        notes.append(NoteItem(
            type=NoteType.TB_WARNING,
            content=f"Terminology OK: {terms_ok}",
            score=0.0,
            severity=None,
        ))

    return {
        "tb_hits": hits,
        "tb_violations": violations,
        "tb_error_count": error_count,
        "tb_warning_count": warning_count,
        "tb_passed": error_count == 0,
        "notes": notes,
    }
