"""mcp-facade-service — the ONLY MCP Server that external agents connect to.

This is a REAL MCP Server (Streamable HTTP via FastMCP), NOT just REST.
Claude Code / Codex connect here using MCP protocol.

Full chain:
  Claude Code ──MCP protocol──→ Cloudflare Tunnel ──→ THIS SERVICE ──→ memory-service ──→ Qdrant

Enforces:
  1. Context policies (project scope, trace scope, time window)
  2. Metadata filtering before vector search
  3. Reranking for relevance
  4. Structured data only — no raw Qdrant access
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import FastAPI

from catest_ai.mcp_facade.mcp_tools import create_mcp_server

logger = logging.getLogger(__name__)

_http: httpx.AsyncClient | None = None

MEMORY_SERVICE_URL = os.getenv("MEMORY_SERVICE_URL", "http://catest-memory-service:34092")
INTENT_GATEWAY_URL = os.getenv("INTENT_GATEWAY_URL", "http://catest-intent-gateway:34090")


def get_http() -> httpx.AsyncClient:
    if _http is None:
        raise RuntimeError("HTTP client not initialized")
    return _http


# Create the FastMCP instance and get the Starlette app + session manager
_mcp, mcp_starlette_app = create_mcp_server()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _http
    _http = httpx.AsyncClient(timeout=30.0)
    # Start the MCP session manager — required for Streamable HTTP to work
    async with _mcp.session_manager.run():
        logger.info(
            "mcp-facade-service started — MCP endpoint at /mcp, "
            "memory-service=%s", MEMORY_SERVICE_URL
        )
        yield
    if _http:
        await _http.aclose()


# ─── FastAPI host app ─────────────────────────────────────────────────

app = FastAPI(title="mcp-facade-service", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "mcp-facade", "mcp_endpoint": "/mcp"}


# ─── Mount the real MCP Server ────────────────────────────────────────
# FastMCP's streamable_http_app() creates a Starlette app with route at /mcp
# Mounting at "/" so the MCP endpoint is at /mcp (not /mcp/mcp)
app.mount("/", mcp_starlette_app)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=34098)
