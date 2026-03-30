"""TaskEnvelope — the single data contract between all orchestration services."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class DispatchTarget(str, Enum):
    CODEX = "codex"
    CLAUDE_CODE = "claude_code"
    ANTIGRAVITY = "antigravity"


class DispatchConfig(BaseModel):
    target: DispatchTarget
    priority: int = 5  # 1-10, 10=highest
    timeout_seconds: int = 300
    retry_count: int = 1
    mcp_enabled: bool = False
    extra: dict[str, Any] = Field(default_factory=dict)


class TaskItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str
    acceptance_criteria: list[str] = Field(default_factory=list)
    priority: int = 5


class TaskEnvelope(BaseModel):
    """The ONE model passed between every orchestration service."""

    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    version: str = "1.0"

    # --- Structured requirement ---
    title: str = ""
    summary: str = ""
    tasks: list[TaskItem] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)

    # --- RAG context (filled by memory-service / dispatch-router) ---
    rag_context: list[dict[str, Any]] = Field(default_factory=list)

    # --- Dispatch ---
    dispatch_config: DispatchConfig | None = None

    # --- Project ---
    project: str = "default"

    # --- Meta ---
    metadata: dict[str, Any] = Field(default_factory=dict)
    raw_input: str = ""

    # --- Timestamps ---
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def embedding_text(self) -> str:
        """Text used for vector embedding — summary + task descriptions."""
        task_texts = " ".join(t.description for t in self.tasks)
        return f"{self.summary} {task_texts}".strip()
