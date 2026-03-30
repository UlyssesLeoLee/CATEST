"""orchestrator-svc — LangGraph-based requirement structuring and routing."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from catest_ai.common.kafka_producer import kafka_producer
from catest_ai.common.llm import init_tracing
from catest_ai.orchestration_schemas import OrchestrationEvent, OrchestrationTopics
from catest_ai.orchestrator_svc.graph import orchestration_graph

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_tracing()
    await kafka_producer.start()
    logger.info("orchestrator-svc started")
    yield
    await kafka_producer.stop()


app = FastAPI(title="orchestrator-svc", lifespan=lifespan)


class ProcessRequest(BaseModel):
    trace_id: str
    raw_input: str
    project: str = "default"
    dispatch_target: str = "claude_code"
    metadata: dict = {}


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "orchestrator-svc"}


@app.post("/process")
async def process_intent(req: ProcessRequest):
    """Run the LangGraph pipeline: Normalize → Structure → Embed → Build → Route."""
    initial_state = {
        "trace_id": req.trace_id,
        "raw_input": req.raw_input,
        "project": req.project,
        "dispatch_target": req.dispatch_target,
        "metadata": req.metadata,
    }

    result = await orchestration_graph.ainvoke(initial_state)

    # Publish normalized event
    await kafka_producer.send_event(
        OrchestrationTopics.INTENT_NORMALIZED,
        OrchestrationEvent(
            event_type=OrchestrationTopics.INTENT_NORMALIZED,
            trace_id=req.trace_id,
            source_service="orchestrator-svc",
            status="completed",
            payload=result.get("envelope", {}),
        ),
    )

    return {
        "trace_id": req.trace_id,
        "status": "processed",
        "title": result.get("title", ""),
        "tasks_count": len(result.get("tasks", [])),
        "rag_dispatched": result.get("rag_dispatched", False),
        "llm_dispatched": result.get("llm_dispatched", False),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=34091)
