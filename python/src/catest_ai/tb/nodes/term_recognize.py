"""Node: term recognition in source text — the first step of TB checking.

Mirrors MultiTerm/memoQ term recognition:
1. Scan source text against all TB entries
2. Match exact forms + morphological variants
3. Handle multi-word expressions
4. Report positions of matched terms

This is a deterministic node — no LLM needed.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from langsmith import traceable

from catest_ai.common.rust_client import rust_client
from catest_ai.common.schemas import TBRecognitionHit, TermEntry, TermStatus

logger = logging.getLogger(__name__)


@dataclass
class MatchCandidate:
    """Intermediate match result before full TB entry lookup."""

    term_entry: TermEntry
    start: int
    end: int
    matched_form: str


def _build_search_pattern(
    term: str,
    variants: list[str],
    case_sensitive: bool = False,
) -> re.Pattern:
    """Build a regex pattern that matches the term and all its variants.

    Uses word boundaries to avoid partial matches:
    'auth' should NOT match 'authentication' unless 'authentication' is a variant.
    """
    forms = [re.escape(term)] + [re.escape(v) for v in variants]
    # Sort by length descending so longer forms match first
    forms.sort(key=len, reverse=True)
    pattern_str = r"\b(?:" + "|".join(forms) + r")\b"
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.compile(pattern_str, flags)


def _find_in_target(
    target_text: str,
    target_term: str,
    target_variants: list[str] | None = None,
    case_sensitive: bool = False,
) -> tuple[bool, int, int, str]:
    """Check if the expected target term (or variants) exists in target text."""
    if not target_term:
        return False, 0, 0, ""

    forms = [target_term]
    if target_variants:
        forms.extend(target_variants)

    for form in forms:
        pattern = re.compile(
            r"\b" + re.escape(form) + r"\b" if re.search(r"[a-zA-Z]", form)
            else re.escape(form),
            0 if case_sensitive else re.IGNORECASE,
        )
        match = pattern.search(target_text)
        if match:
            return True, match.start(), match.end(), form

    return False, 0, 0, ""


@traceable(name="tb_term_recognize")
async def term_recognize_node(state: dict) -> dict:
    """Scan source text and recognize TB terms with their positions."""
    source = state["source_text"]
    target = state["target_text"]
    case_sensitive = state.get("check_case_sensitive", False)
    check_morphological = state.get("check_morphological", True)

    # Fetch TB entries from Rust Gateway
    try:
        raw_terms = await rust_client.get_terms()
    except Exception as e:
        logger.warning("TB fetch failed: %s", e)
        return {"tb_hits": []}

    # Build TermEntry objects
    term_entries = []
    for t in raw_terms:
        variants = t.get("morphological_variants", [])
        if not variants and check_morphological:
            # Basic English morphological expansion for source terms
            base = t.get("source_term", "")
            variants = _basic_morpho_expand(base)

        status = t.get("status", t.get("source_status", "preferredTerm"))
        try:
            term_status = TermStatus(status)
        except ValueError:
            term_status = TermStatus.PREFERRED if not t.get("forbidden") else TermStatus.FORBIDDEN

        term_entries.append(TermEntry(
            id=t.get("id", ""),
            source_term=t.get("source_term", ""),
            target_term=t.get("target_term", ""),
            source_status=term_status,
            target_status=term_status,
            morphological_variants=variants,
            definition=t.get("definition", ""),
            domain=t.get("domain", ""),
            tb_name=t.get("tb_name", "default"),
            part_of_speech=t.get("part_of_speech", ""),
        ))

    # Scan source text for each term
    hits: list[TBRecognitionHit] = []
    matched_ranges: list[tuple[int, int]] = []  # avoid overlapping matches

    # Sort by term length descending (longer terms first to handle MWE)
    term_entries.sort(key=lambda t: len(t.source_term), reverse=True)

    for entry in term_entries:
        if not entry.source_term:
            continue

        pattern = _build_search_pattern(
            entry.source_term,
            entry.morphological_variants,
            case_sensitive,
        )

        for match in pattern.finditer(source):
            start, end = match.start(), match.end()

            # Skip if overlapping with a longer term already matched
            if any(s <= start < e or s < end <= e for s, e in matched_ranges):
                continue
            matched_ranges.append((start, end))

            # Check target text for expected translation
            tgt_found, tgt_start, tgt_end, tgt_form = _find_in_target(
                target, entry.target_term, None, case_sensitive
            )

            hits.append(TBRecognitionHit(
                term_entry=entry,
                source_position=(start, end),
                matched_form=match.group(),
                target_found=tgt_found,
                target_position=(tgt_start, tgt_end),
                target_used_form=tgt_form,
            ))

    return {"tb_hits": hits}


def _basic_morpho_expand(term: str) -> list[str]:
    """Generate basic English morphological variants.

    Simple rule-based expansion — not a full stemmer, but covers
    the most common inflections for technical terms.
    """
    if not term or not term.isascii():
        return []

    variants: set[str] = set()
    lower = term.lower()

    # Plural forms
    if lower.endswith("y") and len(lower) > 2 and lower[-2] not in "aeiou":
        variants.add(lower[:-1] + "ies")
    elif lower.endswith(("s", "sh", "ch", "x", "z")):
        variants.add(lower + "es")
    else:
        variants.add(lower + "s")

    # -ing forms
    if lower.endswith("e") and not lower.endswith("ee"):
        variants.add(lower[:-1] + "ing")
    else:
        variants.add(lower + "ing")

    # -ed forms
    if lower.endswith("e"):
        variants.add(lower + "d")
    elif lower.endswith("y") and len(lower) > 2 and lower[-2] not in "aeiou":
        variants.add(lower[:-1] + "ied")
    else:
        variants.add(lower + "ed")

    # -er, -tion/-sion
    if lower.endswith("ate"):
        variants.add(lower[:-3] + "ation")
    if lower.endswith("ify"):
        variants.add(lower[:-3] + "ification")

    # Remove identity
    variants.discard(lower)
    return list(variants)
