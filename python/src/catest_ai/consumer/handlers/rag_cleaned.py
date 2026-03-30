"""Handler: process catest.rag.cleaned events → dispatch to ai-tm and ai-tb."""

from __future__ import annotations

import logging

import httpx

from catest_ai.common.schemas import RagCleanedEvent

logger = logging.getLogger(__name__)

AI_TM_URL = "http://catest-ai-tm:34081"
AI_TB_URL = "http://catest-ai-tb:34082"


async def handle_rag_cleaned(event: RagCleanedEvent) -> None:
    """
    When a cleaned RAG item arrives:
    1. Send to ai-tm for enrichment (quality eval + auto-tag + TM candidate)
    2. Send to ai-tb for terminology discovery from the source text
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. TM Enrichment
        try:
            await client.post(
                f"{AI_TM_URL}/tm/enrich",
                params={
                    "source_text": event.cleaned_source,
                    "target_text": event.cleaned_target,
                },
            )
            logger.debug("TM enrichment dispatched for event %s", event.event_id)
        except Exception as e:
            logger.error("TM enrichment failed for %s: %s", event.event_id, e)

        # 2. TB Discovery (from source text)
        try:
            await client.post(
                f"{AI_TB_URL}/tb/discover",
                params={
                    "text": event.cleaned_source,
                },
            )
            logger.debug("TB discovery dispatched for event %s", event.event_id)
        except Exception as e:
            logger.error("TB discovery failed for %s: %s", event.event_id, e)
