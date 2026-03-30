"""BuildPayload node — assemble the full TaskEnvelope."""

from __future__ import annotations

from catest_ai.orchestration_schemas import (
    DispatchConfig,
    DispatchTarget,
    TaskEnvelope,
    TaskItem,
)
from catest_ai.orchestrator_svc.state import OrchestratorState


def build_payload(state: OrchestratorState) -> dict:
    """Build the canonical TaskEnvelope from accumulated state."""
    tasks = []
    for t in state["tasks"]:
        if isinstance(t, dict):
            tasks.append(TaskItem(**t))
        else:
            tasks.append(t)

    # Map string target to enum
    target_str = state.get("dispatch_target", "claude_code")
    try:
        target = DispatchTarget(target_str)
    except ValueError:
        target = DispatchTarget.CLAUDE_CODE

    envelope = TaskEnvelope(
        trace_id=state["trace_id"],
        title=state["title"],
        summary=state["summary"],
        tasks=tasks,
        constraints=state["constraints"],
        keywords=state["keywords"],
        dispatch_config=DispatchConfig(
            target=target,
            mcp_enabled=(target == DispatchTarget.CLAUDE_CODE),
        ),
        project=state["project"],
        metadata=state.get("metadata", {}),
        raw_input=state["raw_input"],
    )
    return {"envelope": envelope.model_dump(mode="json")}
