"""TM intelligence endpoints — routes to ai-tm service."""

from __future__ import annotations

import httpx
from fastapi import APIRouter

from catest_ai.common.schemas import TMSuggestRequest, TMSuggestResponse

router = APIRouter(tags=["tm"])

AI_TM_URL = "http://catest-ai-tm:34081"


@router.post("/suggest", response_model=TMSuggestResponse)
async def tm_suggest(req: TMSuggestRequest):
    """Get AI-powered TM suggestions for translation segments."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{AI_TM_URL}/tm/suggest",
            json=req.model_dump(mode="json"),
        )
        resp.raise_for_status()
        return TMSuggestResponse(**resp.json())


@router.post("/enrich")
async def tm_enrich_trigger():
    """Manually trigger TM enrichment for pending items."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"{AI_TM_URL}/tm/enrich")
        resp.raise_for_status()
        return resp.json()
