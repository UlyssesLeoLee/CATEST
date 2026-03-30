"""Handler: process catest.segments.parsed events → dispatch to ai-tb for term discovery."""

from __future__ import annotations

import logging

import httpx

from catest_ai.common.schemas import SegmentParsedEvent

logger = logging.getLogger(__name__)

AI_TB_URL = "http://catest-ai-tb:34082"


async def handle_segments_parsed(event: SegmentParsedEvent) -> None:
    """
    When code segments are parsed, send to ai-tb for terminology extraction.
    The actual segment content would need to be fetched from the storage/API.
    """
    logger.info(
        "Segments parsed: snapshot=%s, file=%s, count=%d, lang=%s",
        event.snapshot_id,
        event.file_id,
        event.segment_count,
        event.language,
    )

    # For now, we log the event. In production, fetch segment text from
    # Rust Gateway or NAS storage, then dispatch to ai-tb.
    # This is a placeholder for the full integration.
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            await client.post(
                f"{AI_TB_URL}/tb/discover",
                params={
                    "text": f"[segment from {event.language} file {event.file_id}]",
                    "language": event.language,
                },
            )
        except Exception as e:
            logger.error("TB discovery for segments failed: %s", e)
