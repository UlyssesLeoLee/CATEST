use anyhow::{Result, Context};
use catest_parser::{Segmenter, SegmentDao, process_snapshot};
use stream_events::EventConsumer;
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

struct ParserDao {
    pool: sqlx::PgPool,
}

#[async_trait::async_trait]
impl catest_parser::SegmentDao for ParserDao {
    async fn insert_segments(
        &self, 
        snapshot_id: Uuid, 
        symbol_name: Option<String>, 
        code_text: String,
        normalized_hash: String,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO segments (snapshot_id, symbol_name, code_text, normalized_hash)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (normalized_hash) DO NOTHING",
        )
        .bind(snapshot_id)
        .bind(symbol_name)
        .bind(code_text)
        .bind(normalized_hash)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    common::init_tracing();
    tracing::info!("Starting Parser Worker (Ceph & Idempotent)");

    let postgres_port = common::utils::get_env_default("POSTGRES_PORT", "35432");
    let default_parser_db = format!(
        "postgres://catest:password@localhost:{}/catest_parser",
        postgres_port
    );

    let parser_db_url = common::utils::get_env_default("DATABASE_URL", &default_parser_db);
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&parser_db_url)
        .await?;

    // --- Storage Configuration (NAS Mount) ---
    let storage_root_str = common::utils::get_env_default("STORAGE_ROOT", "/data/catest");
    let storage_root = std::sync::Arc::new(std::path::PathBuf::from(storage_root_str));
    tracing::info!("Using NAS Storage Root: {:?}", storage_root);

    let kafka_port = common::utils::get_env_default("KAFKA_PORT", "39092");
    let default_kafka = format!("localhost:{}", kafka_port);
    let kafka_broker = common::utils::get_env_default("KAFKA_BROKER", &default_kafka);
    let producer = stream_events::KafkaProducer::new(&kafka_broker)?;

    let consumer = stream_events::KafkaConsumer::new(
        &kafka_broker,
        "parser_worker_group",
        &[stream_events::topics::SNAPSHOTS_CREATED],
    )?;

    tracing::info!("Listening on topic: {}", stream_events::topics::SNAPSHOTS_CREATED);

    let dao = std::sync::Arc::new(ParserDao { pool });
    let producer = std::sync::Arc::new(producer);
    let storage_root = storage_root.clone();

    consumer.run(move |event: stream_events::SnapshotCreatedEvent| {
        let dao = dao.clone();
        let producer = producer.clone();
        let storage_root = storage_root.clone();
        
        async move {
            let snapshot_id = event.snapshot_id;
            let manifest_rel_path = event.manifest_s3_key.as_deref().unwrap_or("");
            
            if manifest_rel_path.is_empty() {
                tracing::error!("Received SnapshotCreatedEvent without manifest_s3_key for snapshot {}", snapshot_id);
                return Ok(());
            }

            tracing::info!("Processing snapshot: {} using NAS manifest: {}", snapshot_id, manifest_rel_path);
            
            let count = catest_parser::process_snapshot(
                &*dao, 
                &storage_root,
                manifest_rel_path,
                snapshot_id
            ).await?;
            
            let parsed_event = stream_events::SegmentParsedEvent {
                event_id: Uuid::new_v4(),
                snapshot_id,
                file_id: Uuid::nil(), 
                segment_count: count,
                language: "various".to_string(),
                occurred_at: chrono::Utc::now(),
            };
            
            producer.publish(
                stream_events::topics::SEGMENTS_PARSED,
                &snapshot_id.to_string(),
                &parsed_event,
            ).await?;

            
            tracing::info!("Successfully parsed {} segments for snapshot {}", count, snapshot_id);
            Ok(())
        }
    }).await?;


    Ok(())
}

