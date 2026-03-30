"""Node: TM penalty system — adjusts match scores based on metadata.

Mirrors the Trados penalty model where match scores are reduced based on:
- Non-primary TM bank (-1%)
- Machine-translated entry (-5%)
- Old entry (>1 year: -1% per year, max -5%)
- Domain mismatch (-3%)
- Unverified translator (-2%)

Penalties are applied AFTER the raw fuzzy score is computed.
ICE/Exact matches are NOT penalized (industry convention).
"""

from __future__ import annotations

from datetime import datetime, timezone

from langsmith import traceable

from catest_ai.common.schemas import (
    TMMatchResult,
    TMMatchType,
    TMPenalty,
    TMPenaltyType,
)


def apply_penalties(
    match: TMMatchResult,
    *,
    primary_bank: str = "default",
    required_domain: str = "",
) -> TMMatchResult:
    """Apply all applicable penalties to a single TM match.

    ICE and Exact matches are exempt from penalties (CAT industry standard).
    """
    if match.match_type in (TMMatchType.ICE, TMMatchType.EXACT):
        return match

    penalties: list[TMPenalty] = []
    total = 0

    # 1. Multiple TM penalty: non-primary bank → -1%
    if match.tm_bank and match.tm_bank != primary_bank:
        p = TMPenalty(
            type=TMPenaltyType.MULTIPLE_TM,
            value=-1,
            reason=f"Non-primary TM bank '{match.tm_bank}'",
        )
        penalties.append(p)
        total += p.value

    # 2. Machine translation penalty → -5%
    if match.is_machine_translated:
        p = TMPenalty(
            type=TMPenaltyType.AUTO_TRANSLATED,
            value=-5,
            reason="Machine-translated entry",
        )
        penalties.append(p)
        total += p.value

    # 3. Age penalty → -1% per year beyond 1 year (max -5%)
    if match.created_at:
        now = datetime.now(timezone.utc)
        try:
            created = match.created_at
            if isinstance(created, str):
                created = datetime.fromisoformat(created)
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            age_years = (now - created).days / 365.25
            if age_years > 1:
                penalty_value = -min(int(age_years), 5)
                p = TMPenalty(
                    type=TMPenaltyType.AGE,
                    value=penalty_value,
                    reason=f"Entry is {age_years:.1f} years old",
                )
                penalties.append(p)
                total += p.value
        except (ValueError, TypeError):
            pass

    # 4. Domain mismatch → -3%
    if required_domain and match.domain and match.domain != required_domain:
        p = TMPenalty(
            type=TMPenaltyType.DOMAIN_MISMATCH,
            value=-3,
            reason=f"Domain '{match.domain}' ≠ required '{required_domain}'",
        )
        penalties.append(p)
        total += p.value

    # Apply penalties
    adjusted_score = max(0, match.raw_score + total)

    # Reclassify match type based on new score
    if adjusted_score >= 85:
        new_type = TMMatchType.FUZZY_HIGH
    elif adjusted_score >= 70:
        new_type = TMMatchType.FUZZY_MID
    elif adjusted_score >= 50:
        new_type = TMMatchType.FUZZY_LOW
    else:
        new_type = TMMatchType.NO_MATCH

    return match.model_copy(update={
        "match_score": adjusted_score,
        "match_type": new_type,
        "penalties": penalties,
        "total_penalty": total,
    })


@traceable(name="tm_penalty")
async def penalty_node(state: dict) -> dict:
    """Apply penalty system to all TM matches."""
    matches: list[TMMatchResult] = state.get("tm_matches", [])
    primary_bank = state.get("primary_bank", "default")
    domain = state.get("domain", "")
    min_score = state.get("min_fuzzy_score", 50)

    penalized = []
    for m in matches:
        result = apply_penalties(m, primary_bank=primary_bank, required_domain=domain)
        if result.match_score >= min_score:
            penalized.append(result)

    # Re-sort after penalties
    type_priority = {
        TMMatchType.ICE: 0, TMMatchType.EXACT: 1,
        TMMatchType.FUZZY_HIGH: 2, TMMatchType.FUZZY_MID: 3,
        TMMatchType.FUZZY_LOW: 4,
    }
    penalized.sort(key=lambda m: (type_priority.get(m.match_type, 9), -m.match_score))

    return {"tm_matches": penalized}
