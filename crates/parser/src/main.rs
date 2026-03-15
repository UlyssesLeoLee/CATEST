use anyhow::Result;
use catest_parser::Segmenter;
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

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

    // MVP: Process all files that don't have segments yet
    let files = sqlx::query_as::<_, common::models::File>("SELECT id, snapshot_id, path, language, size_bytes, sha256, content_text, created_at FROM files")
        .fetch_all(&ingestion_pool)
        .await?;

    for file in files {
        let extension = file.path.split('.').next_back().unwrap_or("");
        if let Ok(mut segmenter) = Segmenter::new(extension) {
            tracing::info!("Parsing file: {}", file.path);

            let segments = segmenter.segment_code(&file.content_text)?;
            for seg in &segments {
                sqlx::query(
                    "INSERT INTO segments (snapshot_id, symbol_name, code_text, normalized_hash)
                     VALUES ($1, $2, $3, $4)",
                )
                .bind(file.snapshot_id)
                .bind(seg.symbol_name.clone())
                .bind(seg.code_text.clone())
                .bind("TODO_HASH")
                .execute(&parser_pool)
                .await?;
            }

            // Publish event after parsing file
            let event = stream_events::SegmentParsedEvent {
                event_id: Uuid::new_v4(),
                snapshot_id: file.snapshot_id,
                file_id: file.id,
                segment_count: segments.len(),
                language: extension.to_string(),
                occurred_at: chrono::Utc::now(),
            };
            producer
                .publish(
                    stream_events::topics::SEGMENTS_PARSED,
                    &file.id.to_string(),
                    &event,
                )
                .await?;
            tracing::info!("Published SegmentParsedEvent for file {}", file.path);
        }
    }

    Ok(())
}
