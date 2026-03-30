"""Node: extract candidate terms from text using LLM-based NER."""

from __future__ import annotations

import json
import logging

from langsmith import traceable

from catest_ai.common.llm import get_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a terminology extraction specialist for software localization. \
Given source code or technical text, identify candidate terms that should be \
standardized in a terminology base.

Focus on:
- Technical jargon (API names, protocol terms, security concepts)
- Domain-specific terms that need consistent translation
- Acronyms and abbreviations
- Compound nouns with specific technical meaning

Respond in JSON:
{
  "candidates": [
    {"term": "authentication", "definition": "brief def", "domain": "auth"},
    {"term": "rate limiting", "definition": "brief def", "domain": "api"}
  ]
}
"""


@traceable(name="tb_ner_extract")
async def ner_extract_node(state: dict) -> dict:
    """Extract candidate terms from text content."""
    text = state.get("text", "")
    if not text.strip():
        return {"candidates": []}

    llm = get_llm(temperature=0.0)
    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", f"Extract terminology candidates from:\n\n{text[:3000]}"),
    ]

    try:
        response = await llm.ainvoke(messages)
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        result = json.loads(content.strip())
        return {"candidates": result.get("candidates", [])}
    except Exception as e:
        logger.error("NER extraction failed: %s", e)
        return {"candidates": []}
