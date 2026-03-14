use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

/// Emitted by the ingestion service after a repo snapshot is fully indexed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotCreatedEvent {
    pub event_id: Uuid,
    pub snapshot_id: Uuid,
    pub project_id: Uuid,
    pub file_count: usize,
    pub repo_url: String,
    pub occurred_at: DateTime<Utc>,
}

/// Emitted by the parser service after code segments are extracted from a file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegmentParsedEvent {
    pub event_id: Uuid,
    pub snapshot_id: Uuid,
    pub file_id: Uuid,
    pub segment_count: usize,
    pub language: String,
    pub occurred_at: DateTime<Utc>,
}

/// Emitted by the review service when a review task is created.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewFindingEvent {
    pub event_id: Uuid,
    pub task_id: Uuid,
    pub project_id: Uuid,
    pub severity: String,
    pub rule_id: String,
    pub occurred_at: DateTime<Utc>,
}

/// All domain events in a single enum for generic dispatch.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", content = "payload")]
pub enum DomainEvent {
    SnapshotCreated(SnapshotCreatedEvent),
    SegmentParsed(SegmentParsedEvent),
    ReviewFinding(ReviewFindingEvent),
}
