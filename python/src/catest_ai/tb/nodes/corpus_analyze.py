"""Node: corpus-based term candidate extraction.

Combines statistical methods with LLM analysis for term discovery:
1. Frequency analysis — repeated technical phrases
2. C-value/NC-value — multi-word term extraction heuristic
3. LLM-assisted extraction — catches domain-specific terms that
   statistical methods miss
"""

from __future__ import annotations

import json
import logging
import re
from collections import Counter

from langsmith import traceable

from catest_ai.common.llm import get_llm

logger = logging.getLogger(__name__)


def extract_ngram_candidates(
    texts: list[str],
    min_freq: int = 2,
    min_words: int = 1,
    max_words: int = 4,
) -> list[dict]:
    """Statistical term extraction using frequency analysis.

    Returns candidate terms sorted by frequency × length score.
    """
    # Tokenize and extract n-grams
    ngram_counter: Counter = Counter()

    for text in texts:
        # Basic tokenization: split on non-alphanum (keep CJK chars as single tokens)
        words = re.findall(r"[a-zA-Z]+(?:[-_][a-zA-Z]+)*|[\u4e00-\u9fff]+", text)

        for n in range(min_words, min(max_words + 1, len(words) + 1)):
            for i in range(len(words) - n + 1):
                gram = " ".join(words[i : i + n])
                # Filter: must contain at least one alphabetic char
                if re.search(r"[a-zA-Z]", gram) and len(gram) > 2:
                    ngram_counter[gram.lower()] += 1

    # Filter by minimum frequency
    candidates = []
    for gram, freq in ngram_counter.most_common():
        if freq < min_freq:
            break
        # C-value inspired score: frequency × log(word_count + 1)
        word_count = len(gram.split())
        import math
        score = freq * math.log2(word_count + 1)
        candidates.append({
            "term": gram,
            "frequency": freq,
            "word_count": word_count,
            "c_value_score": round(score, 2),
        })

    # Sort by score descending
    candidates.sort(key=lambda x: x["c_value_score"], reverse=True)
    return candidates[:50]  # cap at 50 candidates


SYSTEM_PROMPT = """\
You are a terminology extraction specialist for software localization.

Given a list of statistically extracted term candidates from a corpus,
along with a sample of the source text, evaluate each candidate:

1. Is it a genuine technical/domain term? (not a common phrase)
2. What is the likely part of speech? (noun, verb, adjective, compound)
3. Suggest a brief definition.
4. Assign a domain label.
5. Suggest a target language translation if possible.

Also identify any important terms in the sample text that the statistical
extraction may have missed.

Respond in JSON:
{
  "evaluated": [
    {
      "term": "rate limiting",
      "is_term": true,
      "part_of_speech": "noun",
      "definition": "Controlling the rate of requests to prevent abuse",
      "domain": "api",
      "suggested_translation": "速率限制"
    }
  ],
  "additional_terms": [
    {
      "term": "webhook",
      "part_of_speech": "noun",
      "definition": "HTTP callback for event notifications",
      "domain": "api",
      "suggested_translation": "网络钩子"
    }
  ]
}
"""


@traceable(name="tb_corpus_analyze")
async def corpus_analyze_node(state: dict) -> dict:
    """Combined statistical + LLM term extraction from corpus."""
    texts = state.get("texts", [])
    if not texts:
        text = state.get("text", "")
        texts = [text] if text else []

    if not texts:
        return {"candidates": []}

    min_freq = state.get("min_frequency", 2)
    target_lang = state.get("target_lang", "zh")

    # 1. Statistical extraction
    stat_candidates = extract_ngram_candidates(texts, min_freq=min_freq)

    if not stat_candidates:
        return {"candidates": []}

    # 2. LLM evaluation of statistical candidates
    sample_text = "\n\n".join(t[:500] for t in texts[:3])
    candidate_list = "\n".join(
        f"- {c['term']} (freq={c['frequency']})" for c in stat_candidates[:30]
    )

    llm = get_llm(temperature=0.0)
    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", (
            f"Target language: {target_lang}\n\n"
            f"Statistical candidates:\n{candidate_list}\n\n"
            f"Sample text:\n{sample_text}"
        )),
    ]

    try:
        response = await llm.ainvoke(messages)
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        result = json.loads(content.strip())

        # Merge evaluated candidates
        candidates = []
        eval_map = {e["term"].lower(): e for e in result.get("evaluated", [])}

        for stat in stat_candidates:
            eval_data = eval_map.get(stat["term"].lower(), {})
            if eval_data and not eval_data.get("is_term", True):
                continue  # LLM says it's not a real term

            candidates.append({
                "term": stat["term"],
                "frequency": stat["frequency"],
                "c_value_score": stat["c_value_score"],
                "part_of_speech": eval_data.get("part_of_speech", ""),
                "definition": eval_data.get("definition", ""),
                "domain": eval_data.get("domain", ""),
                "suggested_translation": eval_data.get("suggested_translation", ""),
                "is_llm_validated": bool(eval_data),
            })

        # Add LLM-only discoveries
        for extra in result.get("additional_terms", []):
            candidates.append({
                "term": extra["term"],
                "frequency": 0,
                "c_value_score": 0.0,
                "part_of_speech": extra.get("part_of_speech", ""),
                "definition": extra.get("definition", ""),
                "domain": extra.get("domain", ""),
                "suggested_translation": extra.get("suggested_translation", ""),
                "is_llm_validated": True,
                "is_llm_discovered": True,
            })

        return {"candidates": candidates}
    except Exception as e:
        logger.error("LLM corpus analysis failed: %s", e)
        # Fall back to statistical candidates only
        return {"candidates": stat_candidates}
