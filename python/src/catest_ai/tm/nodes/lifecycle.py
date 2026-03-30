"""Node: TM entry lifecycle management — for the enrichment pipeline.

Handles the TM entry lifecycle:
1. Confirmed translation → add/update TM with quality boost
2. Rejected match → downgrade quality score
3. New translation (no match) → evaluate and add if quality passes
4. Auto-propagation → mark identical segments for batch update

This runs in the enrichment pipeline (not the lookup pipeline).
"""

from __future__ import annotations

import json
import logging

from langsmith import traceable

from catest_ai.common.llm import get_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a Translation Memory lifecycle manager for a CAT tool.
Given a translation pair and its metadata, determine the appropriate lifecycle action.

Evaluate:
1. Translation quality (accuracy, fluency, completeness): 0.0-1.0
2. Whether this is a useful TM entry (would help future translators)
3. Domain classification
4. Whether there are any quality issues that should prevent TM entry

Respond in JSON:
{
  "quality_score": 0.88,
  "is_useful_tm_entry": true,
  "domain": "security",
  "tags": ["auth", "error-handling"],
  "quality_issues": [],
  "lifecycle_action": "add",
  "reason": "High quality translation of auth error message"
}

lifecycle_action must be one of:
- "add": Quality entry, add to TM
- "review": Borderline quality, needs human review before adding
- "reject": Too low quality or problematic, do not add
- "update": Entry exists but this translation is better (higher quality)
"""


@traceable(name="tm_lifecycle")
async def lifecycle_node(state: dict) -> dict:
    """Evaluate TM entry quality and determine lifecycle action."""
    if state.get("is_duplicate"):
        return {
            "lifecycle_action": "skip",
            "quality_score": 0.0,
            "tags": [],
            "domain": "",
            "quality_issues": ["duplicate entry"],
        }

    source = state["source_text"]
    target = state["target_text"]

    llm = get_llm(temperature=0.0)
    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", f"Source: {source}\nTarget: {target}"),
    ]

    try:
        response = await llm.ainvoke(messages)
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        result = json.loads(content.strip())

        return {
            "quality_score": result.get("quality_score", 0.5),
            "lifecycle_action": result.get("lifecycle_action", "review"),
            "tags": result.get("tags", []),
            "domain": result.get("domain", "general"),
            "quality_issues": result.get("quality_issues", []),
            "lifecycle_reason": result.get("reason", ""),
        }
    except Exception as e:
        logger.error("Lifecycle evaluation failed: %s", e)
        return {
            "quality_score": 0.5,
            "lifecycle_action": "review",
            "tags": [],
            "domain": "general",
            "quality_issues": [str(e)],
            "lifecycle_reason": "evaluation failed",
        }
