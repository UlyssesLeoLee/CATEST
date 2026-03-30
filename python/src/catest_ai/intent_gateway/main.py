"""intent-gateway — entry point for AI Orchestration Domain.

Receives user intent, generates trace_id, publishes to Kafka,
and forwards to orchestrator-svc for structured processing.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from catest_ai.common.config import settings
from catest_ai.common.kafka_producer import KafkaProducerService
from catest_ai.orchestration_schemas import (
    OrchestrationEvent,
    OrchestrationTopics,
    TaskEnvelope,
)

logger = logging.getLogger(__name__)

kafka = KafkaProducerService()
http_client: httpx.AsyncClient | None = None

ORCHESTRATOR_URL = f"http://catest-orchestrator-svc:{settings.service_port + 1}"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global http_client
    await kafka.start()
    http_client = httpx.AsyncClient(timeout=60.0)
    logger.info("intent-gateway started")
    yield
    await kafka.stop()
    if http_client:
        await http_client.aclose()


app = FastAPI(title="intent-gateway", lifespan=lifespan)


# ─── Request / Response ───


class IntentRequest(BaseModel):
    input: str
    project: str = "default"
    dispatch_target: str = "claude_code"  # codex | claude_code | antigravity
    metadata: dict = {}


class IntentResponse(BaseModel):
    trace_id: str
    status: str = "accepted"


# ─── Routes ───


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "intent-gateway"}


@app.post("/intent", response_model=IntentResponse)
async def receive_intent(req: IntentRequest):
    if not req.input.strip():
        raise HTTPException(400, "input must not be empty")

    # Build initial envelope with trace_id
    envelope = TaskEnvelope(
        raw_input=req.input,
        project=req.project,
        metadata=req.metadata,
    )
    trace_id = envelope.trace_id

    # 1) Publish intent.received event
    await kafka.send_event(
        OrchestrationTopics.INTENT_RECEIVED,
        OrchestrationEvent(
            event_type=OrchestrationTopics.INTENT_RECEIVED,
            trace_id=trace_id,
            source_service="intent-gateway",
            payload={
                "raw_input": req.input,
                "project": req.project,
                "dispatch_target": req.dispatch_target,
            },
        ),
    )

    # 2) Forward to orchestrator-svc (fire-and-forget style with timeout)
    try:
        await http_client.post(
            f"{ORCHESTRATOR_URL}/process",
            json={
                "trace_id": trace_id,
                "raw_input": req.input,
                "project": req.project,
                "dispatch_target": req.dispatch_target,
                "metadata": req.metadata,
            },
        )
    except httpx.HTTPError as e:
        logger.warning("orchestrator-svc call failed (async processing): %s", e)
        # Non-fatal — the Kafka event ensures at-least-once processing

    return IntentResponse(trace_id=trace_id)


# ─── Callback from adapters / MCP agents ───


class CallbackResultRequest(BaseModel):
    trace_id: str
    adapter: str = "mcp_agent"
    status: str = "success"
    output: dict = {}
    artifacts: list[str] = []
    error: str | None = None


@app.post("/callback/result")
async def callback_result(req: CallbackResultRequest):
    """Receive execution result from adapter or MCP agent."""
    await kafka.send_event(
        OrchestrationTopics.ADAPTER_RESULT,
        OrchestrationEvent(
            event_type=OrchestrationTopics.ADAPTER_RESULT,
            trace_id=req.trace_id,
            source_service=f"callback/{req.adapter}",
            status=req.status,
            payload={
                "adapter": req.adapter,
                "status": req.status,
                "output": req.output,
                "artifacts": req.artifacts,
                "error": req.error,
            },
        ),
    )
    logger.info("[%s] Result callback received from %s: %s", req.trace_id[:8], req.adapter, req.status)
    return {"status": "recorded", "trace_id": req.trace_id}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=34090)
