"""Node: final ranking — merge full matches + fragments, determine best action.

This node determines what happens next in the CAT workflow:
- ICE/Exact → auto-populate + lock (translator sees pre-filled target)
- High fuzzy → suggest with edit highlighting
- Low fuzzy → concordance reference only
- Fragment → assembled suggestion available
- No match → leave empty for translator
"""

from __future__ import annotations

from langsmith import traceable

from catest_ai.common.schemas import TMMatchResult, TMMatchType


@traceable(name="tm_rank")
async def rank_node(state: dict) -> dict:
    """Merge and rank all TM results, determine best match classification."""
    full_matches: list[TMMatchResult] = state.get("tm_matches", [])
    fragment_matches: list[TMMatchResult] = state.get("fragment_matches", [])

    # Combine all matches
    all_matches = full_matches + fragment_matches

    if not all_matches:
        return {
            "tm_matches": [],
            "best_match_type": TMMatchType.NO_MATCH,
            "best_match_score": 0,
            "auto_populate_target": None,
        }

    # Best full-segment match
    best = all_matches[0]

    # Determine auto-populate behavior
    auto_populate_target = None
    if best.match_type == TMMatchType.ICE:
        # ICE: auto-fill + lock
        auto_populate_target = best.target_text
    elif best.match_type == TMMatchType.EXACT:
        # Exact: auto-fill (translator can still edit)
        auto_populate_target = best.target_text
    elif best.match_type == TMMatchType.FUZZY_HIGH and best.match_score >= 95:
        # Very high fuzzy (95-99%): auto-fill as suggestion
        auto_populate_target = best.target_text

    return {
        "tm_matches": all_matches,
        "best_match_type": best.match_type,
        "best_match_score": best.match_score,
        "auto_populate_target": auto_populate_target,
    }
