"""Cloud MCP Relay — the thinnest possible bridge between local CATEST and remote AI agents.

Deployment: cloud (Fly.io / Railway / any container host)
Protocol: MCP over Streamable HTTP (SSE)

Architecture:
  Local CATEST ──push──→ MCP Relay (cloud) ←──MCP tools──── Codex / Claude Code / Antigravity
                          │
                          ├─ context_cache (in-memory, TTL-based)
                          ├─ MCP tools: get_task, search_context, submit_result
                          └─ callback_url → local CATEST intent-gateway

This server does NOT own data. It is a relay with a short-lived cache.
The real data lives in local memory-service / Qdrant.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from catest_ai.mcp_relay.cache import context_cache
from catest_ai.mcp_relay.mcp_server import create_mcp_app
from catest_ai.mcp_relay.routes import router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("MCP Relay started — callback_url=%s", os.getenv("CALLBACK_URL", "not set"))
    yield
    context_cache.clear()


app = FastAPI(title="CATEST MCP Relay", lifespan=lifespan)

# HTTP routes for local CATEST to push context / receive results
app.include_router(router)

# Mount the MCP server at /mcp for AI agent connections
mcp_app = create_mcp_app()
app.mount("/mcp", mcp_app)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8090"))
    uvicorn.run(app, host="0.0.0.0", port=port)
