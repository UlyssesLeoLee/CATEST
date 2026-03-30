"""AI TM service — CAT-industry Translation Memory intelligence.

Exposes two pipelines:
- Lookup: multi-level matching + penalty + fragment assembly
- Enrich: dedup + lifecycle management for new TM entries
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from catest_ai.common.config import settings
from catest_ai.common.kafka_producer import TOPIC_AI_TM_CANDIDATES, kafka_producer
from catest_ai.common.llm import init_tracing
from catest_ai.common.qdrant_service import qdrant_service
from catest_ai.common.rust_client import rust_client
from catest_ai.common.schemas import (
    CandidateStatus,
    TMCandidateEvent,
    TMSuggestRequest,
    TMSuggestResponse,
)
from catest_ai.tm.graph import tm_enrich_graph, tm_lookup_graph

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_tracing()
    await qdrant_service.start()
    await rust_client.start()
    await kafka_producer.start()
    logger.info("ai-tm ready on :%s", settings.service_port)
    yield
    await qdrant_service.stop()
    await rust_client.stop()
    await kafka_producer.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="CATEST AI TM", version="0.2.0", lifespan=lifespan)

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "service": "ai-tm"}

    @app.post("/tm/enrich")
    async def enrich(source_text: str, target_text: str):
        """Run TM enrichment pipeline: dedup → lifecycle evaluation."""
        result = await tm_enrich_graph.ainvoke({
            "source_text": source_text,
            "target_text": target_text,
        })

        if result.get("is_duplicate"):
            return {"status": "skipped", "reason": "duplicate"}

        action = result.get("lifecycle_action", "review")
        score = result.get("quality_score", 0.0)

        # Publish to Kafka based on lifecycle decision
        if action in ("add", "review"):
            event = TMCandidateEvent(
                source_text=source_text,
                target_text=target_text,
                quality_score=score,
                confidence=score,
                tags=result.get("tags", []),
                domain=result.get("domain", ""),
                status=(
                    CandidateStatus.AUTO_APPROVED if action == "add"
                    else CandidateStatus.PENDING_REVIEW
                ),
            )
            await kafka_producer.send_event(TOPIC_AI_TM_CANDIDATES, event)

        return {
            "status": action,
            "quality_score": score,
            "tags": result.get("tags", []),
            "domain": result.get("domain", ""),
            "quality_issues": result.get("quality_issues", []),
            "reason": result.get("lifecycle_reason", ""),
        }

    @app.post("/tm/lookup")
    async def lookup(
        source_text: str,
        prev_source: str = "",
        next_source: str = "",
        domain: str = "",
        min_score: int = 50,
    ):
        """Run full TM lookup pipeline: normalize → match → penalty → fragment → rank."""
        result = await tm_lookup_graph.ainvoke({
            "source_text": source_text,
            "prev_source": prev_source,
            "next_source": next_source,
            "domain": domain,
            "min_fuzzy_score": min_score,
            "max_results": 10,
            "enable_fragments": True,
            "enable_ice": True,
        })

        matches = result.get("tm_matches", [])
        return {
            "matches": [m.model_dump(mode="json") for m in matches],
            "best_match_type": result.get("best_match_type", "no_match"),
            "best_match_score": result.get("best_match_score", 0),
            "auto_populate_target": result.get("auto_populate_target"),
        }

    @app.post("/tm/suggest", response_model=TMSuggestResponse)
    async def suggest(req: TMSuggestRequest):
        """Batch TM lookup for multiple segments."""
        all_matches = []
        for seg in req.segments[:10]:
            result = await tm_lookup_graph.ainvoke({
                "source_text": seg.source,
                "prev_source": seg.prev_source,
                "next_source": seg.next_source,
                "min_fuzzy_score": req.min_score,
                "max_results": req.top_k,
                "enable_fragments": req.enable_fragments,
                "enable_ice": True,
            })
            all_matches.extend(result.get("tm_matches", []))
        return TMSuggestResponse(suggestions=all_matches)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("catest_ai.tm.app:app", host="0.0.0.0", port=34081, reload=True)
