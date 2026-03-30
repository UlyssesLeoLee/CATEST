"""AI Consumer — Kafka consumer that dispatches messages to AI microservices.

Subscribes to Rust/Arroyo topics using a SEPARATE consumer group (ai_rag_group),
so it does not interfere with the Rust Embedding Worker's consumption.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from aiokafka import AIOKafkaConsumer

from catest_ai.common.config import settings
from catest_ai.common.kafka_producer import TOPIC_RAG_CLEANED, TOPIC_SEGMENTS_PARSED
from catest_ai.common.llm import init_tracing
from catest_ai.consumer.router import dispatch

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

SUBSCRIBED_TOPICS = [TOPIC_RAG_CLEANED, TOPIC_SEGMENTS_PARSED]


async def run_consumer() -> None:
    """Main consumer loop."""
    init_tracing()

    consumer = AIOKafkaConsumer(
        *SUBSCRIBED_TOPICS,
        bootstrap_servers=settings.kafka_broker,
        group_id=settings.kafka_consumer_group,
        auto_offset_reset="latest",
        enable_auto_commit=True,
    )

    await consumer.start()
    logger.info(
        "ai-consumer started — group=%s, topics=%s, broker=%s",
        settings.kafka_consumer_group,
        SUBSCRIBED_TOPICS,
        settings.kafka_broker,
    )

    shutdown = asyncio.Event()

    def _signal_handler():
        logger.info("Shutdown signal received")
        shutdown.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    try:
        async for msg in consumer:
            if shutdown.is_set():
                break
            logger.debug(
                "Received: topic=%s partition=%d offset=%d",
                msg.topic,
                msg.partition,
                msg.offset,
            )
            await dispatch(msg.topic, msg.value)
    finally:
        await consumer.stop()
        logger.info("ai-consumer stopped")


def main() -> None:
    asyncio.run(run_consumer())


if __name__ == "__main__":
    main()
