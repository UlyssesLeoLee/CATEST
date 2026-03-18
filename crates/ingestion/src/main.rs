use anyhow::Result;
use catest_ingestion::{clone_repo, scan_and_index_files};
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<()> {
    common::init_tracing();
    tracing::info!("Starting Ingestion Worker");

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

    // Hardcoded for MVP demonstration
    let project_id_str = common::utils::get_env_default("DEMO_PROJECT_ID", "");
    let repo_url = common::utils::get_env_default(
        "DEMO_REPO_URL",
        "https://github.com/UlyssesLeoLee/CATEST.git",
    );

    if project_id_str.is_empty() {
        tracing::warn!("DEMO_PROJECT_ID not set, ingestion might fail");
    }

    // In a real scenario, this would be triggered by a Kafka event
    let snapshot_id = Uuid::new_v4();
    let repository_id = Uuid::nil(); // Using Nil as placeholder for demo
    let commit_sha = "HEAD"; // Placeholder for demonstration

    // Insert snapshot record first to satisfy foreign key constraint in 'files' table
    tracing::info!("Attempting to insert snapshot {} for project {}", snapshot_id, project_id_str);
    sqlx::query(
        "INSERT INTO snapshots (id, repository_id, commit_sha, status)
         VALUES ($1, $2, $3, 'running')"
    )
    .bind(snapshot_id)
    .bind(repository_id)
    .bind(commit_sha)
    .execute(&pool)
    .await?;
    tracing::info!("DATABASE_CONFIRMED: Inserted snapshot {} into database", snapshot_id);

    let temp_dir = std::env::temp_dir().join(format!("catest-{}", snapshot_id));

    clone_repo(&repo_url, &temp_dir).await?;
    let count = scan_and_index_files(&pool, snapshot_id, &temp_dir).await?;

    tracing::info!(
        "Successfully indexed {} files for snapshot {}",
        count,
        snapshot_id
    );

    // Finalize snapshot status
    sqlx::query(
        "UPDATE snapshots SET status = 'ready', finished_at = now() WHERE id = $1"
    )
    .bind(snapshot_id)
    .execute(&pool)
    .await?;

    // Publish event to Kafka for Arroyo/Downstream processing
    let kafka_port = common::utils::get_env_default("KAFKA_PORT", "39092");
    let default_kafka = format!("localhost:{}", kafka_port);
    let kafka_broker = common::utils::get_env_default("KAFKA_BROKER", &default_kafka);
    let producer = stream_events::KafkaProducer::new(&kafka_broker)?;
    let event = stream_events::SnapshotCreatedEvent {
        event_id: Uuid::new_v4(),
        snapshot_id,
        project_id: Uuid::parse_str(&project_id_str).unwrap_or_else(|_| Uuid::nil()),
        file_count: count,
        repo_url,
        occurred_at: chrono::Utc::now(),
    };
    producer
        .publish(
            stream_events::topics::SNAPSHOTS_CREATED,
            &snapshot_id.to_string(),
            &event,
        )
        .await?;
    tracing::info!(
        "Published SnapshotCreatedEvent for snapshot {}",
        snapshot_id
    );

    Ok(())
}
