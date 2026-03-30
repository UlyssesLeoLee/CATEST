"""Orchestration Domain shared schemas — the single source of truth.

All services in the AI Orchestration Domain MUST use these models.
No service may define its own task/event formats.
"""

from catest_ai.orchestration_schemas.envelope import (
    DispatchConfig,
    DispatchTarget,
    TaskEnvelope,
    TaskItem,
)
from catest_ai.orchestration_schemas.events import OrchestrationEvent, OrchestrationTopics
from catest_ai.orchestration_schemas.rag import RAGMetadata, RAGPayload
from catest_ai.orchestration_schemas.results import AdapterResult

__all__ = [
    "AdapterResult",
    "DispatchConfig",
    "DispatchTarget",
    "OrchestrationEvent",
    "OrchestrationTopics",
    "RAGMetadata",
    "RAGPayload",
    "TaskEnvelope",
    "TaskItem",
]
