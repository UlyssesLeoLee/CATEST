"""MCP Tools — real MCP Server with Qdrant-backed tools via memory-service.

Every tool here goes through:
  mcp-facade → HTTP → memory-service(:34092) → Qdrant

Claude Code / Codex call these via MCP protocol (Streamable HTTP).
No tool touches Qdrant directly — memory-service is the sole accessor.
"""

from __future__ import annotations

import json
import logging
import os

import httpx
from mcp.server.fastmcp import FastMCP

from catest_ai.mcp_facade.context_policy import ContextQuery, rerank_results

logger = logging.getLogger(__name__)

MEMORY_SERVICE_URL = os.getenv("MEMORY_SERVICE_URL", "http://catest-memory-service:34092")
INTENT_GATEWAY_URL = os.getenv("INTENT_GATEWAY_URL", "http://catest-intent-gateway:34090")


async def _call_memory(method: str, path: str, **kwargs) -> dict:
    """Call memory-service and return JSON response."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        if method == "GET":
            resp = await client.get(f"{MEMORY_SERVICE_URL}{path}", **kwargs)
        else:
            resp = await client.post(f"{MEMORY_SERVICE_URL}{path}", **kwargs)
        resp.raise_for_status()
        return resp.json()


def create_mcp_server() -> tuple:
    """Build the MCP Server with all tools.

    Returns:
        (FastMCP instance, Starlette ASGI app)
        The caller must run `async with mcp.session_manager.run()` in lifespan.
    """

    mcp = FastMCP(
        "CATEST Private RAG",
        stateless_http=True,
    )

    # ─── Tool 1: get_current_requirement ──────────────────────────────

    @mcp.tool()
    async def get_current_requirement(trace_id: str, project: str = "default") -> str:
        """Get the full structured requirement for a specific trace_id.

        This is an EXACT lookup by trace_id — no fuzzy/vector search.
        Use this when you already know which task you're working on.

        Args:
            trace_id: The unique trace identifier assigned when the requirement was created.
            project: The project name (used to narrow the search scope).

        Returns:
            JSON object with title, summary, tasks, constraints, keywords,
            and all metadata for this requirement. Returns error if not found.
        """
        try:
            data = await _call_memory("GET", f"/history/{project}", params={"limit": 200})
            results = data.get("results", [])
            match = next((r for r in results if r.get("trace_id") == trace_id), None)
            if match:
                return json.dumps(match, indent=2, default=str, ensure_ascii=False)
            return json.dumps({"error": f"No requirement found for trace_id={trace_id}", "trace_id": trace_id})
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Memory service unavailable: {e}"})

    # ─── Tool 2: search_project_context ───────────────────────────────

    @mcp.tool()
    async def search_project_context(
        query: str,
        project: str = "default",
        top_k: int = 5,
        time_window_hours: int = 72,
    ) -> str:
        """Search the private RAG knowledge base for relevant context.

        Uses semantic vector search with context policy enforcement:
        - Scoped to the specified project (mandatory)
        - Limited to the time window (default: last 72 hours)
        - Results are reranked by status priority and recency
        - Maximum 10 results per query

        Use this when you need background context, related past requirements,
        or historical decisions relevant to your current task.

        Args:
            query: Natural language description of what context you need.
            project: Project name to scope the search (REQUIRED for safety).
            top_k: Number of results to return (max 10).
            time_window_hours: Only return results from the last N hours (default 72).

        Returns:
            JSON array of relevant context items, each with title, summary,
            tasks, score, and metadata. Sorted by relevance after reranking.
        """
        top_k = min(top_k, 10)  # hard cap

        try:
            data = await _call_memory("POST", "/search", json={
                "query": query,
                "project": project,
                "top_k": top_k * 2,  # over-fetch for reranking
            })
            raw_results = data.get("results", [])
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Memory service unavailable: {e}"})

        # Apply context policy reranking
        ctx = ContextQuery(
            query_text=query,
            project=project,
            time_window_hours=time_window_hours,
            top_k=top_k,
        )
        reranked = rerank_results(raw_results, ctx)

        return json.dumps(
            {"results": reranked[:top_k], "count": len(reranked[:top_k]), "project": project},
            indent=2, default=str, ensure_ascii=False,
        )

    # ─── Tool 3: search_execution_history ─────────────────────────────

    @mcp.tool()
    async def search_execution_history(
        query: str,
        project: str = "default",
        top_k: int = 5,
    ) -> str:
        """Search past execution results and lessons learned.

        This searches the execution memory collection — results of previous
        AI agent runs, including success/failure outcomes, artifacts produced,
        and duration. Useful for avoiding past mistakes or reusing solutions.

        Args:
            query: What kind of execution history you're looking for.
            project: Project scope.
            top_k: Number of results (max 10).

        Returns:
            JSON array of execution history items.
        """
        top_k = min(top_k, 10)
        try:
            data = await _call_memory("POST", "/search/memory", json={
                "query": query,
                "project": project,
                "top_k": top_k,
            })
            return json.dumps(data, indent=2, default=str, ensure_ascii=False)
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Memory service unavailable: {e}"})

    # ─── Tool 4: store_requirement ────────────────────────────────────

    @mcp.tool()
    async def store_requirement(
        trace_id: str,
        title: str,
        summary: str,
        tasks: str,
        project: str = "default",
        constraints: str = "[]",
        keywords: str = "[]",
    ) -> str:
        """Store a structured requirement into the private knowledge base.

        Only accepts structured data — you must provide title, summary,
        and at least one task. Raw unstructured text will be rejected.

        Args:
            trace_id: The trace_id to associate with this requirement.
            title: Short title for the requirement (under 80 chars).
            summary: 1-3 sentence summary of the goal.
            tasks: JSON array of task description strings, e.g. '["Implement X", "Test Y"]'.
            project: Project name.
            constraints: JSON array of constraint strings (optional).
            keywords: JSON array of keyword strings (optional).

        Returns:
            Confirmation with stored point_id, or error message.
        """
        try:
            tasks_list = json.loads(tasks) if isinstance(tasks, str) else tasks
            constraints_list = json.loads(constraints) if isinstance(constraints, str) else constraints
            keywords_list = json.loads(keywords) if isinstance(keywords, str) else keywords
        except json.JSONDecodeError:
            return json.dumps({"error": "tasks, constraints, keywords must be valid JSON arrays"})

        if not summary.strip() or not tasks_list:
            return json.dumps({"error": "summary and tasks are required"})

        try:
            data = await _call_memory("POST", "/store", json={
                "trace_id": trace_id,
                "title": title,
                "summary": summary,
                "tasks": tasks_list,
                "constraints": constraints_list,
                "keywords": keywords_list,
                "project": project,
            })
            return json.dumps(data, indent=2, default=str, ensure_ascii=False)
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Memory service unavailable: {e}"})

    # ─── Tool 5: submit_result ────────────────────────────────────────

    @mcp.tool()
    async def submit_result(
        trace_id: str,
        status: str,
        output: str = "{}",
        artifacts: str = "[]",
        error: str | None = None,
    ) -> str:
        """Submit your execution result back to CATEST.

        Call this when you have completed or failed the assigned task.
        The result will be recorded in the audit trail and the execution
        memory for future reference.

        Args:
            trace_id: The trace_id of the task you worked on.
            status: One of: success, partial, failed, timeout.
            output: JSON string with execution output/summary.
            artifacts: JSON array of artifact paths (file paths, PR URLs, etc).
            error: Error message if status is failed/timeout (optional).

        Returns:
            Confirmation that the result was received.
        """
        try:
            output_dict = json.loads(output) if isinstance(output, str) else output
            artifacts_list = json.loads(artifacts) if isinstance(artifacts, str) else artifacts
        except json.JSONDecodeError:
            output_dict = {"raw": output}
            artifacts_list = []

        payload = {
            "trace_id": trace_id,
            "adapter": "mcp_agent",
            "status": status,
            "output": output_dict,
            "artifacts": artifacts_list,
            "error": error,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(f"{INTENT_GATEWAY_URL}/callback/result", json=payload)
            return json.dumps({"status": "received", "trace_id": trace_id})
        except httpx.HTTPError:
            # Accept anyway — best effort callback
            logger.warning("Callback failed for trace=%s, accepted locally", trace_id[:8])
            return json.dumps({"status": "accepted_locally", "trace_id": trace_id})

    starlette_app = mcp.streamable_http_app()
    return mcp, starlette_app
