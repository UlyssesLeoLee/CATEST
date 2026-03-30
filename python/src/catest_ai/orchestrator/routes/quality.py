"""Quality evaluation endpoint — routes to ai-qe service."""

from __future__ import annotations

import httpx
from fastapi import APIRouter

from catest_ai.common.schemas import QualityEvalRequest, QualityEvalResponse

router = APIRouter(tags=["quality"])

AI_QE_URL = "http://catest-ai-qe:34084"


@router.post("/eval", response_model=QualityEvalResponse)
async def quality_eval(req: QualityEvalRequest):
    """Evaluate translation quality using AI."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{AI_QE_URL}/qe/eval",
            json=req.model_dump(mode="json"),
        )
        resp.raise_for_status()
        return QualityEvalResponse(**resp.json())
