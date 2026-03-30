"""LangGraph definition: Input → Normalize → Structure → Embed → Build → Route.

The graph compiles into `orchestration_graph` which is the single entry point.
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from catest_ai.orchestrator_svc.nodes.build_payload import build_payload
from catest_ai.orchestrator_svc.nodes.embed import embed
from catest_ai.orchestrator_svc.nodes.normalize import normalize
from catest_ai.orchestrator_svc.nodes.router import route_llm, route_rag
from catest_ai.orchestrator_svc.nodes.structure import structure
from catest_ai.orchestrator_svc.state import OrchestratorState

graph = StateGraph(OrchestratorState)

# Nodes
graph.add_node("normalize", normalize)
graph.add_node("structure", structure)
graph.add_node("embed", embed)
graph.add_node("build_payload", build_payload)
graph.add_node("route_rag", route_rag)
graph.add_node("route_llm", route_llm)

# Sequential pipeline: normalize → structure → embed → build_payload
graph.set_entry_point("normalize")
graph.add_edge("normalize", "structure")
graph.add_edge("structure", "embed")
graph.add_edge("embed", "build_payload")

# Fan-out: build_payload → (route_rag, route_llm) in parallel
graph.add_edge("build_payload", "route_rag")
graph.add_edge("build_payload", "route_llm")
graph.add_edge("route_rag", END)
graph.add_edge("route_llm", END)

orchestration_graph = graph.compile()
