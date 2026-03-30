"""Node: auto-tag TM entries with domain/context labels via LLM."""

from __future__ import annotations

import json
import logging

from langsmith import traceable

from catest_ai.common.llm import get_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a translation memory classifier. Given a source-target translation pair, \
assign relevant domain tags from this list:
[general, security, api, database, ui, networking, devops, auth, logging, testing, documentation]

You may assign 1-3 tags. Respond in JSON:
{"tags": ["security", "auth"]}
"""


@traceable(name="tm_auto_tag")
async def auto_tag_node(state: dict) -> dict:
    """Classify the TM entry into domain tags."""
    if state.get("is_duplicate"):
        return {"tags": []}

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
        return {"tags": result.get("tags", ["general"])}
    except Exception as e:
        logger.error("Auto-tag failed: %s", e)
        return {"tags": ["general"]}
