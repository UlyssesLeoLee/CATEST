"""TB intelligence endpoints — routes to ai-tb service."""

from __future__ import annotations

import httpx
from fastapi import APIRouter

from catest_ai.common.schemas import TBCheckRequest, TBCheckResponse

router = APIRouter(tags=["tb"])

AI_TB_URL = "http://catest-ai-tb:34082"


@router.post("/check", response_model=TBCheckResponse)
async def tb_check(req: TBCheckRequest):
    """Check text against terminology base for consistency violations."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{AI_TB_URL}/tb/check",
            json=req.model_dump(mode="json"),
        )
        resp.raise_for_status()
        return TBCheckResponse(**resp.json())


@router.post("/discover")
async def tb_discover_trigger():
    """Manually trigger terminology discovery for recent segments."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"{AI_TB_URL}/tb/discover")
        resp.raise_for_status()
        return resp.json()
