use anyhow::Result;
use catest_parser::{Segmenter, SegmentDao, process_snapshot};
use stream_events::EventConsumer;
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

struct ParserDao {
    parser_pool: sqlx::PgPool,
    ingestion_pool: sqlx::PgPool,
}

#[async_trait::async_trait]
impl catest_parser::SegmentDao for ParserDao {
    async fn fetch_files(&self, snapshot_id: Uuid) -> Result<Vec<common::models::File>> {
        let files = sqlx::query_as::<_, common::models::File>(
            "SELECT id, snapshot_id, path, language, size_bytes, sha256, content_text, created_at 
                FROM files WHERE snapshot_id = $1"
        )
        .bind(snapshot_id)
        .fetch_all(&self.ingestion_pool)
        .await?;
        Ok(files)
    }

    async fn insert_segments(&self, snapshot_id: Uuid, symbol_name: Option<String>, code_text: String) -> Result<()> {
        sqlx::query(
            "INSERT INTO segments (snapshot_id, symbol_name, code_text, normalized_hash)
                VALUES ($1, $2, $3, $4)",
        )
        .bind(snapshot_id)
        .bind(symbol_name)
        .bind(code_text)
        .bind("TODO_HASH")
        .execute(&self.parser_pool)
        .await?;
        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    common::init_tracing();
    tracing::info!("Starting Parser Worker");

    let postgres_port = common::utils::get_env_default("POSTGRES_PORT", "35432");
    let default_parser_db = format!(
        "postgres://catest:password@localhost:{}/catest_parser",
        postgres_port
    );
    let default_ingestion_db = format!(
        "postgres://catest:password@localhost:{}/catest_ingestion",
        postgres_port
    );

    let parser_db_url = common::utils::get_env_default("DATABASE_URL", &default_parser_db);
    let ingestion_db_url =
        common::utils::get_env_default("INGESTION_DATABASE_URL", &default_ingestion_db);

    let parser_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&parser_db_url)
        .await?;

    let ingestion_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&ingestion_db_url)
        .await?;

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

    let dao = std::sync::Arc::new(ParserDao {
        parser_pool,
        ingestion_pool,
    });

    let producer = std::sync::Arc::new(producer);

    use stream_events::EventConsumer;
    consumer.run(move |event: stream_events::SnapshotCreatedEvent| {
        let dao = dao.clone();
        let producer = producer.clone();
        
        async move {
            tracing::info!("Processing snapshot: {}", event.snapshot_id);
            let count = catest_parser::process_snapshot(&*dao as &dyn SegmentDao, event.snapshot_id).await?;
            
            let parsed_event = stream_events::SegmentParsedEvent {
                event_id: Uuid::new_v4(),
                snapshot_id: event.snapshot_id,
                file_id: Uuid::nil(), // Placeholder for batch processing
                segment_count: count,
                language: "various".to_string(),
                occurred_at: chrono::Utc::now(),
            };
            
            producer.publish(
                stream_events::topics::SEGMENTS_PARSED,
                &event.snapshot_id.to_string(),
                &parsed_event,
            ).await?;
            
            tracing::info!("Published SegmentParsedEvent for snapshot {}", event.snapshot_id);
            Ok(())
        }
    }).await?;

    Ok(())
}
