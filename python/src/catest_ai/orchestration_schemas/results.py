"""Adapter execution result — unified across all adapters."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class AdapterResult(BaseModel):
    """Every adapter returns this exact structure, no exceptions."""

    trace_id: str
    adapter: str  # codex | claude_code | antigravity
    status: str  # success | partial | failed | timeout
    output: dict[str, Any] = Field(default_factory=dict)
    artifacts: list[str] = Field(default_factory=list)  # file paths, PR URLs, etc.
    duration_ms: int = 0
    error: str | None = None
    completed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
