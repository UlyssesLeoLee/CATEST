"""Kafka event model and topic constants for the Orchestration Domain."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class OrchestrationTopics:
    """All Kafka topics — single source of truth, no magic strings."""

    INTENT_RECEIVED = "orchestration.intent.received"
    INTENT_NORMALIZED = "orchestration.intent.normalized"
    RAG_STORE_REQUEST = "orchestration.rag.store.request"
    RAG_STORE_COMPLETED = "orchestration.rag.store.completed"
    LLM_DISPATCH_REQUEST = "orchestration.llm.dispatch.request"
    ADAPTER_CODEX_REQUEST = "orchestration.adapter.codex.request"
    ADAPTER_CLAUDE_CODE_REQUEST = "orchestration.adapter.claude_code.request"
    ADAPTER_ANTIGRAVITY_REQUEST = "orchestration.adapter.antigravity.request"
    ADAPTER_RESULT = "orchestration.adapter.result"

    # convenience set for trace-audit to subscribe to everything
    ALL = [
        INTENT_RECEIVED,
        INTENT_NORMALIZED,
        RAG_STORE_REQUEST,
        RAG_STORE_COMPLETED,
        LLM_DISPATCH_REQUEST,
        ADAPTER_CODEX_REQUEST,
        ADAPTER_CLAUDE_CODE_REQUEST,
        ADAPTER_ANTIGRAVITY_REQUEST,
        ADAPTER_RESULT,
    ]


class OrchestrationEvent(BaseModel):
    """Every Kafka message in the orchestration domain wraps this envelope."""

    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str
    trace_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source_service: str
    status: str = "pending"  # pending | processing | completed | failed
    payload: dict[str, Any] = Field(default_factory=dict)
