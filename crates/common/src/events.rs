use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize)]
pub struct EventEnvelope<T> {
    pub event_id: Uuid,
    pub event_type: String,
    pub schema_version: i32,
    pub occurred_at: DateTime<Utc>,
    pub trace_id: Option<String>,
    pub tenant_id: Uuid,
    pub project_id: Uuid,
    pub snapshot_id: Option<Uuid>,
    pub actor_user_id: Option<Uuid>,
    pub payload: T,
}

impl<T> EventEnvelope<T> {
    pub fn new(tenant_id: Uuid, project_id: Uuid, event_type: &str, payload: T) -> Self {
        Self {
            event_id: Uuid::new_v4(),
            event_type: event_type.to_string(),
            schema_version: 1,
            occurred_at: Utc::now(),
            trace_id: None,
            tenant_id,
            project_id,
            snapshot_id: None,
            actor_user_id: None,
            payload,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoImportRequested {
    pub repository_id: Uuid,
    pub commit_sha: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SegmentGenerated {
    pub segment_id: Uuid,
    pub snapshot_id: Uuid,
    pub file_path: String,
    pub symbol_name: Option<String>,
}
