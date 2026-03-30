"""Node: domain classification for term candidates.

Assigns domain labels and term status recommendations.
Runs after dedup to classify only genuinely new candidates.
"""

from __future__ import annotations

import json
import logging

from langsmith import traceable

from catest_ai.common.llm import get_llm
from catest_ai.common.schemas import TermStatus

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a terminology management specialist. For each term candidate,
determine the appropriate ISO 12620 term status and domain classification.

Term status levels:
- "preferredTerm": This should be the standard, required translation
- "admittedTerm": An acceptable alternative translation
- "deprecatedTerm": An outdated or less accurate translation, use discouraged
- "forbiddenTerm": Must never be used (e.g., offensive, misleading)

For new terms being discovered, most should be "admittedTerm" until
a terminologist reviews and promotes to "preferredTerm".

Available domains:
[general, security, api, database, ui, networking, devops, auth,
 logging, testing, documentation, infrastructure, deployment,
 monitoring, performance, localization]

For each candidate, also assess:
- confidence: 0.0-1.0 (how certain this is a valid term)
- needs_review: true/false (should a human verify this)

Respond in JSON:
{
  "classified": [
    {
      "term": "authentication",
      "domain": "auth",
      "suggested_status": "preferredTerm",
      "confidence": 0.95,
      "needs_review": false,
      "rationale": "Core security concept with standard translation"
    }
  ]
}
"""


@traceable(name="tb_domain_classify")
async def domain_classify_node(state: dict) -> dict:
    """Classify new candidates by domain and recommend term status."""
    candidates = state.get("new_candidates", [])
    if not candidates:
        return {"scored_candidates": []}

    terms_desc = "\n".join(
        f"- {c['term']}"
        + (f" ({c.get('part_of_speech', '')})" if c.get("part_of_speech") else "")
        + (f": {c['definition']}" if c.get("definition") else "")
        + (f" [freq={c['frequency']}]" if c.get("frequency") else "")
        for c in candidates[:30]
    )

    llm = get_llm(temperature=0.0)
    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", f"Classify these term candidates:\n{terms_desc}"),
    ]

    try:
        response = await llm.ainvoke(messages)
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        result = json.loads(content.strip())

        classified_map = {c["term"].lower(): c for c in result.get("classified", [])}

        scored = []
        for cand in candidates:
            cls_data = classified_map.get(cand["term"].lower(), {})

            # Parse term status
            status_str = cls_data.get("suggested_status", "admittedTerm")
            try:
                suggested_status = TermStatus(status_str)
            except ValueError:
                suggested_status = TermStatus.ADMITTED

            scored.append({
                **cand,
                "domain": cls_data.get("domain", cand.get("domain", "general")),
                "suggested_status": suggested_status.value,
                "confidence": cls_data.get("confidence", 0.5),
                "needs_review": cls_data.get("needs_review", True),
                "classification_rationale": cls_data.get("rationale", ""),
            })

        return {"scored_candidates": scored}
    except Exception as e:
        logger.error("Domain classification failed: %s", e)
        return {
            "scored_candidates": [
                {**c, "domain": "general", "suggested_status": "admittedTerm",
                 "confidence": 0.5, "needs_review": True}
                for c in candidates
            ]
        }
