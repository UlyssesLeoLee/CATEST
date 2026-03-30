"""Vector-ops proxy endpoints — routes to ai-vector-ops service.

These are convenience proxies so ROPE_CS can also reach vector-ops
through the orchestrator if needed (single entry point pattern).
The primary path is direct: /api/vectors → ai-vector-ops:34085.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["vectors"])

AI_VECTOR_OPS_URL = "http://catest-ai-vector-ops:34085"


@router.api_route("/vectors/{path:path}", methods=["GET", "POST"])
async def proxy_vectors(path: str, request: Request):
    """Proxy all /ai/vectors/* to ai-vector-ops service."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        body = await request.body()
        resp = await client.request(
            method=request.method,
            url=f"{AI_VECTOR_OPS_URL}/v1/{path}",
            content=body,
            headers={"content-type": request.headers.get("content-type", "application/json")},
        )
        return JSONResponse(content=resp.json(), status_code=resp.status_code)
