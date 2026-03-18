use actix_web::{web, HttpResponse, Responder, post, get};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use sqlx::PgPool;

#[derive(Debug, Deserialize)]
pub struct SyncCheck {
    pub key: String,
}

#[derive(Serialize)]
pub struct CheckResponse {
    pub need_update: boolean,
}

#[derive(Debug, Deserialize)]
pub struct SyncPayload {
    pub table: String,
    pub data: serde_json::Value,
    pub metadata: SyncMetadata,
}

#[derive(Debug, Deserialize)]
pub struct SyncMetadata {
    pub id: String,
    pub updated_at: i64,
    pub hash: String,
}

/// Head check to minimize traffic. 
/// Checks if the composite key (ID + Timestamp) exists in the backend.
pub async fn check_consistency(
    path: web::Path<Uuid>,
    query: web::Query<SyncCheck>,
    pool: web::Data<PgPool>,
) -> impl Responder {
    let id = path.into_inner();
    
    // Check in the profiles/work table if this version already exists
    let exists = sqlx::query!(
        "SELECT 1 FROM sync_metadata WHERE resource_id = $1 AND sync_hash = $2",
        id,
        query.key
    )
    .fetch_optional(pool.get_ref())
    .await;

    match exists {
        Ok(Some(_)) => HttpResponse::Ok().json(serde_json::json!({ "need_update": false })),
        _ => HttpResponse::Ok().json(serde_json::json!({ "need_update": true })),
    }
}

/// Push updated content and update sync metadata
pub async fn push_sync(
    payload: web::Json<SyncPayload>,
    pool: web::Data<PgPool>,
) -> impl Responder {
    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(_) => return HttpResponse::InternalServerError().finish(),
    };

    // 1. Update actual data
    // (Actual logic would depend on the table, here we use a generic work_data as example)
    let res = sqlx::query(
        "INSERT INTO user_work (id, content) VALUES ($1, $2) 
         ON CONFLICT (id) DO UPDATE SET content = $2, updated_at = NOW()"
    )
    .bind(Uuid::parse_str(&payload.metadata.id).unwrap_or_default())
    .bind(payload.data.get("content").and_then(|c| c.as_str()).unwrap_or(""))
    .execute(&mut *tx)
    .await;

    if res.is_err() {
        return HttpResponse::InternalServerError().body("Data update failed");
    }

    // 2. Update Sync Metadata for future consistency checks
    let meta_res = sqlx::query(
        "INSERT INTO sync_metadata (resource_id, sync_hash, last_sync_at) 
         VALUES ($1, $2, NOW())
         ON CONFLICT (resource_id) DO UPDATE SET sync_hash = $2, last_sync_at = NOW()"
    )
    .bind(Uuid::parse_str(&payload.metadata.id).unwrap_or_default())
    .bind(&payload.metadata.hash)
    .execute(&mut *tx)
    .await;

    if meta_res.is_err() {
        return HttpResponse::InternalServerError().body("Metadata update failed");
    }

    if tx.commit().await.is_err() {
        return HttpResponse::InternalServerError().finish();
    }

    HttpResponse::Ok().json(serde_json::json!({ "status": "success" }))
}

/// Metering endpoint for billing
#[post("/metering/log")]
pub async fn log_traffic(
    payload: web::Json<serde_json::Value>,
) -> impl Responder {
    // In production, this would send to a Time-Series DB or Kafka
    let bytes = payload.get("bytes").and_then(|b| b.as_u64()).unwrap_or(0);
    tracing::info!("TRAFFIC_METRIC: feature={} bytes={} user_id=TODO", 
        payload.get("feature").and_then(|f| f.as_str()).unwrap_or("unknown"),
        bytes
    );
    HttpResponse::NoContent().finish()
}
