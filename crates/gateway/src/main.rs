use actix_web::{get, post, web, HttpResponse, HttpServer, Responder};
use neo4rs::Graph;
use qdrant_client::{qdrant::SearchPointsBuilder, Qdrant};
use serde::Deserialize;
use uuid::Uuid;

#[get("/healthz")]
async fn healthz() -> impl Responder {
    HttpResponse::Ok().body("OK")
}

#[derive(Deserialize)]
struct RAGItem {
    id: Uuid,
    workspace_id: String,
    file_path: String,
    source_text: String,
    target_text: String,
}

#[derive(Deserialize)]
struct RAGIngestRequest {
    items: Vec<RAGItem>,
}

#[derive(Deserialize)]
struct MemoryQueryRequest {
    query: String,
    // Provide a mocked vector for MVP since gateway doesn't host an embedding model directly.
    vector: Option<Vec<f32>>,
    limit: Option<u64>,
}

#[derive(Deserialize)]
struct GraphQueryRequest {
    query: String,
}

#[derive(Deserialize)]
struct DocQueryRequest {
    query: String,
    vector: Option<Vec<f32>>,
    limit: Option<u64>,
}

#[post("/api/ingest-rag")]
async fn ingest_rag(
    req: web::Json<RAGIngestRequest>,
    producer: web::Data<stream_events::KafkaProducer>,
) -> impl Responder {
    tracing::info!("Received {} items for RAG ingestion", req.items.len());

    for item in &req.items {
        let payload = serde_json::json!({
            "id": item.id,
            "workspace_id": item.workspace_id,
            "file_path": item.file_path,
            "source_text": item.source_text,
            "target_text": item.target_text,
            "timestamp": chrono::Utc::now().to_rfc3339()
        });

        if let Err(e) = producer
            .publish(
                stream_events::topics::RAG_INGEST,
                &item.id.to_string(),
                &payload.to_string(),
            )
            .await
        {
            tracing::error!("Failed to publish RAG item {} to Kafka: {:?}", item.id, e);
        }
    }

    HttpResponse::Ok().json(serde_json::json!({ "success": true, "count": req.items.len() }))
}

#[get("/api/rag/terms")]
async fn get_terms(pool: web::Data<sqlx::PgPool>) -> impl Responder {
    let result = sqlx::query_as::<_, common::rag_models::TermBaseEntry>(
        "SELECT * FROM term_base WHERE is_forbidden = false OR is_forbidden IS NULL",
    )
    .fetch_all(pool.get_ref())
    .await;

    match result {
        Ok(terms) => HttpResponse::Ok().json(serde_json::json!({ "success": true, "data": terms })),
        Err(e) => {
            tracing::error!("Failed to fetch terms: {:?}", e);
            HttpResponse::InternalServerError()
                .json(serde_json::json!({ "success": false, "error": e.to_string() }))
        }
    }
}

#[get("/api/rag/rules")]
async fn get_rules(pool: web::Data<sqlx::PgPool>) -> impl Responder {
    let result = sqlx::query_as::<_, common::rag_models::RuleBaseEntry>(
        "SELECT * FROM rule_base WHERE is_enabled = true OR is_enabled IS NULL",
    )
    .fetch_all(pool.get_ref())
    .await;

    match result {
        Ok(rules) => HttpResponse::Ok().json(serde_json::json!({ "success": true, "data": rules })),
        Err(e) => {
            tracing::error!("Failed to fetch rules: {:?}", e);
            HttpResponse::InternalServerError()
                .json(serde_json::json!({ "success": false, "error": e.to_string() }))
        }
    }
}

