"""Transform TaskEnvelope into Claude Code execution format.

Claude Code adapter is unique: it connects the agent to the cloud MCP relay
so the agent can pull RAG context on-demand during execution.
"""

from __future__ import annotations

import os
from typing import Any

MCP_RELAY_URL = os.getenv("MCP_RELAY_URL", "")


def to_claude_code_payload(envelope: dict[str, Any]) -> dict[str, Any]:
    """Convert TaskEnvelope to Claude Code invocation structure.

    The key differentiator is mcpServers — Claude Code will connect
    to the cloud MCP relay to access private RAG context.
    """
    tasks = envelope.get("tasks", [])
    task_lines = "\n".join(
        f"- {t['description']}" if isinstance(t, dict) else f"- {t}"
        for t in tasks
    )

    constraints = envelope.get("constraints", [])
    constraint_text = "\n".join(f"- {c}" for c in constraints)

    system_prompt = (
        f"Project: {envelope.get('project', 'default')}.\n"
        f"Trace ID: {envelope.get('trace_id', '')}.\n"
        f"Constraints:\n{constraint_text}\n\n"
        "You have access to an MCP server 'orchestration-memory' with tools:\n"
        "- get_active_tasks: list available tasks\n"
        "- get_task_detail: get full context for a trace_id\n"
        "- get_rag_context: get historical RAG context\n"
        "- submit_result: submit your execution result when done\n"
        "- search_similar_tasks: find related past tasks\n\n"
        "Use get_task_detail and get_rag_context to understand the full requirement "
        "before starting work. Call submit_result when you're done."
    )

    prompt = f"{envelope.get('summary', '')}\n\nTasks:\n{task_lines}"

    result: dict[str, Any] = {
        "prompt": prompt.strip(),
        "systemPrompt": system_prompt,
        "allowedTools": ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
        "tasks": [t["description"] if isinstance(t, dict) else str(t) for t in tasks],
    }

    # Attach MCP server config if relay URL is available
    if MCP_RELAY_URL:
        result["mcpServers"] = [
            {
                "name": "orchestration-memory",
                "type": "streamable-http",
                "url": f"{MCP_RELAY_URL}/mcp",
                "tools": [
                    "get_active_tasks",
                    "get_task_detail",
                    "get_rag_context",
                    "submit_result",
                    "search_similar_tasks",
                ],
            }
        ]

    return result
