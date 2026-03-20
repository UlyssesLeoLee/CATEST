//! Kafka consumer that processes batch items
use crate::{db, models::*};
use anyhow::Result;
use sqlx::PgPool;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::ClientConfig;
use rdkafka::message::Message;
use futures::StreamExt;

pub async fn run_worker_loop(pool: PgPool, kafka_broker: &str, group_id: &str) -> Result<()> {
    tracing::info!("Batch worker started, consuming from catest.batch.*");

    let topics = ["catest.batch.ingestion", "catest.batch.review", "catest.batch.mb_rebuild"];

    let consumer: StreamConsumer = ClientConfig::new()
        .set("group.id", group_id)
        .set("bootstrap.servers", kafka_broker)
        .set("auto.offset.reset", "earliest")
        .set("enable.auto.commit", "true")
        .create()?;

    consumer.subscribe(&topics)?;

    let mut stream = consumer.stream();
    while let Some(msg_result) = stream.next().await {
        match msg_result {
            Ok(msg) => {
                if let Some(payload) = msg.payload() {
                    match serde_json::from_slice::<WorkerMessage>(payload) {
                        Ok(work) => {
                            process_item(&pool, work).await;
                        }
                        Err(e) => {
                            tracing::error!("Failed to deserialize WorkerMessage: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!("Kafka consumer error: {}", e);
            }
        }
    }
    Ok(())
}

async fn process_item(pool: &PgPool, work: WorkerMessage) {
    tracing::info!("Processing item {} for job {} (type: {:?})", work.item_id, work.job_id, work.job_type);

    // Mark item as processing
    if let Err(e) = db::update_item_status(pool, work.item_id, "processing", None).await {
        tracing::error!("Failed to update item status: {}", e);
        return;
    }

    // Dispatch based on job type
    let result = match work.job_type {
        JobType::Ingestion => process_ingestion(&work).await,
        JobType::Review => process_review(&work).await,
        JobType::MbRebuild => process_mb_rebuild(&work).await,
    };

    match result {
        Ok(_) => {
            let _ = db::update_item_status(pool, work.item_id, "done", None).await;
            let progress = db::increment_progress(pool, work.job_id, true).await;
            if let Ok(p) = progress {
                tracing::info!("Job {} progress: {}/{}", work.job_id, p.processed, p.total);
                // Auto-complete job if all items done
                if p.processed >= p.total {
                    let _ = db::update_job_status(pool, work.job_id, "done").await;
                    tracing::info!("Job {} completed!", work.job_id);
                }
            }
        }
        Err(e) => {
            tracing::error!("Item {} failed: {}", work.item_id, e);
            let _ = db::update_item_status(pool, work.item_id, "failed", Some(&e.to_string())).await;
            let _ = db::increment_progress(pool, work.job_id, false).await;
        }
    }
}

async fn process_ingestion(work: &WorkerMessage) -> anyhow::Result<()> {
    tracing::info!("Ingestion: processing repo/file: {}", work.item_key);
    let ingestion_url = std::env::var("INGESTION_SERVICE_URL")
        .unwrap_or_else(|_| "http://catest-ingestion:33082".to_string());

    let client = reqwest::Client::new();
    let resp = client.post(format!("{}/ingest", ingestion_url))
        .json(&serde_json::json!({
            "repo_url": work.item_key,
            "job_id": work.job_id,
            "payload": work.payload
        }))
        .send().await?;

    if !resp.status().is_success() {
        anyhow::bail!("Ingestion service returned: {}", resp.status());
    }
    Ok(())
}

async fn process_review(work: &WorkerMessage) -> anyhow::Result<()> {
    tracing::info!("Review: processing item: {}", work.item_key);
    let review_url = std::env::var("REVIEW_SERVICE_URL")
        .unwrap_or_else(|_| "http://catest-review:33081".to_string());

    let client = reqwest::Client::new();
    let resp = client.post(format!("{}/review-tasks", review_url))
        .json(&serde_json::json!({
            "item_key": work.item_key,
            "job_id": work.job_id
        }))
        .send().await?;

    if !resp.status().is_success() {
        anyhow::bail!("Review service returned: {}", resp.status());
    }
    Ok(())
}

async fn process_mb_rebuild(work: &WorkerMessage) -> anyhow::Result<()> {
    tracing::info!("MB Rebuild: processing segment: {}", work.item_key);
    // Placeholder: call intelligence/embedding service
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    Ok(())
}
