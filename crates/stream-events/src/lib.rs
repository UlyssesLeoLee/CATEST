#[cfg(feature = "mock")]
use mockall::automock;
use serde::de::DeserializeOwned;

#[cfg_attr(feature = "mock", automock)]
#[async_trait::async_trait]
pub trait EventConsumer: Send + Sync {
    async fn run<E, F, Fut>(&self, handler: F) -> anyhow::Result<()>
    where
        E: DeserializeOwned + Send + 'static,
        F: FnMut(E) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = anyhow::Result<()>> + Send + 'static;
}

pub mod consumer;
pub mod events;
pub mod producer;

pub use consumer::KafkaConsumer;
pub use events::{DomainEvent, ReviewFindingEvent, SegmentParsedEvent, SnapshotCreatedEvent};
pub use producer::KafkaProducer;

/// Kafka topic names — centralized to avoid magic strings across services.
pub mod topics {
    pub const SNAPSHOTS_CREATED: &str = "catest.snapshots.created";
    pub const SEGMENTS_PARSED: &str = "catest.segments.parsed";
    pub const REVIEW_FINDINGS: &str = "catest.review.findings";
    pub const RAG_INGEST: &str = "catest.rag.ingest"; // Gateway -> Arroyo
    pub const RAG_CLEANED: &str = "catest.rag.cleaned"; // Arroyo -> Rust Consumer
    pub const STATS_SEGMENTS: &str = "catest.stats.segments"; // Arroyo output
    pub const STATS_REVIEW_ROLLUP: &str = "catest.stats.review-rollup"; // Arroyo output
}

#[cfg(test)]
mod tests {
    use super::events::*;
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn test_snapshot_event_roundtrip() {
        let event = SnapshotCreatedEvent {
            event_id: Uuid::new_v4(),
            snapshot_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            file_count: 42,
            repo_url: "https://github.com/test/repo.git".to_string(),
            occurred_at: Utc::now(),
        };
        let json = serde_json::to_string(&event).unwrap();
        let decoded: SnapshotCreatedEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(event.event_id, decoded.event_id);
        assert_eq!(event.file_count, decoded.file_count);
    }

    #[test]
    fn test_segment_event_roundtrip() {
        let event = SegmentParsedEvent {
            event_id: Uuid::new_v4(),
            snapshot_id: Uuid::new_v4(),
            file_id: Uuid::new_v4(),
            segment_count: 7,
            language: "rust".to_string(),
            occurred_at: Utc::now(),
        };
        let json = serde_json::to_string(&event).unwrap();
        let decoded: SegmentParsedEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(event.event_id, decoded.event_id);
        assert_eq!(event.language, decoded.language);
    }

    #[test]
    fn test_review_finding_event_roundtrip() {
        let event = ReviewFindingEvent {
            event_id: Uuid::new_v4(),
            task_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            severity: "high".to_string(),
            rule_id: "SEC-001".to_string(),
            occurred_at: Utc::now(),
        };
        let json = serde_json::to_string(&event).unwrap();
        let decoded: ReviewFindingEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(event.event_id, decoded.event_id);
        assert_eq!(event.severity, decoded.severity);
    }

    #[test]
    fn test_domain_event_tagged_serde() {
        let event = DomainEvent::SnapshotCreated(SnapshotCreatedEvent {
            event_id: Uuid::new_v4(),
            snapshot_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            file_count: 5,
            repo_url: "https://example.com/repo".to_string(),
            occurred_at: Utc::now(),
        });
        let json = serde_json::to_string(&event).unwrap();
        // The tagged enum should have event_type field
        assert!(json.contains("\"event_type\":\"SnapshotCreated\""));
        let decoded: DomainEvent = serde_json::from_str(&json).unwrap();
        assert!(matches!(decoded, DomainEvent::SnapshotCreated(_)));
    }
}
