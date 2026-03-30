"""Node: score candidate terms for confidence / relevance."""

from __future__ import annotations

import json
import logging

from langsmith import traceable

from catest_ai.common.llm import get_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a terminology quality assessor. For each candidate term, evaluate:
1. Is it a genuine technical term (not a common word)?
2. Does it need standardized translation?
3. Confidence score (0.0 to 1.0).

Respond in JSON:
{
  "scored": [
    {"term": "authentication", "confidence": 0.95, "reason": "core security concept"},
    {"term": "the", "confidence": 0.0, "reason": "common word, not a term"}
  ]
}
"""


@traceable(name="tb_confidence")
async def confidence_node(state: dict) -> dict:
    """Score each candidate term for confidence."""
    candidates = state.get("new_candidates", [])
    if not candidates:
        return {"scored_candidates": []}

    terms_text = "\n".join(
        f"- {c['term']}: {c.get('definition', 'N/A')}" for c in candidates
    )

    llm = get_llm(temperature=0.0)
    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", f"Score these candidate terms:\n{terms_text}"),
    ]

    try:
        response = await llm.ainvoke(messages)
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        result = json.loads(content.strip())

        scored = result.get("scored", [])
        # Merge scores back into candidates
        score_map = {s["term"].lower(): s for s in scored}

        scored_candidates = []
        for c in candidates:
            score_info = score_map.get(c["term"].lower(), {})
            scored_candidates.append({
                **c,
                "confidence": score_info.get("confidence", 0.5),
                "score_reason": score_info.get("reason", ""),
            })

        return {"scored_candidates": scored_candidates}
    except Exception as e:
        logger.error("Confidence scoring failed: %s", e)
        return {
            "scored_candidates": [{**c, "confidence": 0.5} for c in candidates]
        }
