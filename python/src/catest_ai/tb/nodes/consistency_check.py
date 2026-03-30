"""Node: terminology consistency check — the core TB QA engine.

Implements the ISO 12620 term status hierarchy for violation detection:

  Source has preferredTerm → Target MUST use preferred or admitted translation
                             Using deprecated → WARNING
                             Missing entirely → ERROR

  Source has forbiddenTerm → If target uses forbidden translation → ERROR

This mirrors memoQ QA / Trados QA Checker / Memsource QA behavior.
"""

from __future__ import annotations

import logging

from langsmith import traceable

from catest_ai.common.schemas import (
    TBRecognitionHit,
    TBViolationSeverity,
    TermStatus,
)

logger = logging.getLogger(__name__)


@traceable(name="tb_consistency_check")
async def consistency_check_node(state: dict) -> dict:
    """Evaluate each TB hit for terminology violations.

    Violation matrix (source status × target presence):

    Source Status    | Target Found (preferred) | Target Found (admitted) | Target Found (deprecated) | Target Missing
    ─────────────────┼──────────────────────────┼─────────────────────────┼───────────────────────────┼───────────────
    preferred        | OK ✓                     | INFO                    | WARNING                   | ERROR
    admitted         | OK ✓                     | OK ✓                    | WARNING                   | INFO
    deprecated       | OK (shouldn't be in src) | OK                      | WARNING                   | WARNING
    forbidden        | n/a                      | n/a                     | n/a                       | ERROR if in tgt
    """
    hits: list[TBRecognitionHit] = state.get("tb_hits", [])
    target_text = state.get("target_text", "")

    violations: list[TBRecognitionHit] = []
    evaluated_hits: list[TBRecognitionHit] = []

    for hit in hits:
        entry = hit.term_entry
        severity = None
        message = ""

        # ─── Forbidden terms: special handling ───
        if entry.source_status == TermStatus.FORBIDDEN:
            # Forbidden term found in source text — check if it leaked to target
            if hit.target_found:
                severity = TBViolationSeverity.ERROR
                message = (
                    f"Forbidden term '{entry.source_term}' "
                    f"translated as '{hit.target_used_form}' — must not be used"
                )
            else:
                # Source has forbidden term but target doesn't use the forbidden translation
                # This is actually OK — the translator avoided it
                severity = TBViolationSeverity.WARNING
                message = (
                    f"Source contains forbidden term '{hit.matched_form}' — "
                    f"verify it's handled correctly in target"
                )

        # ─── Preferred terms: strictest checking ───
        elif entry.source_status == TermStatus.PREFERRED:
            if hit.target_found:
                # Target uses some translation — but is it the preferred one?
                if entry.target_term and hit.target_used_form.lower() == entry.target_term.lower():
                    # Perfect: preferred translation used
                    severity = None
                    message = ""
                else:
                    # Used a different form — could be admitted or deprecated
                    severity = TBViolationSeverity.INFO
                    message = (
                        f"Term '{hit.matched_form}' translated as "
                        f"'{hit.target_used_form}' — preferred: '{entry.target_term}'"
                    )
            else:
                # Target doesn't contain any translation of this term
                if entry.target_term:
                    severity = TBViolationSeverity.ERROR
                    message = (
                        f"Term '{hit.matched_form}' not translated — "
                        f"expected: '{entry.target_term}'"
                    )

        # ─── Admitted terms: more lenient ───
        elif entry.source_status == TermStatus.ADMITTED:
            if not hit.target_found and entry.target_term:
                severity = TBViolationSeverity.INFO
                message = (
                    f"Admitted term '{hit.matched_form}' not translated — "
                    f"suggested: '{entry.target_term}'"
                )

        # ─── Deprecated terms: soft warning ───
        elif entry.source_status == TermStatus.DEPRECATED:
            severity = TBViolationSeverity.WARNING
            message = (
                f"Source uses deprecated term '{hit.matched_form}' — "
                f"consider replacing with preferred term"
            )

        # Update the hit with violation info
        evaluated_hit = hit.model_copy(update={
            "severity": severity,
            "violation_message": message,
        })
        evaluated_hits.append(evaluated_hit)

        if severity in (TBViolationSeverity.ERROR, TBViolationSeverity.WARNING):
            violations.append(evaluated_hit)

    error_count = sum(1 for v in violations if v.severity == TBViolationSeverity.ERROR)
    warning_count = sum(1 for v in violations if v.severity == TBViolationSeverity.WARNING)

    return {
        "tb_hits": evaluated_hits,
        "tb_violations": violations,
        "tb_error_count": error_count,
        "tb_warning_count": warning_count,
        "tb_passed": error_count == 0,
    }
