use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobType {
    Ingestion,
    Review,
    MbRebuild,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Queued,
    Running,
    Done,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    Pending,
    Processing,
    Done,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct BatchJob {
    pub id: Uuid,
    pub job_type: String,
    pub tenant_id: Option<Uuid>,
    pub status: String,
    pub total: i32,
    pub processed: i32,
    pub failed: i32,
    pub payload: serde_json::Value,
    pub error_log: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct BatchItem {
    pub id: Uuid,
    pub job_id: Uuid,
    pub item_key: String,
    pub status: String,
    pub retry_count: i32,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateJobRequest {
    pub job_type: JobType,
    pub tenant_id: Option<Uuid>,
    pub items: Vec<String>,
    pub payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobProgressUpdate {
    pub job_id: Uuid,
    pub total: i32,
    pub processed: i32,
    pub failed: i32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerMessage {
    pub job_id: Uuid,
    pub item_id: Uuid,
    pub item_key: String,
    pub job_type: JobType,
    pub payload: serde_json::Value,
}
