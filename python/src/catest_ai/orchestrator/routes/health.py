"""Health check endpoint."""

from fastapi import APIRouter

from catest_ai.common.rust_client import rust_client

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz():
    rust_ok = await rust_client.health()
    return {
        "status": "ok",
        "service": "ai-orchestrator",
        "rust_gateway": "ok" if rust_ok else "unreachable",
    }
