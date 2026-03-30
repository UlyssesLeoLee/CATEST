"""RAG payload models for Qdrant storage."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class RAGMetadata(BaseModel):
    """Payload attached to every Qdrant point in orchestration collections."""

    trace_id: str
    project: str
    title: str
    summary: str
    tasks: list[str]  # flattened task descriptions
    constraints: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    status: str = "stored"  # stored | dispatched | completed
    dispatch_target: str = ""
    created_at: str = ""  # ISO 8601
    updated_at: str = ""


class RAGPayload(BaseModel):
    """A complete Qdrant upsert payload."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vector: list[float]
    metadata: RAGMetadata
