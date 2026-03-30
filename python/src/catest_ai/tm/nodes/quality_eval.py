"""Node: LLM-based translation quality evaluation for TM candidates."""

from __future__ import annotations

import json
import logging

from langsmith import traceable

from catest_ai.common.llm import get_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a translation quality evaluator. Given a source text and its translation, \
evaluate the quality on a scale of 0.0 to 1.0.

Consider: accuracy, fluency, completeness, and terminology.

Respond in JSON:
{"quality_score": 0.85, "reason": "brief explanation"}
"""


@traceable(name="tm_quality_eval")
async def quality_eval_node(state: dict) -> dict:
    """Evaluate translation quality using Claude."""
    if state.get("is_duplicate"):
        return {"quality_score": 0.0, "quality_reason": "duplicate — skipped"}

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
            "quality_reason": result.get("reason", ""),
        }
    except Exception as e:
        logger.error("Quality eval failed: %s", e)
        return {"quality_score": 0.5, "quality_reason": "evaluation failed"}
