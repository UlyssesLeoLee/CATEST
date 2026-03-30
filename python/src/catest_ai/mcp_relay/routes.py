"""HTTP routes for local CATEST to push/pull data through the relay.

These are NOT MCP tools — these are the "back channel" for local CATEST.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from catest_ai.mcp_relay.cache import context_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/relay", tags=["relay"])

# Local CATEST callback URL (set via env when deploying relay to cloud)
CALLBACK_URL = os.getenv("CALLBACK_URL", "http://localhost:34090")


class PushContextRequest(BaseModel):
    """Local CATEST pushes a TaskEnvelope snapshot to the relay."""
    trace_id: str
    project: str = "default"
    title: str = ""
    summary: str = ""
    tasks: list[dict[str, Any]] = []
    constraints: list[str] = []
    keywords: list[str] = []
    rag_context: list[dict[str, Any]] = []
    dispatch_target: str = ""
    metadata: dict[str, Any] = {}


class SubmitResultRequest(BaseModel):
    """Remote AI agent submits execution result back."""
    trace_id: str
    adapter: str
    status: str  # success | partial | failed
    output: dict[str, Any] = {}
    artifacts: list[str] = []
    error: str | None = None


@router.get("/health")
async def health():
    return {"status": "ok", "service": "mcp-relay"}


@router.post("/push")
async def push_context(req: PushContextRequest):
    """Local CATEST pushes task context to relay cache."""
    context_cache.put(req.trace_id, req.model_dump())
    logger.info("Context pushed: trace_id=%s project=%s", req.trace_id[:8], req.project)
    return {"status": "cached", "trace_id": req.trace_id}


@router.post("/push/batch")
async def push_batch(items: list[PushContextRequest]):
    """Push multiple contexts at once."""
    for item in items:
        context_cache.put(item.trace_id, item.model_dump())
    return {"status": "cached", "count": len(items)}


@router.get("/context/{trace_id}")
async def get_context(trace_id: str):
    """Retrieve cached context by trace_id."""
    data = context_cache.get(trace_id)
    if data is None:
        raise HTTPException(404, f"No context for trace_id={trace_id}")
    return data


@router.get("/contexts")
async def list_contexts(project: str | None = None):
    """List all active (non-expired) contexts."""
    return {"contexts": context_cache.get_all_active(project)}


@router.post("/result")
async def submit_result(req: SubmitResultRequest):
    """Remote AI agent submits result — relay caches it and notifies local."""
    context_cache.put_result(req.trace_id, req.model_dump())
    logger.info("Result received: trace_id=%s adapter=%s status=%s",
                req.trace_id[:8], req.adapter, req.status)

    # Callback to local CATEST (best-effort)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{CALLBACK_URL}/callback/result",
                json=req.model_dump(),
            )
    except httpx.HTTPError as e:
        logger.warning("Callback to local failed: %s", e)

    return {"status": "received", "trace_id": req.trace_id}


@router.get("/result/{trace_id}")
async def get_result(trace_id: str):
    """Local CATEST polls for result."""
    result = context_cache.get_result(trace_id)
    if result is None:
        raise HTTPException(404, f"No result for trace_id={trace_id}")
    return result
