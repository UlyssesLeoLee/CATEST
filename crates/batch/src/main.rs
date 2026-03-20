mod api;
mod db;
mod models;
mod worker;

use actix_web::{web, App, HttpServer};
use sqlx::postgres::PgPoolOptions;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    common::init_tracing();

    let mode = std::env::var("BATCH_MODE").unwrap_or_else(|_| "api".to_string());
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://catest:password@postgres:34321/catest_batch".to_string());
    let kafka_broker = std::env::var("KAFKA_BROKER")
        .unwrap_or_else(|_| "kafka:39092".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await
        .expect("Failed to connect to PostgreSQL");

    db::ensure_schema(&pool).await.expect("Failed to ensure schema");

    match mode.as_str() {
        "worker" => {
            tracing::info!("Starting in WORKER mode");
            let group_id = std::env::var("KAFKA_GROUP_ID")
                .unwrap_or_else(|_| "catest-batch-workers".to_string());
            worker::run_worker_loop(pool, &kafka_broker, &group_id).await
                .expect("Worker loop failed");
        }
        _ => {
            tracing::info!("Starting in API mode on port 33090");
            let producer = stream_events::KafkaProducer::new(&kafka_broker)
                .expect("Failed to create Kafka producer");

            let state = web::Data::new(api::AppState { pool, producer });
            let port: u16 = std::env::var("BATCH_PORT")
                .unwrap_or_else(|_| "33090".to_string())
                .parse().unwrap_or(33090);

            HttpServer::new(move || {
                App::new()
                    .app_data(state.clone())
                    .service(api::healthz)
                    .service(api::create_job)
                    .service(api::list_jobs)
                    .service(api::get_job)
                    .service(api::job_progress_sse)
                    .service(api::cancel_job)
            })
            .bind(("0.0.0.0", port))?
            .run()
            .await?;
        }
    }
    Ok(())
}
