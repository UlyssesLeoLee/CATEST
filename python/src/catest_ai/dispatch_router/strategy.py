"""Dispatch routing strategy — maps dispatch_config.target to Kafka topics."""

from __future__ import annotations

from catest_ai.orchestration_schemas import DispatchTarget, OrchestrationTopics

# Target → Kafka topic mapping
TARGET_TOPIC_MAP: dict[DispatchTarget, str] = {
    DispatchTarget.CODEX: OrchestrationTopics.ADAPTER_CODEX_REQUEST,
    DispatchTarget.CLAUDE_CODE: OrchestrationTopics.ADAPTER_CLAUDE_CODE_REQUEST,
    DispatchTarget.ANTIGRAVITY: OrchestrationTopics.ADAPTER_ANTIGRAVITY_REQUEST,
}


def resolve_topic(target: str) -> str:
    """Resolve a dispatch target string to its Kafka topic."""
    try:
        dt = DispatchTarget(target)
    except ValueError:
        # Default to Claude Code
        dt = DispatchTarget.CLAUDE_CODE
    return TARGET_TOPIC_MAP[dt]
