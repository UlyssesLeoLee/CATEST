"""Auto-note endpoint — orchestrates the full CAT annotation pipeline."""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Header

from catest_ai.common.config import settings
from catest_ai.common.kafka_producer import TOPIC_AI_NOTES, kafka_producer
from catest_ai.common.schemas import (
    AIMode,
    AINotesEvent,
    AutoNoteRequest,
    AutoNoteResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auto-note"])

# Downstream service URLs (in-cluster)
AI_NOTE_URL = "http://catest-ai-note:34083"


@router.post("/auto-note", response_model=AutoNoteResponse)
async def auto_note(
    req: AutoNoteRequest,
    x_ai_mode: AIMode | None = Header(None, alias="X-AI-Mode"),
):
    """
    Dispatches to ai-note service for the actual LangGraph execution.
    Handles mode override via header and Kafka event publishing.
    """
    # Header overrides body mode
    mode = x_ai_mode or req.mode

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{AI_NOTE_URL}/note/generate",
            json=req.model_dump(mode="json") | {"mode": mode.value},
        )
        resp.raise_for_status()
        result = AutoNoteResponse(**resp.json())

    # In full mode, publish result to Kafka for Rust side consumption
    if mode == AIMode.FULL:
        event = AINotesEvent(
            source_text=req.source_text,
            target_text=req.target_text,
            notes=result.notes,
            quality_score=result.quality_score,
        )
        await kafka_producer.send_event(TOPIC_AI_NOTES, event)

    return result
