"""Topic → handler mapping for the Kafka consumer."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Coroutine
from typing import Any

from catest_ai.common.kafka_producer import TOPIC_RAG_CLEANED, TOPIC_SEGMENTS_PARSED
from catest_ai.common.schemas import RagCleanedEvent, SegmentParsedEvent
from catest_ai.consumer.handlers.rag_cleaned import handle_rag_cleaned
from catest_ai.consumer.handlers.segments_parsed import handle_segments_parsed

logger = logging.getLogger(__name__)

# Type alias for async handler
Handler = Callable[..., Coroutine[Any, Any, None]]

# Topic → (deserializer, handler)
ROUTE_TABLE: dict[str, tuple[type, Handler]] = {
    TOPIC_RAG_CLEANED: (RagCleanedEvent, handle_rag_cleaned),
    TOPIC_SEGMENTS_PARSED: (SegmentParsedEvent, handle_segments_parsed),
}


async def dispatch(topic: str, raw_value: bytes) -> None:
    """Deserialize a Kafka message and route to the appropriate handler."""
    if topic not in ROUTE_TABLE:
        logger.warning("No handler for topic: %s", topic)
        return

    model_cls, handler = ROUTE_TABLE[topic]

    try:
        payload = json.loads(raw_value.decode("utf-8"))
        event = model_cls(**payload)
        await handler(event)
    except Exception as e:
        logger.error("Failed to process message on %s: %s", topic, e, exc_info=True)
