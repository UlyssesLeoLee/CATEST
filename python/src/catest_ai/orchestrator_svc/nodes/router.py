"""Router node — fan-out to RAG (chain A) and LLM dispatch (chain B) via Kafka."""

from __future__ import annotations

import logging

from catest_ai.common.kafka_producer import kafka_producer
from catest_ai.orchestration_schemas import OrchestrationEvent, OrchestrationTopics
from catest_ai.orchestrator_svc.state import OrchestratorState

logger = logging.getLogger(__name__)


async def route_rag(state: OrchestratorState) -> dict:
    """Chain A: send TaskEnvelope + embedding to memory-service via Kafka."""
    event = OrchestrationEvent(
        event_type=OrchestrationTopics.RAG_STORE_REQUEST,
        trace_id=state["trace_id"],
        source_service="orchestrator-svc",
        payload={
            **state["envelope"],
            "_embedding": state["embedding"],
        },
    )
    await kafka_producer.send_event(OrchestrationTopics.RAG_STORE_REQUEST, event)
    logger.info("[%s] RAG store request dispatched", state["trace_id"][:8])
    return {"rag_dispatched": True}


async def route_llm(state: OrchestratorState) -> dict:
    """Chain B: send TaskEnvelope to dispatch-router via Kafka."""
    event = OrchestrationEvent(
        event_type=OrchestrationTopics.LLM_DISPATCH_REQUEST,
        trace_id=state["trace_id"],
        source_service="orchestrator-svc",
        payload=state["envelope"],
    )
    await kafka_producer.send_event(OrchestrationTopics.LLM_DISPATCH_REQUEST, event)
    logger.info("[%s] LLM dispatch request sent", state["trace_id"][:8])
    return {"llm_dispatched": True}
