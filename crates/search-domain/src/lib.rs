use anyhow::{Context, Result};
use neo4rs::{Graph, Query};
use qdrant_client::{qdrant::SearchPointsBuilder, Qdrant};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub score: f32,
    pub payload: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphResult {
    pub id: String,
    pub source: String,
    pub target: String,
}

#[derive(Serialize)]
struct OllamaEmbedRequest<'a> {
    model: &'a str,
    input: &'a str,
}

#[derive(Deserialize)]
struct OllamaEmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

pub struct InferenceClient {
    endpoint: String,
    client: reqwest::Client,
}

impl InferenceClient {
    pub fn new(endpoint: &str) -> Self {
        Self {
            endpoint: endpoint.to_string(),
            client: reqwest::Client::new(),
        }
    }

    pub async fn embed(&self, text: &str) -> Result<Vec<f32>> {
        tracing::debug!("Requesting real embedding from: {}", self.endpoint);
        
        let payload = OllamaEmbedRequest {
            model: "nomic-embed-text",
            input: text,
        };

        let resp = self.client
            .post(&self.endpoint)
            .json(&payload)
            .send()
            .await
            .context("Failed to connect to embedding service")?;

        if !resp.status().is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Embedding service returned error: {}", err_text);
        }

        let result: OllamaEmbedResponse = resp.json().await
            .context("Failed to parse embedding response")?;

        // Ollama /api/embed returns an array of embeddings for an array of inputs
        let embedding = result.embeddings.into_iter().next()
            .context("Empty embedding returned from service")?;

        Ok(embedding)
    }
}

pub struct SearchService {
    qdrant: Qdrant,
    graph: Graph,
    inference: InferenceClient,
}

impl SearchService {
    pub fn new(qdrant: Qdrant, graph: Graph, inference: InferenceClient) -> Self {
        Self { qdrant, graph, inference }
    }

    pub async fn search_memory(&self, query_text: &str, vector: Option<Vec<f32>>, limit: u64) -> Result<Vec<SearchResult>> {
        let search_vector = match vector {
            Some(v) => v,
            None => self.inference.embed(query_text).await?,
        };

        let response = self.qdrant
            .search_points(
                SearchPointsBuilder::new("catest_rag", search_vector, limit).with_payload(true),
            )
            .await?;

        let results = response.result
            .into_iter()
            .map(|scored_point| {
                let id_str = scored_point.id
                    .and_then(|pid| pid.point_id_options)
                    .map(|opt| format!("{:?}", opt))
                    .unwrap_or_default();
                SearchResult {
                    id: id_str,
                    score: scored_point.score,
                    payload: serde_json::to_value(scored_point.payload).unwrap_or_default(),
                }
            })
            .collect();

        Ok(results)
    }

    pub async fn search_graph(&self, query_text: &str) -> Result<Vec<GraphResult>> {
        let q = neo4rs::query("MATCH (s:TranslationSegment)-[:TAGGED_WITH]->(t:Tag) WHERE toLower(t.name) CONTAINS toLower($query) RETURN s.id as id, s.source as source, s.target as target LIMIT 5")
            .param("query", query_text.to_string());

        let mut result_stream = self.graph.execute(q).await?;
        let mut results = Vec::new();

        while let Some(row) = result_stream.next().await? {
            results.push(GraphResult {
                id: row.get("id").unwrap_or_default(),
                source: row.get("source").unwrap_or_default(),
                target: row.get("target").unwrap_or_default(),
            });
        }

        Ok(results)
    }

    pub async fn search_docs(&self, query_text: &str, vector: Option<Vec<f32>>, limit: u64) -> Result<Vec<SearchResult>> {
        let search_vector = match vector {
            Some(v) => v,
            None => self.inference.embed(query_text).await?,
        };

        let response = self.qdrant
            .search_points(
                SearchPointsBuilder::new("catest_docs", search_vector, limit).with_payload(true),
            )
            .await?;

        let results = response.result
            .into_iter()
            .map(|scored_point| {
                let id_str = scored_point.id
                    .and_then(|pid| pid.point_id_options)
                    .map(|opt| format!("{:?}", opt))
                    .unwrap_or_default();
                SearchResult {
                    id: id_str,
                    score: scored_point.score,
                    payload: serde_json::to_value(scored_point.payload).unwrap_or_default(),
                }
            })
            .collect();

        Ok(results)
    }
}