#[post("/api/rag/memory")]
async fn get_memory(
    req: web::Json<MemoryQueryRequest>,
    qdrant: web::Data<Qdrant>,
) -> impl Responder {
    tracing::info!("Received memory search query: {}", req.query);

    // In a full implementation, Gateway would call an Inference service to get the vector for `req.query`.
    // For this module MVP, we use the provided vector or a mock.
    let search_vector = req.vector.clone().unwrap_or_else(|| vec![0.1f32; 384]);
    let limit = req.limit.unwrap_or(3);

    let search_result = qdrant
        .search_points(
            SearchPointsBuilder::new("catest_rag", search_vector, limit).with_payload(true),
        )
        .await;

    match search_result {
        Ok(response) => {
            let results: Vec<serde_json::Value> = response
                .result
                .into_iter()
                .map(|scored_point| {
                    let id_str = scored_point
                        .id
                        .and_then(|pid| pid.point_id_options)
                        .map(|opt| format!("{:?}", opt))
                        .unwrap_or_default();
                    serde_json::json!({
                        "id": id_str,
                        "score": scored_point.score,
                        "payload": scored_point.payload
                    })
                })
                .collect();
            HttpResponse::Ok().json(serde_json::json!({ "success": true, "data": results }))
        }
        Err(e) => {
            tracing::error!("Qdrant search failed: {:?}", e);
            HttpResponse::InternalServerError()
                .json(serde_json::json!({ "success": false, "error": e.to_string() }))
        }
    }
}

#[post("/api/rag/graph")]
async fn get_graph(req: web::Json<GraphQueryRequest>, graph: web::Data<Graph>) -> impl Responder {
    tracing::info!("Received graph search query: {}", req.query);

    // For MVP, look for TranslationSegments tagged with a matching tag
    let q = neo4rs::query("MATCH (s:TranslationSegment)-[:TAGGED_WITH]->(t:Tag) WHERE toLower(t.name) CONTAINS toLower($query) RETURN s.id as id, s.source as source, s.target as target LIMIT 5")
        .param("query", req.query.clone());

    let execute_result = graph.execute(q).await;
    match execute_result {
        Ok(mut result_stream) => {
            let mut results = Vec::new();
            while let Ok(Some(row)) = result_stream.next().await {
                let id: String = row.get("id").unwrap_or_default();
                let source: String = row.get("source").unwrap_or_default();
                let target: String = row.get("target").unwrap_or_default();
                results.push(serde_json::json!({
                    "id": id,
                    "source": source,
                    "target": target
                }));
            }
            HttpResponse::Ok().json(serde_json::json!({ "success": true, "data": results }))
        }
        Err(e) => {
            tracing::error!("Neo4j search failed: {:?}", e);
            HttpResponse::InternalServerError()
                .json(serde_json::json!({ "success": false, "error": e.to_string() }))
        }
    }
}

