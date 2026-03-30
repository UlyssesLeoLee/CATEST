"""AI TB service — CAT-industry Terminology Base intelligence.

Exposes two pipelines:
- Check: term recognition + ISO 12620 consistency validation
- Discover: corpus analysis + dedup + domain classification
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from catest_ai.common.config import settings
from catest_ai.common.kafka_producer import TOPIC_AI_TB_CANDIDATES, kafka_producer
from catest_ai.common.llm import init_tracing
from catest_ai.common.rust_client import rust_client
from catest_ai.common.schemas import (
    CandidateStatus,
    TBCandidateEvent,
    TBCheckRequest,
    TBCheckResponse,
    TBDiscoverRequest,
    TermStatus,
)
from catest_ai.tb.graph import tb_check_graph, tb_discover_graph

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_tracing()
    await rust_client.start()
    await kafka_producer.start()
    logger.info("ai-tb ready on :%s", settings.service_port)
    yield
    await rust_client.stop()
    await kafka_producer.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="CATEST AI TB", version="0.2.0", lifespan=lifespan)

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "service": "ai-tb"}

    @app.post("/tb/check", response_model=TBCheckResponse)
    async def check(req: TBCheckRequest):
        """Run TB consistency check: term_recognize → consistency_check."""
        result = await tb_check_graph.ainvoke({
            "source_text": req.source_text,
            "target_text": req.target_text,
            "tb_names": req.tb_names,
            "domain": req.domain,
            "source_lang": req.source_lang,
            "target_lang": req.target_lang,
            "check_morphological": req.check_morphological,
            "check_case_sensitive": False,
        })

        return TBCheckResponse(
            hits=result.get("tb_hits", []),
            violations=result.get("tb_violations", []),
            passed=result.get("tb_passed", True),
            error_count=result.get("tb_error_count", 0),
            warning_count=result.get("tb_warning_count", 0),
        )

    @app.post("/tb/discover")
    async def discover(req: TBDiscoverRequest):
        """Run term discovery: corpus_analyze → dedup → domain_classify."""
        result = await tb_discover_graph.ainvoke({
            "texts": req.texts,
            "source_lang": req.source_lang,
            "target_lang": req.target_lang,
            "domain": req.domain,
            "min_frequency": req.min_frequency,
            "existing_tb_names": req.existing_tb_names,
        })

        scored = result.get("scored_candidates", [])

        # Publish candidates to Kafka
        for cand in scored:
            conf = cand.get("confidence", 0.0)
            if conf < 0.3:
                continue

            try:
                suggested_status = TermStatus(cand.get("suggested_status", "admittedTerm"))
            except ValueError:
                suggested_status = TermStatus.ADMITTED

            event = TBCandidateEvent(
                source_term=cand["term"],
                target_term=cand.get("suggested_translation"),
                definition=cand.get("definition"),
                part_of_speech=cand.get("part_of_speech", ""),
                domain=cand.get("domain", ""),
                frequency=cand.get("frequency", 1),
                confidence=conf,
                suggested_status=suggested_status,
                status=(
                    CandidateStatus.AUTO_APPROVED if conf >= 0.85
                    else CandidateStatus.PENDING_REVIEW
                ),
            )
            await kafka_producer.send_event(TOPIC_AI_TB_CANDIDATES, event)

        return {
            "candidates_found": len(scored),
            "auto_approved": sum(1 for c in scored if c.get("confidence", 0) >= 0.85),
            "pending_review": sum(1 for c in scored if 0.3 <= c.get("confidence", 0) < 0.85),
            "candidates": scored,
        }

    @app.post("/tb/discover-simple")
    async def discover_simple(text: str, language: str = ""):
        """Simplified discover endpoint for single text input (used by ai-consumer)."""
        result = await tb_discover_graph.ainvoke({
            "texts": [text],
            "text": text,
            "source_lang": language or "en",
            "target_lang": "zh",
            "min_frequency": 1,
        })
        return {"candidates": result.get("scored_candidates", [])}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("catest_ai.tb.app:app", host="0.0.0.0", port=34082, reload=True)
