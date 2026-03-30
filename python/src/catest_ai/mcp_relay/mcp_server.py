"""MCP Server — tools exposed to remote AI agents (Codex / Claude Code / Antigravity).

Uses the MCP Python SDK with Streamable HTTP transport for cloud deployment.
Tools are the ONLY interface remote agents use to interact with CATEST context.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from mcp.server.fastmcp import FastMCP

from catest_ai.mcp_relay.cache import context_cache

logger = logging.getLogger(__name__)

CALLBACK_URL = os.getenv("CALLBACK_URL", "http://localhost:34090")


def create_mcp_app() -> FastMCP:
    """Create and configure the MCP server with all tools."""
    mcp = FastMCP(
        "CATEST Orchestration Relay",
        stateless_http=True,
    )

    # ─── Tool: get_active_tasks ───

    @mcp.tool()
    def get_active_tasks(project: str | None = None) -> str:
        """Get all active task contexts available for execution.

        Args:
            project: Optional project filter. If not provided, returns all.

        Returns:
            JSON array of task summaries with trace_id, title, summary, and tasks.
        """
        contexts = context_cache.get_all_active(project)
        summaries = []
        for ctx in contexts:
            summaries.append({
                "trace_id": ctx.get("trace_id", ""),
                "project": ctx.get("project", ""),
                "title": ctx.get("title", ""),
                "summary": ctx.get("summary", ""),
                "tasks": [
                    t.get("description", "") if isinstance(t, dict) else str(t)
                    for t in ctx.get("tasks", [])
                ],
                "constraints": ctx.get("constraints", []),
                "dispatch_target": ctx.get("dispatch_target", ""),
            })
        return json.dumps(summaries, indent=2, ensure_ascii=False)

    # ─── Tool: get_task_detail ───

    @mcp.tool()
    def get_task_detail(trace_id: str) -> str:
        """Get full task context for a specific trace_id.

        Args:
            trace_id: The unique identifier of the task.

        Returns:
            Full task envelope as JSON, including RAG context, constraints,
            keywords, and any attached metadata.
        """
        data = context_cache.get(trace_id)
        if data is None:
            return json.dumps({"error": f"No context found for trace_id={trace_id}"})
        return json.dumps(data, indent=2, default=str, ensure_ascii=False)

    # ─── Tool: get_rag_context ───

    @mcp.tool()
    def get_rag_context(trace_id: str) -> str:
        """Get RAG (retrieval-augmented) context for a task.

        This returns relevant historical requirements and execution results
        that were retrieved from the local knowledge base.

        Args:
            trace_id: The task's trace_id.

        Returns:
            JSON array of relevant context items.
        """
        data = context_cache.get(trace_id)
        if data is None:
            return json.dumps({"error": f"No context for trace_id={trace_id}"})
        rag = data.get("rag_context", [])
        return json.dumps(rag, indent=2, default=str, ensure_ascii=False)

    # ─── Tool: submit_result ───

    @mcp.tool()
    def submit_result(
        trace_id: str,
        status: str,
        output: str = "{}",
        artifacts: str = "[]",
        error: str | None = None,
    ) -> str:
        """Submit execution result for a task.

        Call this when you have completed (or failed) the assigned task.

        Args:
            trace_id: The task's trace_id.
            status: One of: success, partial, failed, timeout.
            output: JSON string of execution output/summary.
            artifacts: JSON array of artifact paths (files created, PR URLs, etc).
            error: Error message if status is failed/timeout.

        Returns:
            Confirmation message.
        """
        try:
            output_dict = json.loads(output) if isinstance(output, str) else output
            artifacts_list = json.loads(artifacts) if isinstance(artifacts, str) else artifacts
        except json.JSONDecodeError:
            output_dict = {"raw": output}
            artifacts_list = []

        result = {
            "trace_id": trace_id,
            "adapter": "mcp_agent",
            "status": status,
            "output": output_dict,
            "artifacts": artifacts_list,
            "error": error,
        }
        context_cache.put_result(trace_id, result)
        logger.info("Result submitted via MCP: trace_id=%s status=%s", trace_id[:8], status)
        return json.dumps({"status": "received", "trace_id": trace_id})

    # ─── Tool: search_similar_tasks ───

    @mcp.tool()
    def search_similar_tasks(query: str, project: str | None = None) -> str:
        """Search for tasks similar to a query string.

        This searches the relay cache (not the full local Qdrant).
        For comprehensive search, use get_active_tasks and filter manually.

        Args:
            query: Natural language search query.
            project: Optional project filter.

        Returns:
            JSON array of matching tasks (simple keyword match on cached items).
        """
        query_lower = query.lower()
        contexts = context_cache.get_all_active(project)
        matches = []
        for ctx in contexts:
            searchable = f"{ctx.get('title', '')} {ctx.get('summary', '')} {' '.join(ctx.get('keywords', []))}".lower()
            if any(word in searchable for word in query_lower.split()):
                matches.append({
                    "trace_id": ctx.get("trace_id", ""),
                    "title": ctx.get("title", ""),
                    "summary": ctx.get("summary", ""),
                    "project": ctx.get("project", ""),
                })
        return json.dumps(matches, indent=2, ensure_ascii=False)

    return mcp.get_asgi_app()
