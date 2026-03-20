use crate::{db, models::*};
use actix_web::{delete, get, post, web, HttpResponse, Responder};
use sqlx::PgPool;
use uuid::Uuid;
use stream_events::KafkaProducer;
use std::time::Duration;

pub struct AppState {
    pub pool: PgPool,
    pub producer: KafkaProducer,
}

#[get("/healthz")]
pub async fn healthz() -> impl Responder {
    HttpResponse::Ok().body("OK")
}

#[post("/api/batch/jobs")]
pub async fn create_job(
    state: web::Data<AppState>,
    body: web::Json<CreateJobRequest>,
) -> impl Responder {
    let req = body.into_inner();
    let pool = &state.pool;

    let job = match db::create_job(pool, &req).await {
        Ok(j) => j,
        Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
    };

    let items = match db::insert_items(pool, job.id, &req.items).await {
        Ok(i) => i,
        Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
    };

    // Publish each item as a Kafka message
    let job_type_val = serde_json::to_value(&req.job_type).unwrap_or_default();
    let job_type_str = job_type_val.as_str().unwrap_or("ingestion");
    let topic = format!("catest.batch.{}", job_type_str);

    for (item, batch_item) in req.items.iter().zip(items.iter()) {
        let payload = req.payload.clone().unwrap_or_default();
        let msg = WorkerMessage {
            job_id: job.id,
            item_id: batch_item.id,
            item_key: item.clone(),
            job_type: req.job_type.clone(),
            payload,
        };
        if let Err(e) = state.producer.publish(&topic, &job.id.to_string(), &msg).await {
            tracing::warn!("Failed to publish batch item: {}", e);
        }
    }

    if let Err(e) = db::update_job_status(pool, job.id, "running").await {
        tracing::warn!("Failed to update job status: {}", e);
    }

    HttpResponse::Created().json(job)
}

#[get("/api/batch/jobs")]
pub async fn list_jobs(state: web::Data<AppState>) -> impl Responder {
    match db::list_jobs(&state.pool, 50).await {
        Ok(jobs) => HttpResponse::Ok().json(jobs),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

#[get("/api/batch/jobs/{id}")]
pub async fn get_job(
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> impl Responder {
    match db::get_job(&state.pool, *path).await {
        Ok(Some(job)) => HttpResponse::Ok().json(job),
        Ok(None) => HttpResponse::NotFound().finish(),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

/// SSE endpoint: streams progress updates for a specific job
#[get("/api/batch/jobs/{id}/progress")]
pub async fn job_progress_sse(
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> impl Responder {
    let pool = state.pool.clone();
    let job_id = *path;

    let stream = async_stream::stream! {
        loop {
            match db::get_job(&pool, job_id).await {
                Ok(Some(job)) => {
                    let update = JobProgressUpdate {
                        job_id,
                        total: job.total,
                        processed: job.processed,
                        failed: job.failed,
                        status: job.status.clone(),
                    };
                    let data = serde_json::to_string(&update).unwrap_or_default();
                    yield Ok::<bytes::Bytes, actix_web::Error>(
                        bytes::Bytes::from(format!("data: {}\n\n", data))
                    );
                    if job.status == "done" || job.status == "failed" || job.status == "cancelled" {
                        break;
                    }
                }
                _ => break,
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    };

    HttpResponse::Ok()
        .append_header(("Content-Type", "text/event-stream"))
        .append_header(("Cache-Control", "no-cache"))
        .append_header(("X-Accel-Buffering", "no"))
        .streaming(stream)
}

#[delete("/api/batch/jobs/{id}")]
pub async fn cancel_job(
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> impl Responder {
    match db::update_job_status(&state.pool, *path, "cancelled").await {
        Ok(_) => HttpResponse::Ok().body("cancelled"),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}
