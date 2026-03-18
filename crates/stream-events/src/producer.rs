use anyhow::{Context, Result};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::ClientConfig;
use serde::Serialize;
use std::time::Duration;

/// A thin async Kafka producer using rdkafka.
#[derive(Clone)]
pub struct KafkaProducer {
    inner: FutureProducer,
}

impl KafkaProducer {
    /// Create a new Kafka producer connecting to `bootstrap_servers`.
    pub fn new(bootstrap_servers: &str) -> Result<Self> {
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", bootstrap_servers)
            .set("message.timeout.ms", "5000")
            .set("acks", "1")
            .create()
            .context("Failed to create Kafka producer")?;
        Ok(Self { inner: producer })
    }

    /// Publish a serializable event to a Kafka `topic` keyed by `key`.
    pub async fn publish<E: Serialize>(&self, topic: &str, key: &str, event: &E) -> Result<()> {
        let payload = serde_json::to_string(event).context("Failed to serialize Kafka event")?;

        self.inner
            .send(
                FutureRecord::to(topic).key(key).payload(&payload),
                Duration::from_secs(5),
            )
            .await
            .map_err(|(err, _msg)| anyhow::anyhow!("Kafka send error: {:?}", err))?;

        tracing::debug!(topic = %topic, key = %key, "Published Kafka event");
        Ok(())
    }
}
