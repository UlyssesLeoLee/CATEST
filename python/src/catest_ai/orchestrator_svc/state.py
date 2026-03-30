"""LangGraph state definition for orchestrator-svc."""

from __future__ import annotations

from typing import Any, TypedDict


class OrchestratorState(TypedDict, total=False):
    # Input (set by intent-gateway call)
    trace_id: str
    raw_input: str
    project: str
    dispatch_target: str
    metadata: dict[str, Any]

    # Normalize output
    normalized_input: str

    # Structure output
    title: str
    summary: str
    tasks: list[dict]
    constraints: list[str]
    keywords: list[str]

    # Embed output
    embedding: list[float]

    # BuildPayload output
    envelope: dict[str, Any]

    # Router output
    rag_dispatched: bool
    llm_dispatched: bool
