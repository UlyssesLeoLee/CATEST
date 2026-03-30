"""LangGraph: translation quality evaluation workflow.

Simple single-node graph (extensible for future multi-dimensional scoring).
Pipeline: entry → evaluate → output
"""

from __future__ import annotations

import json
import logging
from typing import TypedDict

from langgraph.graph import END, StateGraph
from langsmith import traceable

from catest_ai.common.llm import get_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a translation quality evaluator using the MQM (Multidimensional Quality Metrics) framework.
Evaluate the translation on these dimensions (each 0.0 to 1.0):

- **fluency**: Is the target text natural and readable?
- **accuracy**: Does the target faithfully convey the source meaning?
- **terminology**: Are technical terms translated correctly and consistently?
- **style**: Does the target match the appropriate register and tone?

Compute an **overall** score as weighted average: accuracy(0.4) + fluency(0.3) + terminology(0.2) + style(0.1).

Respond in JSON:
{
  "fluency": 0.9,
  "accuracy": 0.85,
  "terminology": 0.95,
  "style": 0.8,
  "overall": 0.88,
  "explanation": "brief explanation of scoring"
}
"""


class QEState(TypedDict, total=False):
    source_text: str
    target_text: str
    context: dict

    fluency: float
    accuracy: float
    terminology: float
    style: float
    overall_score: float
    explanation: str


@traceable(name="qe_evaluate")
async def evaluate_node(state: dict) -> dict:
    """Run MQM-based quality evaluation via Claude."""
    source = state["source_text"]
    target = state["target_text"]
    context = state.get("context", {})

    llm = get_llm(temperature=0.0)
    user_msg = f"Source: {source}\nTarget: {target}"
    if context:
        user_msg += f"\nContext: {json.dumps(context, ensure_ascii=False)}"

    messages = [("system", SYSTEM_PROMPT), ("human", user_msg)]

    try:
        response = await llm.ainvoke(messages)
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        result = json.loads(content.strip())
        return {
            "fluency": result.get("fluency", 0.0),
            "accuracy": result.get("accuracy", 0.0),
            "terminology": result.get("terminology", 0.0),
            "style": result.get("style", 0.0),
            "overall_score": result.get("overall", 0.0),
            "explanation": result.get("explanation", ""),
        }
    except Exception as e:
        logger.error("QE evaluation failed: %s", e)
        return {
            "fluency": 0.0,
            "accuracy": 0.0,
            "terminology": 0.0,
            "style": 0.0,
            "overall_score": 0.0,
            "explanation": f"Evaluation failed: {e}",
        }


def build_qe_graph() -> StateGraph:
    graph = StateGraph(QEState)
    graph.add_node("evaluate", evaluate_node)
    graph.set_entry_point("evaluate")
    graph.add_edge("evaluate", END)
    return graph.compile()


qe_graph = build_qe_graph()
