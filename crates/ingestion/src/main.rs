use anyhow::{Result, Context};
use catest_ingestion::{clone_repo, scan_and_index_files, FileDao};
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<()> {
    common::init_tracing();
    tracing::info!("Starting Ingestion Worker (with Ceph Storage & RAII)");

    let postgres_port = common::utils::get_env_default("POSTGRES_PORT", "35432");
    let default_db_url = format!(
        "postgres://catest:password@localhost:{}/catest_ingestion",
        postgres_port
    );
    let db_url = common::utils::get_env_default("DATABASE_URL", &default_db_url);
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // --- Storage Configuration (NAS Mount) ---
    let storage_root_str = common::utils::get_env_default("STORAGE_ROOT", "/data/catest");
    let storage_root = std::path::Path::new(&storage_root_str);
    tracing::info!("Using NAS Storage Root: {}", storage_root_str);

    // Hardcoded for MVP demonstration
    let project_id_str = common::utils::get_env_default("DEMO_PROJECT_ID", "");
    let repo_url = common::utils::get_env_default(
        "DEMO_REPO_URL",
        "https://github.com/UlyssesLeoLee/CATEST.git",
    );

    if project_id_str.is_empty() {
        tracing::warn!("DEMO_PROJECT_ID not set, ingestion might fail");
    }

    // --- Ingestion Flow (RAII) ---
    let snapshot_id = Uuid::new_v4();
    let repository_id = Uuid::nil(); 
    let commit_sha = "HEAD";

    tracing::info!("Creating snapshot {} for project {}", snapshot_id, project_id_str);
    sqlx::query(
        "INSERT INTO snapshots (id, repository_id, commit_sha, status)
         VALUES ($1, $2, $3, 'running')"
    )
    .bind(snapshot_id)
    .bind(repository_id)
    .bind(commit_sha)
    .execute(&pool)
    .await?;

    // Use tempfile for RAII automatic cleanup of the clone
    let temp_dir = tempfile::tempdir().context("Failed to create RAII temp directory")?;
    let repo_path = temp_dir.path();

    clone_repo(&repo_url, repo_path).await?;
    
    // Scan, Index (DB) and Write to NAS
    let manifest = catest_ingestion::scan_and_index_files(
        &pool as &dyn catest_ingestion::FileDao, 
        storage_root, 
        snapshot_id, 
        repo_path
    ).await?;


    let file_count = manifest.len();

    // --- Write Manifest to NAS ---
    let manifest_json = serde_json::to_vec(&manifest)?;
    let manifest_rel_path = format!("{}/manifest.json", snapshot_id);
    let manifest_full_path = storage_root.join(&manifest_rel_path);
    
    if let Some(parent) = manifest_full_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&manifest_full_path, manifest_json).await?;
    
    tracing::info!(
        "Successfully indexed and stored {} files + manifest for snapshot {} on NAS",
        file_count,
        snapshot_id
    );

    // Finalize snapshot status
    sqlx::query(
        "UPDATE snapshots SET status = 'ready', finished_at = now() WHERE id = $1"
    )
    .bind(snapshot_id)
    .execute(&pool)
    .await?;

    // Publish event to Kafka
    let kafka_port = common::utils::get_env_default("KAFKA_PORT", "39092");
    let default_kafka = format!("localhost:{}", kafka_port);
    let kafka_broker = common::utils::get_env_default("KAFKA_BROKER", &default_kafka);
    let producer = stream_events::KafkaProducer::new(&kafka_broker)?;
    let event = stream_events::SnapshotCreatedEvent {
        event_id: Uuid::new_v4(),
        snapshot_id,
        project_id: Uuid::parse_str(&project_id_str).unwrap_or_else(|_| Uuid::nil()),
        file_count,
        repo_url,
        manifest_s3_key: Some(manifest_rel_path),
        occurred_at: chrono::Utc::now(),
    };
    producer
        .publish(
            stream_events::topics::SNAPSHOTS_CREATED,
            &snapshot_id.to_string(),
            &event,
        )
        .await?;


    
    tracing::info!("Published SnapshotCreatedEvent for snapshot {}. RAII directory will be cleaned up now.", snapshot_id);

    Ok(())
}

