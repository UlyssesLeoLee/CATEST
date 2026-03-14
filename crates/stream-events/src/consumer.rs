use anyhow::{Context, Result};
use rdkafka::ClientConfig;
use rdkafka::consumer::{StreamConsumer, Consumer};
use rdkafka::message::Message;
use serde::de::DeserializeOwned;
use futures::StreamExt;

/// A thin async Kafka consumer using rdkafka.
pub struct KafkaConsumer {
    inner: StreamConsumer,
}

impl KafkaConsumer {
    /// Create a consumer for the given topics in the given consumer group.
    pub fn new(bootstrap_servers: &str, group_id: &str, topics: &[&str]) -> Result<Self> {
        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", bootstrap_servers)
            .set("group.id", group_id)
            .set("auto.offset.reset", "earliest")
            .set("enable.auto.commit", "true")
            .create()
            .context("Failed to create Kafka consumer")?;

        consumer
            .subscribe(topics)
            .context("Failed to subscribe to Kafka topics")?;

        Ok(Self { inner: consumer })
    }

    /// Process messages in an async loop, calling `handler` for each deserialized event.
    pub async fn run<E, F, Fut>(&self, mut handler: F) -> Result<()>
    where
        E: DeserializeOwned,
        F: FnMut(E) -> Fut,
        Fut: std::future::Future<Output = Result<()>>,
    {
        let mut stream = self.inner.stream();
        while let Some(message) = stream.next().await {
            match message {
                Err(e) => tracing::warn!("Kafka consumer error: {:?}", e),
                Ok(msg) => {
                    if let Some(payload) = msg.payload() {
                        match serde_json::from_slice::<E>(payload) {
                            Ok(event) => {
                                if let Err(e) = handler(event).await {
                                    tracing::error!("Event handler error: {:?}", e);
                                }
                            }
                            Err(e) => tracing::warn!("Failed to deserialize Kafka message: {:?}", e),
                        }
                    }
                }
            }
        }
        Ok(())
    }
}
