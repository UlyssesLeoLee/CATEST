"""adapter-bridge — Host-side bridge that invokes local CLI agents.

Runs on the HOST MACHINE (not in K8s) to spawn Claude Code, Codex, and
Antigravity as local subprocesses.  Streams real-time output back to the
orchestration chat UI via Server-Sent Events (SSE).

Start:
    python -m catest_ai.adapter_bridge.main
    # or: uvicorn catest_ai.adapter_bridge.main:app --host 0.0.0.0 --port 34099
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from catest_ai.adapter_bridge.runners import create_runner, detect_models
from catest_ai.adapter_bridge.mcp_server import router as mcp_router
from catest_ai.adapter_bridge import chat_store

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
logger = logging.getLogger("adapter-bridge")

# ── Active execution state ────────────────────────────────────────────
_streams: dict[str, asyncio.Queue] = {}
_tasks: dict[str, asyncio.Task] = {}

CALLBACK_URL = os.getenv(
    "CALLBACK_URL",
    "http://localhost:33088/api/orchestration",
)
DEFAULT_CWD = os.getenv("BRIDGE_CWD", os.getcwd())


# ── Models ────────────────────────────────────────────────────────────


class ExecuteRequest(BaseModel):
    trace_id: str = ""
    prompt: str
    target: str  # claude_code | codex | antigravity
    model: str = ""  # e.g. claude-opus-4-6, o4-mini
    project: str = "default"
    cwd: str = ""


class ExecuteResponse(BaseModel):
    trace_id: str
    status: str = "started"


# ── Lifecycle ─────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info(
        "adapter-bridge started  cwd=%s  callback=%s", DEFAULT_CWD, CALLBACK_URL
    )
    yield
    for t in _tasks.values():
        t.cancel()
    _streams.clear()
    logger.info("adapter-bridge stopped")


app = FastAPI(title="adapter-bridge", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(mcp_router)


# ── Routes ────────────────────────────────────────────────────────────


@app.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "service": "adapter-bridge",
        "active": list(_streams.keys()),
    }


@app.get("/models")
async def models():
    """Return available CLI targets and their models, detected from local installations."""
    return await detect_models()


@app.post("/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest):
    """Start a CLI agent execution.  Output is available via GET /stream/{trace_id}."""
    trace_id = req.trace_id or str(uuid.uuid4())
    cwd = req.cwd or DEFAULT_CWD

    queue: asyncio.Queue = asyncio.Queue()
    _streams[trace_id] = queue
    print("\n" + "="*60)
    print(f"DEBUG: INCOMING PROMPT FROM ORCHESTRATION")
    print(f"TARGET: {req.target}")
    print(f"PROMPT: {req.prompt}")
    print("="*60 + "\n")
    logger.info("[%s] Received execution request for '%s': %s", trace_id[:8], req.target, req.prompt)

    async def _run() -> None:
        runner = create_runner(req.target)
        final_status = "completed"
        try:
            # ── Persist session + user prompt ──────────────────────────
            await chat_store.open_session(
                trace_id, req.target, req.model, req.project
            )
            await chat_store.store_prompt(trace_id, req.prompt)

            await queue.put(
                {"event": "start", "target": req.target, "trace_id": trace_id}
            )

            seq = 1
            async for chunk in runner.run(req.prompt, cwd=cwd, project=req.project, model=req.model):
                await queue.put(chunk)
                # ── Persist each SSE event by kind ─────────────────────
                await chat_store.store_event(trace_id, seq, chunk)
                # IDE delivery events carry extra context
                if chunk.get("event") in ("status",) and req.model == "ide":
                    msg = chunk.get("message", "")
                    if "pasted" in msg.lower() or "✓" in msg:
                        await chat_store.store_ide_delivery(
                            trace_id, req.target, req.prompt,
                            success=True, ps1_stdout=msg,
                        )
                    elif chunk.get("event") == "error":
                        await chat_store.store_ide_delivery(
                            trace_id, req.target, req.prompt,
                            success=False, error_message=chunk.get("message"),
                        )
                seq += 1

            await queue.put({"event": "done"})

            # Notify intent-gateway (best-effort)
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        f"{CALLBACK_URL}/callback/result",
                        json={
                            "trace_id": trace_id,
                            "adapter": req.target,
                            "status": "success",
                            "output": {},
                        },
                    )
            except Exception:
                logger.debug("callback to intent-gateway failed (non-fatal)")

        except asyncio.CancelledError:
            await queue.put({"event": "cancelled"})
            final_status = "cancelled"
        except Exception as exc:
            logger.exception("[%s] execution failed", trace_id[:8])
            await queue.put({"event": "error", "message": str(exc)})
            final_status = "failed"
        finally:
            await chat_store.close_session(trace_id, final_status)
            await queue.put(None)  # sentinel → end SSE stream

    _tasks[trace_id] = asyncio.create_task(_run())
    return ExecuteResponse(trace_id=trace_id)


@app.get("/stream/{trace_id}")
async def stream(trace_id: str):
    """SSE stream of CLI output for a running execution."""

    # Give the /execute call a moment to register the queue
    queue = _streams.get(trace_id)
    if queue is None:
        for _ in range(50):
            await asyncio.sleep(0.1)
            queue = _streams.get(trace_id)
            if queue is not None:
                break

    if queue is None:
        return StreamingResponse(
            iter([f'data: {json.dumps({"event": "error", "message": "trace not found"})}\n\n']),
            media_type="text/event-stream",
        )

    async def _generate():
        try:
            while True:
                chunk = await asyncio.wait_for(queue.get(), timeout=600)
                if chunk is None:
                    yield f'data: {json.dumps({"event": "end"})}\n\n'
                    break
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        except asyncio.TimeoutError:
            yield f'data: {json.dumps({"event": "timeout"})}\n\n'
        finally:
            _streams.pop(trace_id, None)
            _tasks.pop(trace_id, None)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/stop/{trace_id}")
async def stop(trace_id: str):
    """Cancel a running execution."""
    task = _tasks.pop(trace_id, None)
    if task:
        task.cancel()
        _streams.pop(trace_id, None)
        return {"status": "stopped", "trace_id": trace_id}
    return {"status": "not_found", "trace_id": trace_id}


# ── Entry point ───────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=34101)
