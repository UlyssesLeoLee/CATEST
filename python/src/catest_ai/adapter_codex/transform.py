"""Transform TaskEnvelope into Codex API format."""

from __future__ import annotations

from typing import Any


def to_codex_payload(envelope: dict[str, Any]) -> dict[str, Any]:
    """Convert a TaskEnvelope dict to Codex task structure.

    Codex expects: prompt, model, sandbox, files.
    """
    tasks = envelope.get("tasks", [])
    task_text = "\n".join(
        f"- {t['description']}\n  Criteria: {', '.join(t.get('acceptance_criteria', []))}"
        if isinstance(t, dict) else f"- {t}"
        for t in tasks
    )

    constraints = envelope.get("constraints", [])
    constraints_text = "\n".join(f"- {c}" for c in constraints) if constraints else "None"

    rag_context = envelope.get("rag_context", [])

    prompt = f"""## {envelope.get('title', 'Task')}

{envelope.get('summary', '')}

### Tasks
{task_text}

### Constraints
{constraints_text}

### Historical Context
{_format_rag(rag_context)}
"""

    return {
        "prompt": prompt.strip(),
        "model": "codex-mini",
        "sandbox": True,
        "files": envelope.get("metadata", {}).get("files", []),
        "project": envelope.get("project", "default"),
    }


def _format_rag(rag: list[dict]) -> str:
    if not rag:
        return "No prior context available."
    lines = []
    for item in rag[:5]:
        lines.append(f"- [{item.get('title', 'untitled')}] {item.get('summary', '')}")
    return "\n".join(lines)
