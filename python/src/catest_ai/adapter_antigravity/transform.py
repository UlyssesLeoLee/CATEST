"""Transform TaskEnvelope into Antigravity mission/work-item structure."""

from __future__ import annotations

from typing import Any


def to_antigravity_payload(envelope: dict[str, Any]) -> dict[str, Any]:
    """Convert TaskEnvelope to Antigravity's mission + workItems format."""
    tasks = envelope.get("tasks", [])

    work_items = []
    for t in tasks:
        if isinstance(t, dict):
            work_items.append({
                "id": t.get("id", ""),
                "title": t.get("description", ""),
                "acceptanceCriteria": t.get("acceptance_criteria", []),
                "priority": t.get("priority", 5),
            })
        else:
            work_items.append({"title": str(t), "acceptanceCriteria": [], "priority": 5})

    return {
        "mission": {
            "title": envelope.get("title", ""),
            "description": envelope.get("summary", ""),
            "project": envelope.get("project", "default"),
            "trace_id": envelope.get("trace_id", ""),
        },
        "workItems": work_items,
        "constraints": envelope.get("constraints", []),
        "context": {
            "keywords": envelope.get("keywords", []),
            "rag": envelope.get("rag_context", []),
        },
    }
