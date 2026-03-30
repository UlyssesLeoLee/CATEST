"""Node: segment normalization — the first step in all CAT TM lookup.

Mirrors Trados/memoQ normalization before matching:
- Strip inline tags (<b>, <i>, {1}, etc.)
- Normalize whitespace (collapse multiple spaces, trim)
- Normalize Unicode (NFC)
- Optionally lowercase for matching (preserve original)
"""

from __future__ import annotations

import re
import unicodedata

from langsmith import traceable


# ─── Normalization Functions ───

# Common CAT inline tag patterns
_TAG_PATTERNS = [
    re.compile(r"<[^>]+>"),               # HTML/XML tags: <b>, </i>, <br/>
    re.compile(r"\{[0-9]+\}"),            # Numbered placeholders: {1}, {2}
    re.compile(r"&[a-zA-Z]+;"),           # HTML entities: &amp;, &lt;
    re.compile(r"\\[nrt]"),               # Escape sequences: \n, \t
]


def normalize_segment(text: str) -> str:
    """Normalize a translation segment for TM matching.

    Returns a cleaned version suitable for edit-distance comparison.
    The original text is preserved separately for display.
    """
    result = text

    # 1. Unicode NFC normalization
    result = unicodedata.normalize("NFC", result)

    # 2. Strip inline tags (preserve content between tags)
    for pattern in _TAG_PATTERNS:
        result = pattern.sub("", result)

    # 3. Normalize whitespace
    result = re.sub(r"\s+", " ", result).strip()

    return result


def extract_tags(text: str) -> list[str]:
    """Extract all inline tags from a segment for tag-consistency checks."""
    tags = []
    for pattern in _TAG_PATTERNS:
        tags.extend(pattern.findall(text))
    return tags


def compute_edit_distance(s1: str, s2: str) -> int:
    """Levenshtein edit distance — word-level for better fuzzy scoring.

    Traditional CAT tools use word-level edit distance, not character-level,
    because it better reflects translation unit similarity.
    """
    words1 = s1.lower().split()
    words2 = s2.lower().split()

    m, n = len(words1), len(words2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if words1[i - 1] == words2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])

    return dp[m][n]


def compute_fuzzy_score(source: str, tm_source: str) -> int:
    """Compute fuzzy match percentage (0-100) — Trados-compatible algorithm.

    score = 100 * (1 - edit_distance / max(len(s1), len(s2)))
    Using word-level edit distance.
    """
    s1_norm = normalize_segment(source)
    s2_norm = normalize_segment(tm_source)

    if s1_norm == s2_norm:
        return 100

    words1 = s1_norm.lower().split()
    words2 = s2_norm.lower().split()
    max_len = max(len(words1), len(words2))

    if max_len == 0:
        return 100 if not words1 and not words2 else 0

    dist = compute_edit_distance(s1_norm, s2_norm)
    score = int(100 * (1 - dist / max_len))
    return max(0, score)


def generate_diff(source: str, tm_source: str) -> str:
    """Generate a simple word-level diff for display.

    Marks added words with [+word] and removed words with [-word].
    """
    src_words = source.lower().split()
    tm_words = tm_source.lower().split()

    # Simple set-based diff (not a full diff algorithm, but useful for display)
    src_set = set(src_words)
    tm_set = set(tm_words)

    added = src_set - tm_set
    removed = tm_set - src_set

    if not added and not removed:
        return ""

    parts = []
    if removed:
        parts.append(f"[-{' '.join(sorted(removed))}]")
    if added:
        parts.append(f"[+{' '.join(sorted(added))}]")

    return " ".join(parts)


@traceable(name="tm_normalize")
async def normalize_node(state: dict) -> dict:
    """Normalize source text for TM matching. Preserve original for display."""
    source = state["source_text"]

    normalized = normalize_segment(source)
    tags = extract_tags(source)

    return {
        "normalized_source": normalized,
        "source_tags": tags,
    }
