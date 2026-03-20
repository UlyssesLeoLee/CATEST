use crate::models::*;
use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;
use chrono::Utc;

pub async fn ensure_schema(pool: &PgPool) -> Result<()> {
    sqlx::query(r#"CREATE TABLE IF NOT EXISTS batch_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_type VARCHAR(50) NOT NULL,
        tenant_id UUID,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        total INT NOT NULL DEFAULT 0,
        processed INT NOT NULL DEFAULT 0,
        failed INT NOT NULL DEFAULT 0,
        payload JSONB NOT NULL DEFAULT '{}',
        error_log JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ
    )"#).execute(pool).await?;

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS batch_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES batch_jobs(id) ON DELETE CASCADE,
        item_key TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        retry_count INT NOT NULL DEFAULT 0,
        result JSONB,
        error TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )"#).execute(pool).await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_batch_items_job_id ON batch_items(job_id)")
        .execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status)")
        .execute(pool).await?;
    Ok(())
}

pub async fn create_job(pool: &PgPool, req: &CreateJobRequest) -> Result<BatchJob> {
    let job_type = serde_json::to_value(&req.job_type)?.as_str().unwrap_or("ingestion").to_string();
    let payload = req.payload.clone().unwrap_or(serde_json::Value::Object(Default::default()));
    let total = req.items.len() as i32;
    let job = sqlx::query_as::<_, BatchJob>(
        "INSERT INTO batch_jobs (job_type, tenant_id, total, payload) VALUES ($1, $2, $3, $4) RETURNING *"
    )
    .bind(&job_type)
    .bind(req.tenant_id)
    .bind(total)
    .bind(payload)
    .fetch_one(pool).await?;
    Ok(job)
}

pub async fn insert_items(pool: &PgPool, job_id: Uuid, items: &[String]) -> Result<Vec<BatchItem>> {
    let mut result = Vec::new();
    for key in items {
        let item = sqlx::query_as::<_, BatchItem>(
            "INSERT INTO batch_items (job_id, item_key) VALUES ($1, $2) RETURNING *"
        )
        .bind(job_id).bind(key)
        .fetch_one(pool).await?;
        result.push(item);
    }
    Ok(result)
}

pub async fn get_job(pool: &PgPool, job_id: Uuid) -> Result<Option<BatchJob>> {
    Ok(sqlx::query_as::<_, BatchJob>("SELECT * FROM batch_jobs WHERE id = $1")
        .bind(job_id).fetch_optional(pool).await?)
}

pub async fn list_jobs(pool: &PgPool, limit: i64) -> Result<Vec<BatchJob>> {
    Ok(sqlx::query_as::<_, BatchJob>("SELECT * FROM batch_jobs ORDER BY created_at DESC LIMIT $1")
        .bind(limit).fetch_all(pool).await?)
}

pub async fn update_job_status(pool: &PgPool, job_id: Uuid, status: &str) -> Result<()> {
    let now = Utc::now();
    match status {
        "running" => {
            sqlx::query("UPDATE batch_jobs SET status=$1, started_at=$2 WHERE id=$3")
                .bind(status).bind(now).bind(job_id).execute(pool).await?;
        }
        "done" | "failed" | "cancelled" => {
            sqlx::query("UPDATE batch_jobs SET status=$1, finished_at=$2 WHERE id=$3")
                .bind(status).bind(now).bind(job_id).execute(pool).await?;
        }
        _ => {
            sqlx::query("UPDATE batch_jobs SET status=$1 WHERE id=$2")
                .bind(status).bind(job_id).execute(pool).await?;
        }
    }
    Ok(())
}

pub async fn increment_progress(pool: &PgPool, job_id: Uuid, success: bool) -> Result<JobProgressUpdate> {
    let row = if success {
        sqlx::query_as::<_, BatchJob>(
            "UPDATE batch_jobs SET processed = processed + 1 WHERE id = $1 RETURNING *"
        )
    } else {
        sqlx::query_as::<_, BatchJob>(
            "UPDATE batch_jobs SET processed = processed + 1, failed = failed + 1 WHERE id = $1 RETURNING *"
        )
    }.bind(job_id).fetch_one(pool).await?;

    Ok(JobProgressUpdate {
        job_id,
        total: row.total,
        processed: row.processed,
        failed: row.failed,
        status: row.status,
    })
}

pub async fn update_item_status(pool: &PgPool, item_id: Uuid, status: &str, error: Option<&str>) -> Result<()> {
    sqlx::query("UPDATE batch_items SET status=$1, error=$2, updated_at=now() WHERE id=$3")
        .bind(status).bind(error).bind(item_id).execute(pool).await?;
    Ok(())
}

pub async fn get_pending_items(pool: &PgPool, job_id: Uuid) -> Result<Vec<BatchItem>> {
    Ok(sqlx::query_as::<_, BatchItem>(
        "SELECT * FROM batch_items WHERE job_id=$1 AND status='pending' ORDER BY updated_at"
    ).bind(job_id).fetch_all(pool).await?)
}
