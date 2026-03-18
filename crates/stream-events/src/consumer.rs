use anyhow::{Context, Result};
use futures::StreamExt;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::Message;
use rdkafka::ClientConfig;
use serde::de::DeserializeOwned;

use std::sync::Arc;

/// A thin async Kafka consumer using rdkafka.
#[derive(Clone)]
pub struct KafkaConsumer {
    inner: Arc<StreamConsumer>,
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

        Ok(Self { inner: Arc::new(consumer) })
    }
}

#[async_trait::async_trait]
impl crate::EventConsumer for KafkaConsumer {
    async fn run<E, F, Fut>(&self, mut handler: F) -> Result<()>
    where
        E: DeserializeOwned + Send + 'static,
        F: FnMut(E) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = Result<()>> + Send + 'static,
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
                            Err(e) => {
                                tracing::warn!("Failed to deserialize Kafka message: {:?}", e)
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }
}
