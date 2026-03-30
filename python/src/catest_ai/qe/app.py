"""AI QE service — MQM-based translation quality evaluation."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from catest_ai.common.config import settings
from catest_ai.common.kafka_producer import TOPIC_AI_QUALITY, kafka_producer
from catest_ai.common.llm import init_tracing
from catest_ai.common.schemas import KafkaEvent, QualityEvalRequest, QualityEvalResponse
from catest_ai.qe.graph import qe_graph

logger = logging.getLogger(__name__)


class QualityScoreEvent(KafkaEvent):
    event_type: str = "QualityScoreEvent"
    source_text: str
    target_text: str
    overall_score: float
    fluency: float
    accuracy: float
    terminology: float
    style: float


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_tracing()
    await kafka_producer.start()
    logger.info("ai-qe ready on :%s", settings.service_port)
    yield
    await kafka_producer.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="CATEST AI QE", version="0.1.0", lifespan=lifespan)

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "service": "ai-qe"}

    @app.post("/qe/eval", response_model=QualityEvalResponse)
    async def evaluate(req: QualityEvalRequest):
        """Evaluate translation quality using MQM framework."""
        result = await qe_graph.ainvoke({
            "source_text": req.source_text,
            "target_text": req.target_text,
            "context": req.context,
        })

        # Publish score event to Kafka
        event = QualityScoreEvent(
            source_text=req.source_text,
            target_text=req.target_text,
            overall_score=result.get("overall_score", 0.0),
            fluency=result.get("fluency", 0.0),
            accuracy=result.get("accuracy", 0.0),
            terminology=result.get("terminology", 0.0),
            style=result.get("style", 0.0),
        )
        await kafka_producer.send_event(TOPIC_AI_QUALITY, event)

        return QualityEvalResponse(
            overall_score=result.get("overall_score", 0.0),
            fluency=result.get("fluency", 0.0),
            accuracy=result.get("accuracy", 0.0),
            terminology=result.get("terminology", 0.0),
            style=result.get("style", 0.0),
            explanation=result.get("explanation", ""),
        )

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("catest_ai.qe.app:app", host="0.0.0.0", port=34084, reload=True)