#[post("/api/rag/docs")]
async fn get_docs(req: web::Json<DocQueryRequest>, qdrant: web::Data<Qdrant>) -> impl Responder {
    tracing::info!("Received docs search query: {}", req.query);

    let search_vector = req.vector.clone().unwrap_or_else(|| vec![0.1f32; 384]);
    let limit = req.limit.unwrap_or(2);

    let search_result = qdrant
        .search_points(
            SearchPointsBuilder::new("catest_docs", search_vector, limit).with_payload(true),
        )
        .await;

    match search_result {
        Ok(response) => {
            let results: Vec<serde_json::Value> = response
                .result
                .into_iter()
                .map(|scored_point| {
                    let id_str = scored_point
                        .id
                        .and_then(|pid| pid.point_id_options)
                        .map(|opt| format!("{:?}", opt))
                        .unwrap_or_default();
                    serde_json::json!({
                        "id": id_str,
                        "score": scored_point.score,
                        "payload": scored_point.payload
                    })
                })
                .collect();
            HttpResponse::Ok().json(serde_json::json!({ "success": true, "data": results }))
        }
        Err(e) => {
            tracing::error!("Qdrant docs search failed: {:?}", e);
            HttpResponse::InternalServerError()
                .json(serde_json::json!({ "success": false, "error": e.to_string() }))
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    common::init_tracing();
    let port_str = common::utils::get_env_default("GATEWAY_PORT", "33080");
    let port: u16 = port_str.parse().unwrap_or(33080);
    tracing::info!("Starting Gateway on port {}", port);

    let postgres_port = common::utils::get_env_default("POSTGRES_PORT", "35432");
    let default_db_url = format!(
        "postgres://catest:password@localhost:{}/catest_gateway",
        postgres_port
    );
    let db_url = common::utils::get_env_default("DATABASE_URL", &default_db_url);
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(std::io::Error::other)?;

    let kafka_port = common::utils::get_env_default("KAFKA_PORT", "39092");
    let default_kafka = format!("localhost:{}", kafka_port);
    let kafka_broker = common::utils::get_env_default("KAFKA_BROKER", &default_kafka);
    let producer = stream_events::KafkaProducer::new(&kafka_broker)
        .map_err(std::io::Error::other)?;
    let producer_data = web::Data::new(producer);

    let qdrant_port = common::utils::get_env_default("QDRANT_HTTP_PORT", "36334");
    let default_qdrant = format!("http://localhost:{}", qdrant_port);
    let qdrant_url = common::utils::get_env_default("QDRANT_URL", &default_qdrant);
    let qdrant_client = Qdrant::from_url(&qdrant_url)
        .build()
        .map_err(std::io::Error::other)?;

    let neo4j_port = common::utils::get_env_default("NEO4J_BOLT_PORT", "37687");
    let neo4j_uri = format!("bolt://localhost:{}", neo4j_port);
    let neo4j_uri_env = common::utils::get_env_default("NEO4J_URI", &neo4j_uri);
    let neo4j_user = common::utils::get_env_default("NEO4J_USER", "neo4j");
    let neo4j_pass = common::utils::get_env_default("NEO4J_PASSWORD", "password");
    let graph = Graph::new(&neo4j_uri_env, &neo4j_user, &neo4j_pass)
        .await
        .map_err(std::io::Error::other)?;

    HttpServer::new(move || {
        actix_web::App::new()
            .app_data(actix_web::web::Data::new(pool.clone()))
            .app_data(producer_data.clone())
            .app_data(actix_web::web::Data::new(qdrant_client.clone()))
            .app_data(actix_web::web::Data::new(graph.clone()))
            .service(healthz)
            .service(ingest_rag)
            .service(get_terms)
            .service(get_rules)
            .service(get_memory)
            .service(get_graph)
            .service(get_docs)
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};

    #[actix_web::test]
    async fn test_healthz_get() {
        let app = test::init_service(App::new().service(healthz)).await;
        let req = test::TestRequest::get().uri("/healthz").to_request();
        let resp = test::call_service(&app, req).await;
        assert!(resp.status().is_success());
        let body = test::read_body(resp).await;
        assert_eq!(body, "OK");
    }

    #[actix_web::test]
    async fn test_memory_query_request_deserializes_with_defaults() {
        let json = r#"{"query": "function authentication"}"#;
        let req: MemoryQueryRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.query, "function authentication");
        assert!(req.vector.is_none());
        assert!(req.limit.is_none());
    }

    #[actix_web::test]
    async fn test_memory_query_request_deserializes_with_vector() {
        let json = r#"{"query": "auth", "vector": [0.1, 0.2, 0.3], "limit": 5}"#;
        let req: MemoryQueryRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.query, "auth");
        assert_eq!(req.vector, Some(vec![0.1f32, 0.2f32, 0.3f32]));
        assert_eq!(req.limit, Some(5u64));
    }

    #[actix_web::test]
    async fn test_graph_query_request_deserializes() {
        let json = r#"{"query": "kafka producer"}"#;
        let req: GraphQueryRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.query, "kafka producer");
    }

    #[actix_web::test]
    async fn test_doc_query_request_deserializes_minimal() {
        let json = r#"{"query": "ADR authentication design"}"#;
        let req: DocQueryRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.query, "ADR authentication design");
        assert!(req.vector.is_none());
        assert!(req.limit.is_none());
    }

    #[actix_web::test]
    async fn test_rag_ingest_request_parses_items() {
        let json = r#"{
            "items": [{
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "workspace_id": "ws-1",
                "file_path": "src/main.rs",
                "source_text": "fn main() {}",
                "target_text": "主函数"
            }]
        }"#;
        let req: RAGIngestRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.items.len(), 1);
        assert_eq!(req.items[0].workspace_id, "ws-1");
        assert_eq!(req.items[0].source_text, "fn main() {}");
    }
}
