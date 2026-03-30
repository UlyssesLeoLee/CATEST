"""Shared async Kafka producer for all AI services."""

from __future__ import annotations

import json
import logging

from aiokafka import AIOKafkaProducer

from pydantic import BaseModel

from catest_ai.common.config import settings
from catest_ai.common.schemas import KafkaEvent

logger = logging.getLogger(__name__)

# ─── Topic constants ───
TOPIC_AI_NOTES = "catest.ai.notes"
TOPIC_AI_TM_CANDIDATES = "catest.ai.tm.candidates"
TOPIC_AI_TB_CANDIDATES = "catest.ai.tb.candidates"
TOPIC_AI_QUALITY = "catest.ai.quality"

# ─── Inbound topics (consumed by ai-consumer) ───
TOPIC_RAG_CLEANED = "catest.rag.cleaned"
TOPIC_SEGMENTS_PARSED = "catest.segments.parsed"


class KafkaProducerService:
    """Thin wrapper around aiokafka producer with JSON serialization."""

    def __init__(self) -> None:
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        self._producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_broker,
            value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
        )
        await self._producer.start()
        logger.info("Kafka producer started → %s", settings.kafka_broker)

    async def stop(self) -> None:
        if self._producer:
            await self._producer.stop()
            logger.info("Kafka producer stopped")

    async def send_event(self, topic: str, event: KafkaEvent | BaseModel) -> None:
        if not self._producer:
            raise RuntimeError("Kafka producer not started")
        payload = event.model_dump(mode="json")
        await self._producer.send_and_wait(topic, value=payload)
        event_type = getattr(event, "event_type", type(event).__name__)
        logger.debug("Sent %s → %s", event_type, topic)


kafka_producer = KafkaProducerService()
