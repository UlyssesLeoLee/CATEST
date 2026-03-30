"""Structure node — LLM-based requirement decomposition."""

from __future__ import annotations

import json
import logging

from catest_ai.common.llm import invoke_llm
from catest_ai.orchestrator_svc.state import OrchestratorState

logger = logging.getLogger(__name__)

STRUCTURE_PROMPT = """\
You are a senior requirements analyst. Given the user's raw request below,
decompose it into a structured JSON object with EXACTLY these fields:

{{
  "title": "short title (under 80 chars)",
  "summary": "1-3 sentence summary of the overall goal",
  "tasks": [
    {{
      "description": "specific actionable task",
      "acceptance_criteria": ["criterion 1", "criterion 2"],
      "priority": 5
    }}
  ],
  "constraints": ["constraint 1", "constraint 2"],
  "keywords": ["keyword1", "keyword2"]
}}

Rules:
- tasks must be concrete and actionable, not vague
- each task must have at least one acceptance criterion
- constraints are hard rules the solution must obey
- keywords are for semantic search indexing
- respond with ONLY the JSON, no markdown fences

User request:
{input}
"""


async def structure(state: OrchestratorState) -> dict:
    """Call LLM to decompose normalized input into structured fields."""
    raw = await invoke_llm(
        STRUCTURE_PROMPT.format(input=state["normalized_input"]),
        system="You output valid JSON only. No explanation.",
    )

    # Strip potential markdown fences
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    text = text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        logger.error("LLM returned invalid JSON: %s", text[:500])
        # Fallback: treat entire input as a single task
        parsed = {
            "title": state["normalized_input"][:80],
            "summary": state["normalized_input"],
            "tasks": [{"description": state["normalized_input"], "acceptance_criteria": [], "priority": 5}],
            "constraints": [],
            "keywords": [],
        }

    return {
        "title": parsed.get("title", ""),
        "summary": parsed.get("summary", ""),
        "tasks": parsed.get("tasks", []),
        "constraints": parsed.get("constraints", []),
        "keywords": parsed.get("keywords", []),
    }
