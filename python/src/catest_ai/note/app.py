"""AI Note service — CAT auto-note generation via LangGraph.

The main translator-facing AI service. Integrates TM lookup, TB check,
QA rules, and LLM synthesis into a single response.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from catest_ai.common.config import settings
from catest_ai.common.llm import init_tracing
from catest_ai.common.qdrant_service import qdrant_service
from catest_ai.common.rust_client import rust_client
from catest_ai.common.schemas import AutoNoteRequest, AutoNoteResponse, TMMatchType
from catest_ai.note.graph import note_graph

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_tracing()
    await qdrant_service.start()
    await rust_client.start()
    logger.info("ai-note ready on :%s", settings.service_port)
    yield
    await qdrant_service.stop()
    await rust_client.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="CATEST AI Note", version="0.2.0", lifespan=lifespan)

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "service": "ai-note"}

    @app.post("/note/generate", response_model=AutoNoteResponse)
    async def generate_note(req: AutoNoteRequest):
        """Execute the auto-note LangGraph workflow."""
        initial_state = {
            "source_text": req.source_text,
            "target_text": req.target_text,
            "prev_source": req.prev_source,
            "next_source": req.next_source,
            "context": req.context,
            "tm_banks": req.tm_banks,
            "tb_names": req.tb_names,
            "primary_bank": req.tm_banks[0] if req.tm_banks else "default",
            "domain": req.domain,
            "source_lang": req.source_lang,
            "target_lang": req.target_lang,
            "mode": req.mode.value,
            "notes": [],
        }

        result = await note_graph.ainvoke(initial_state)

        # Extract detailed TM/TB info
        tm_matches = result.get("tm_matches", [])
        best_type = result.get("best_match_type", TMMatchType.NO_MATCH)
        best_score = result.get("best_match_score", 0)
        tb_hits = result.get("tb_hits", [])
        tb_violations = result.get("tb_violations", [])

        return AutoNoteResponse(
            notes=result.get("notes", []),
            quality_score=result.get("quality_score", 0.0),
            suggested_target=result.get("suggested_target")
                or result.get("auto_populate_target"),
            auto_approved=result.get("auto_approved", False),
            tm_matches=tm_matches,
            best_match_type=best_type if isinstance(best_type, TMMatchType) else TMMatchType.NO_MATCH,
            best_match_score=best_score,
            tb_hits=tb_hits,
            tb_violation_count=result.get("tb_error_count", 0),
        )

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("catest_ai.note.app:app", host="0.0.0.0", port=34083, reload=True)
