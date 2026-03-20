use anyhow::Result;
use qdrant_client::qdrant::{CreateCollectionBuilder, Distance, VectorParamsBuilder};
use qdrant_client::{Payload, Qdrant};
use uuid::Uuid;

#[derive(Clone)]
pub struct EmbeddingManager {
    qdrant: Qdrant,
}

impl EmbeddingManager {
    pub fn new(url: &str, api_key: Option<&str>) -> Result<Self> {
        tracing::info!("Qdrant connecting to url={} api_key={:?}", url, api_key.map(|k| format!("{}...", &k[..k.len().min(3)])));
        let mut builder = Qdrant::from_url(url);
        if let Some(key) = api_key {
            builder = builder.api_key(key);
        }
        let client = builder.build()?;
        Ok(Self { qdrant: client })
    }

    pub async fn ensure_collection(&self, collection_name: &str, dim: u64) -> Result<()> {
        if !self.qdrant.collection_exists(collection_name).await? {
            tracing::info!("Creating collection: {}", collection_name);
            self.qdrant
                .create_collection(
                    CreateCollectionBuilder::new(collection_name)
                        .vectors_config(VectorParamsBuilder::new(dim, Distance::Cosine)),
                )
                .await?;
        }
        Ok(())
    }

    pub async fn index_segment(
        &self,
        collection_name: &str,
        segment_id: Uuid,
        vector: Vec<f32>,
        payload: serde_json::Value,
    ) -> Result<()> {
        use qdrant_client::qdrant::{PointStruct, UpsertPointsBuilder};

        let point = PointStruct::new(
            segment_id.to_string(),
            vector,
            <serde_json::Value as TryInto<Payload>>::try_into(payload)
                .map_err(|e| anyhow::anyhow!("Payload conversion error: {:?}", e))?,
        );

        self.qdrant
            .upsert_points(UpsertPointsBuilder::new(collection_name, vec![point]))
            .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use qdrant_client::Payload;
    use uuid::Uuid;

    #[test]
    fn test_payload_conversion() {
        // We'll test that our segment metadata can be converted into Qdrant Payload
        let segment_id = Uuid::new_v4();
        let payload = serde_json::json!({
            "segment_id": segment_id.to_string(),
            "language": "rust",
            "file_path": "src/main.rs"
        });

        let point_struct = qdrant_client::qdrant::PointStruct::new(
            segment_id.to_string(),
            vec![0.1, 0.2, 0.3],
            <serde_json::Value as TryInto<Payload>>::try_into(payload).unwrap(),
        );

        // Verify the point ID is correctly set
        assert_eq!(
            point_struct.id.unwrap().point_id_options.unwrap(),
            qdrant_client::qdrant::point_id::PointIdOptions::Uuid(segment_id.to_string())
        );
        // Verify vectors are present (qdrant-client 1.17 encodes float data differently)
        assert!(point_struct.vectors.is_some());
    }
}
