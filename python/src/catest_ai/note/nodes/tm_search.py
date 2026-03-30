"""Node: TM lookup — delegates to the full TM lookup graph.

This wraps the TM lookup pipeline (normalize → match → penalty → fragment → rank)
and converts results into NoteItem format for the auto-note workflow.
"""

from __future__ import annotations

import logging

from langsmith import traceable

from catest_ai.common.schemas import NoteItem, NoteType, TMMatchType
from catest_ai.tm.graph import tm_lookup_graph

logger = logging.getLogger(__name__)

# Match type → display label mapping
_MATCH_LABELS = {
    TMMatchType.ICE: "ICE 101%",
    TMMatchType.EXACT: "Exact 100%",
    TMMatchType.FUZZY_HIGH: "High Fuzzy",
    TMMatchType.FUZZY_MID: "Mid Fuzzy",
    TMMatchType.FUZZY_LOW: "Low Fuzzy",
    TMMatchType.FRAGMENT: "Fragment",
    TMMatchType.MT: "MT",
}


@traceable(name="note_tm_search")
async def tm_search_node(state: dict) -> dict:
    """Execute full TM lookup pipeline and convert to notes."""
    lookup_input = {
        "source_text": state["source_text"],
        "target_text": state.get("target_text", ""),
        "prev_source": state.get("prev_source", ""),
        "next_source": state.get("next_source", ""),
        "tm_banks": state.get("tm_banks", ["default"]),
        "primary_bank": state.get("primary_bank", "default"),
        "domain": state.get("domain", ""),
        "min_fuzzy_score": 50,
        "max_results": 5,
        "enable_fragments": True,
        "enable_ice": True,
    }

    try:
        result = await tm_lookup_graph.ainvoke(lookup_input)
    except Exception as e:
        logger.error("TM lookup pipeline failed: %s", e)
        return {
            "tm_matches": [],
            "fragment_matches": [],
            "best_match_type": TMMatchType.NO_MATCH,
            "best_match_score": 0,
            "auto_populate_target": None,
            "notes": [],
        }

    tm_matches = result.get("tm_matches", [])
    best_type = result.get("best_match_type", TMMatchType.NO_MATCH)
    best_score = result.get("best_match_score", 0)
    auto_target = result.get("auto_populate_target")

    # Convert TM matches to notes
    notes: list[NoteItem] = []

    for match in tm_matches:
        label = _MATCH_LABELS.get(match.match_type, str(match.match_type))
        penalty_info = ""
        if match.total_penalty < 0:
            penalty_info = f" (penalty: {match.total_penalty}%)"

        if match.match_type == TMMatchType.FRAGMENT:
            content = (
                f"Fragment match [{match.matched_fragment}] → "
                f"'{match.target_text}'{penalty_info}"
            )
            notes.append(NoteItem(
                type=NoteType.FRAGMENT_ASSEMBLY,
                content=content,
                score=match.match_score / 100.0,
                metadata={"fragment": match.matched_fragment, "position": match.fragment_position},
            ))
        else:
            content = (
                f"{label} ({match.match_score}%): "
                f"'{match.target_text}'{penalty_info}"
            )
            if match.diff_source:
                content += f" | Diff: {match.diff_source}"

            notes.append(NoteItem(
                type=NoteType.TM_MATCH,
                content=content,
                score=match.match_score / 100.0,
                metadata={
                    "match_type": match.match_type.value,
                    "raw_score": match.raw_score,
                    "tm_bank": match.tm_bank,
                    "domain": match.domain,
                },
            ))

    # Auto-propagation note
    if auto_target and best_type in (TMMatchType.ICE, TMMatchType.EXACT):
        notes.append(NoteItem(
            type=NoteType.AUTO_PROPAGATION,
            content=f"Auto-populated from {_MATCH_LABELS[best_type]} match",
            score=1.0,
        ))

    return {
        "tm_matches": tm_matches,
        "fragment_matches": result.get("fragment_matches", []),
        "best_match_type": best_type,
        "best_match_score": best_score,
        "auto_populate_target": auto_target,
        "notes": notes,
    }
