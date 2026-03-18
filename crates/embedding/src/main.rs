use anyhow::Result;
use catest_embedding::EmbeddingManager;
use neo4rs::{query, Graph};
use serde::Deserialize;

#[derive(Deserialize, Debug)]
struct CleanedRagItem {
    id: String,
    workspace_id: String,
    file_path: String,
    cleaned_source: String,
    cleaned_target: String,
    word_count: i32,
}

#[tokio::main]
async fn main() -> Result<()> {
    common::init_tracing();
    tracing::info!("Starting AI Ingestion Worker (Qdrant + Neo4j)");

    // Qdrant Setup — vector dim and collection name driven by env
    let qdrant_port = common::utils::get_env_default("QDRANT_HTTP_PORT", "36334");
    let default_qdrant = format!("http://localhost:{}", qdrant_port);
    let qdrant_url = common::utils::get_env_default("QDRANT_URL", &default_qdrant);
    let embed_dim: u64 = common::utils::get_env_default("EMBED_VECTOR_DIM", "384")
        .parse()
        .unwrap_or(384);
    let embed_model =
        common::utils::get_env_default("EMBED_MODEL_NAME", "intfloat/multilingual-e5-small");
    let reranker_model =
        common::utils::get_env_default("RERANKER_MODEL_NAME", "BAAI/bge-reranker-v2-m3");
    tracing::info!(
        "Embedding model: {} (dim={}), Reranker: {}",
        embed_model,
        embed_dim,
        reranker_model
    );
    let qdrant_api_key = common::utils::get_env_default("QDRANT_API_KEY", "password");
    let manager = EmbeddingManager::new(&qdrant_url, Some(&qdrant_api_key))?;
    manager.ensure_collection("catest_rag", embed_dim).await?;

    // Neo4j Setup — credentials from env
    let neo4j_port = common::utils::get_env_default("NEO4J_BOLT_PORT", "37687");
    let neo4j_uri = format!("bolt://localhost:{}", neo4j_port);
    let neo4j_uri_env = common::utils::get_env_default("NEO4J_URI", &neo4j_uri);
    let neo4j_user = common::utils::get_env_default("NEO4J_USER", "neo4j");
    let neo4j_pass = common::utils::get_env_default("NEO4J_PASSWORD", "password");
    let graph = Graph::new(&neo4j_uri_env, &neo4j_user, &neo4j_pass).await?;
    tracing::info!("Connected to Neo4j @ {}", neo4j_uri_env);

    // Kafka Consumer Setup
    let kafka_port = common::utils::get_env_default("KAFKA_PORT", "39092");
    let default_kafka = format!("localhost:{}", kafka_port);
    let kafka_broker = common::utils::get_env_default("KAFKA_BROKER", &default_kafka);

    let consumer = stream_events::KafkaConsumer::new(
        &kafka_broker,
        "embedding_rag_group",
        &[stream_events::topics::RAG_CLEANED],
    )?;

    tracing::info!(
        "Listening on Arroyo topic: {}",
        stream_events::topics::RAG_CLEANED
    );

    consumer
        .run(|item: CleanedRagItem| {
            let manager = &manager;
            let graph = &graph;
            async move {
                tracing::info!(
                    "Processing cleaned item {} ({} words)",
                    item.id,
                    item.word_count
                );

                // --- AI Processing Stub ---
                let mock_vector = vec![0.1f32; 384];
                let extracted_tags = vec!["Translation", "Review"];

                // Persistence D1: Write to Qdrant
                let payload_json = serde_json::json!({
                    "file_path": item.file_path,
                    "workspace_id": item.workspace_id,
                    "content": item.cleaned_target,
                    "tags": extracted_tags,
                });
                if let Ok(uuid_val) = uuid::Uuid::parse_str(&item.id) {
                    manager
                        .index_segment("catest_rag", uuid_val, mock_vector, payload_json)
                        .await?;
                }

                // Persistence D2: Write Semantic Graph to Neo4j
                let q = query(
                    "
                MERGE (f:File {path: $file_path})
                MERGE (s:TranslationSegment {id: $id})
                SET s.source = $source, s.target = $target, s.workspace = $ws
                MERGE (s)-[:LOCATED_IN]->(f)
                WITH s
                UNWIND $tags AS tag
                MERGE (t:Tag {name: tag})
                MERGE (s)-[:TAGGED_WITH]->(t)
            ",
                )
                .param("file_path", item.file_path)
                .param("id", item.id)
                .param("source", item.cleaned_source)
                .param("target", item.cleaned_target)
                .param("ws", item.workspace_id)
                .param("tags", extracted_tags);

                if let Err(e) = graph.run(q).await {
                    tracing::error!("Neo4j write failed: {:?}", e);
                } else {
                    tracing::info!("Committed Knowledge Graph nodes to Neo4j");
                }
                Ok(())
            }
        })
        .await?;

    Ok(())
}
