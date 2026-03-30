"""Node: fragment/subsegment matching — assembles partial TM matches.

When no high-quality full-segment match exists, CAT tools like Trados
break the source into fragments (n-grams) and search TM for each fragment.
If enough fragments match, an assembled translation suggestion is built.

This is the "Concordance Search" + "Fragment Assembly" feature.
"""

from __future__ import annotations

import logging
import re

from langsmith import traceable

from catest_ai.common.embedding import embed_text
from catest_ai.common.qdrant_service import qdrant_service
from catest_ai.common.schemas import TMMatchResult, TMMatchType

logger = logging.getLogger(__name__)


def extract_ngrams(text: str, min_words: int = 2, max_words: int = 5) -> list[str]:
    """Extract word-level n-grams for fragment matching.

    Filters out very short or very long fragments.
    """
    words = text.split()
    ngrams = []

    for n in range(min_words, min(max_words + 1, len(words) + 1)):
        for i in range(len(words) - n + 1):
            fragment = " ".join(words[i : i + n])
            # Skip fragments that are just punctuation or numbers
            if re.search(r"[a-zA-Z\u4e00-\u9fff]", fragment):
                ngrams.append(fragment)

    return ngrams


@traceable(name="tm_fragment_assembly")
async def fragment_assembly_node(state: dict) -> dict:
    """Attempt fragment matching when no high-quality full match exists.

    Only runs when the best full match is below the fuzzy threshold.
    """
    tm_matches: list[TMMatchResult] = state.get("tm_matches", [])
    enable_fragments = state.get("enable_fragments", True)

    # Skip if we already have a good match (>= 70%)
    if tm_matches and tm_matches[0].match_score >= 70:
        return {"fragment_matches": []}

    if not enable_fragments:
        return {"fragment_matches": []}

    source = state["source_text"]
    fragments = extract_ngrams(source)

    if not fragments:
        return {"fragment_matches": []}

    # Search TM for each fragment, collect unique hits
    fragment_hits: list[TMMatchResult] = []
    seen_targets: set[str] = set()

    # Limit to best fragments (longest first, max 5 searches)
    fragments_sorted = sorted(fragments, key=len, reverse=True)[:5]

    for fragment in fragments_sorted:
        try:
            vector = await embed_text(fragment)
            results = await qdrant_service.search_similar(
                vector, top_k=2, score_threshold=0.8
            )
            for hit in results:
                p = hit.payload or {}
                tgt = p.get("target_text", "")
                if not tgt or tgt in seen_targets:
                    continue
                seen_targets.add(tgt)

                # Determine position of fragment in source
                frag_lower = fragment.lower()
                src_lower = source.lower()
                pos = src_lower.find(frag_lower)
                if pos == 0:
                    position = "start"
                elif pos + len(frag_lower) >= len(src_lower) - 1:
                    position = "end"
                else:
                    position = "middle"

                fragment_hits.append(TMMatchResult(
                    match_type=TMMatchType.FRAGMENT,
                    match_score=int(hit.score * 100),
                    raw_score=int(hit.score * 100),
                    source_text=p.get("source_text", ""),
                    target_text=tgt,
                    matched_fragment=fragment,
                    fragment_position=position,
                    tm_bank=p.get("tm_bank", ""),
                    domain=p.get("domain", ""),
                    quality_score=p.get("quality_score", 0.0),
                ))
        except Exception as e:
            logger.warning("Fragment search failed for '%s': %s", fragment[:30], e)

    fragment_hits.sort(key=lambda m: -m.match_score)
    return {"fragment_matches": fragment_hits[:5]}
