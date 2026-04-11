"""MCP (Model Context Protocol) HTTP server for adapter-bridge.

Exposes bridge CLI tools to AI IDEs (Antigravity, Cursor, etc.) as MCP tools.
Transport: Streamable HTTP (MCP spec 2025-03-26)
Endpoint: POST /mcp

Tools exposed:
  run_claude_code  — run a prompt with Claude Code CLI
  run_codex        — run a prompt with Codex CLI
  list_models      — list available CLI tools and models
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import threading
import time
import queue as _queue
import shutil
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from catest_ai.adapter_bridge.runners import (
    ClaudeCodeRunner,
    CodexRunner,
    detect_models,
)

logger = logging.getLogger("adapter-bridge.mcp")

router = APIRouter()

MCP_VERSION = "2025-03-26"
SERVER_INFO = {"name": "catest-adapter-bridge", "version": "1.0.0"}

# ── Tool definitions ──────────────────────────────────────────────────

TOOLS = [
    {
        "name": "run_claude_code",
        "description": (
            "Run a prompt using Claude Code CLI in the local project directory. "
            "Returns the full text output. Use for coding tasks, refactoring, "
            "explaining code, running commands in the CATEST project."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The task or question to send to Claude Code.",
                },
                "model": {
                    "type": "string",
                    "description": "Claude model alias: 'opus', 'sonnet', or 'haiku'. Defaults to 'sonnet'.",
                    "default": "sonnet",
                },
                "cwd": {
                    "type": "string",
                    "description": "Working directory. Defaults to BRIDGE_CWD env var.",
                },
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "run_codex",
        "description": (
            "Run a prompt using the Codex CLI (OpenAI) in the local project directory. "
            "Returns the full text output. Use for code generation, analysis, and "
            "tasks requiring GPT-5 series models."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The task or question to send to Codex.",
                },
                "model": {
                    "type": "string",
                    "description": "Codex model ID, e.g. 'gpt-5.4', 'gpt-5.4-mini'. Defaults to config default.",
                    "default": "",
                },
                "cwd": {
                    "type": "string",
                    "description": "Working directory. Defaults to BRIDGE_CWD env var.",
                },
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "list_models",
        "description": "List all available CLI tools and their supported models on this machine.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
]

# ── Sync runner helper ────────────────────────────────────────────────

def _run_sync(runner_cls, prompt: str, *, cwd: str, model: str, timeout: int = 120) -> str:
    """Run an async runner synchronously in a thread, collect all text output."""
    DEFAULT_CWD = os.getenv("BRIDGE_CWD", os.getcwd())
    cwd = cwd or DEFAULT_CWD

    output_parts: list[str] = []
    error_parts: list[str] = []
    done_event = threading.Event()

    async def _collect():
        runner = runner_cls()
        async for ev in runner.run(prompt, cwd=cwd, model=model):
            etype = ev.get("event", "")
            if etype == "text":
                output_parts.append(ev.get("content", ""))
            elif etype == "output":
                output_parts.append(ev.get("content", ""))
            elif etype == "tool_use":
                output_parts.append(f"[tool: {ev.get('tool')}] {ev.get('input', '')}")
            elif etype == "tool_result":
                output_parts.append(f"[result] {ev.get('content', '')[:300]}")
            elif etype == "error":
                error_parts.append(ev.get("message", ""))
            elif etype in ("result", "done", "end", "cancelled"):
                pass

    def _thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_collect())
        finally:
            loop.close()
            done_event.set()

    t = threading.Thread(target=_thread, daemon=True)
    t.start()
    t.join(timeout=timeout)

    if not done_event.is_set():
        return "[timeout] Execution exceeded time limit."

    if error_parts:
        return "[error] " + "\n".join(error_parts)

    return "\n".join(output_parts) or "(no output)"


# ── MCP request handler ───────────────────────────────────────────────

async def _handle_rpc(body: dict) -> dict:
    method = body.get("method", "")
    params = body.get("params") or {}
    req_id = body.get("id")

    def ok(result: Any) -> dict:
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    def err(code: int, msg: str) -> dict:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": msg}}

    # ── initialize ───────────────────────────────────────────────────
    if method == "initialize":
        return ok({
            "protocolVersion": MCP_VERSION,
            "serverInfo": SERVER_INFO,
            "capabilities": {
                "tools": {"listChanged": False},
            },
        })

    # ── notifications (no response needed) ──────────────────────────
    if method.startswith("notifications/"):
        return None  # type: ignore

    # ── tools/list ──────────────────────────────────────────────────
    if method == "tools/list":
        return ok({"tools": TOOLS})

    # ── tools/call ──────────────────────────────────────────────────
    if method == "tools/call":
        name = params.get("name", "")
        args = params.get("arguments") or {}

        if name == "list_models":
            data = await detect_models()
            return ok({
                "content": [{"type": "text", "text": json.dumps(data, indent=2)}],
                "isError": False,
            })

        if name == "run_claude_code":
            prompt = args.get("prompt", "")
            model = args.get("model", "sonnet")
            cwd = args.get("cwd", "")
            if not prompt:
                return err(-32602, "prompt is required")
            result = await asyncio.to_thread(
                _run_sync, ClaudeCodeRunner, prompt, cwd=cwd, model=model
            )
            return ok({
                "content": [{"type": "text", "text": result}],
                "isError": result.startswith("[error]"),
            })

        if name == "run_codex":
            prompt = args.get("prompt", "")
            model = args.get("model", "")
            cwd = args.get("cwd", "")
            if not prompt:
                return err(-32602, "prompt is required")
            result = await asyncio.to_thread(
                _run_sync, CodexRunner, prompt, cwd=cwd, model=model
            )
            return ok({
                "content": [{"type": "text", "text": result}],
                "isError": result.startswith("[error]"),
            })

        return err(-32601, f"Unknown tool: {name}")

    return err(-32601, f"Method not found: {method}")


# ── FastAPI route ─────────────────────────────────────────────────────

@router.post("/mcp")
async def mcp_endpoint(request: Request):
    """MCP Streamable HTTP transport endpoint."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
            status_code=400,
        )

    # Batch requests
    if isinstance(body, list):
        results = [r for r in [await _handle_rpc(b) for b in body] if r is not None]
        return JSONResponse(results)

    result = await _handle_rpc(body)
    if result is None:
        # Notification — no response body
        return JSONResponse(None, status_code=202)
    return JSONResponse(result)
