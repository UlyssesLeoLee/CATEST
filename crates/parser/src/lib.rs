use anyhow::{Context, Result};
use tree_sitter::{Language, Parser};
use uuid::Uuid;

#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait SegmentDao: Send + Sync {
    async fn insert_segments(
        &self,
        snapshot_id: Uuid,
        symbol_name: Option<String>,
        code_text: String,
        normalized_hash: String,
    ) -> Result<()>;
}


pub async fn process_snapshot(
    dao: &dyn SegmentDao,
    storage_root: &std::path::Path,
    manifest_rel_path: &str,
    snapshot_id: Uuid,
) -> Result<usize> {
    // Read manifest from shared storage (NAS)
    let manifest_path = storage_root.join(manifest_rel_path);
    let manifest_bytes = tokio::fs::read(&manifest_path).await
        .with_context(|| format!("Failed to read manifest at {:?}", manifest_path))?;
    
    let manifest: Vec<common::models::FileManifestEntry> = serde_json::from_slice(&manifest_bytes)
        .context("Failed to parse manifest JSON")?;

    let mut total_segments = 0;
    let snapshot_dir = storage_root.join(snapshot_id.to_string());

    for entry in manifest {
        // Read file content from NAS
        let file_path = snapshot_dir.join(&entry.storage_key);
        let content_bytes = tokio::fs::read(&file_path).await
            .with_context(|| format!("Failed to read file from storage: {:?}", file_path))?;
        let content = String::from_utf8_lossy(&content_bytes).to_string();

        let extension = entry.path.split('.').next_back().unwrap_or("");
        
        if let Ok(mut segmenter) = Segmenter::new(extension) {
            let segments = segmenter.segment_code(&content)?;
            for seg in &segments {
                use sha2::{Digest, Sha256};
                let hash = format!("{:x}", Sha256::digest(seg.code_text.as_bytes()));
                
                dao.insert_segments(
                    snapshot_id, 
                    seg.symbol_name.clone(), 
                    seg.code_text.clone(),
                    hash
                ).await?;
                total_segments += 1;
            }
        }
    }
    Ok(total_segments)
}




pub struct Segmenter {
    parser: Parser,
    _language: String,
}

impl Segmenter {
    pub fn new(language: &str) -> Result<Self> {
        let mut parser = Parser::new();
        let lang: Language = match language {
            "rs" | "rust" => tree_sitter_rust::language(),
            "java" => tree_sitter_java::language(),
            _ => anyhow::bail!("Unsupported language: {}", language),
        };
        parser
            .set_language(lang)
            .context("Failed to set language")?;
        Ok(Self {
            parser,
            _language: language.to_string(),
        })
    }

    pub fn segment_code(&mut self, code: &str) -> Result<Vec<CodeSegment>> {
        let tree = self
            .parser
            .parse(code, None)
            .context("Failed to parse code")?;
        let root_node = tree.root_node();

        let mut segments = Vec::new();
        // Simplified: walk tree and find function/method definitions
        // In a real implementation, this would use Tree-sitter Queries
        self.walk_node(root_node, code, &mut segments);

        Ok(segments)
    }

    #[allow(clippy::only_used_in_recursion)]
    fn walk_node(&self, node: tree_sitter::Node, code: &str, segments: &mut Vec<CodeSegment>) {
        let kind = node.kind();
        if kind == "function_item" || kind == "method_declaration" {
            let start = node.start_position();
            let end = node.end_position();
            let text = &code[node.byte_range()];

            segments.push(CodeSegment {
                kind: kind.to_string(),
                symbol_name: None, // Could extract symbol name from child nodes
                code_text: text.to_string(),
                start_line: start.row as i32,
                end_line: end.row as i32,
            });
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.walk_node(child, code, segments);
        }
    }
}

pub struct CodeSegment {
    pub kind: String,
    pub symbol_name: Option<String>,
    pub code_text: String,
    pub start_line: i32,
    pub end_line: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_segmenter_rust() {
        let code = r#"
        pub fn add(a: i32, b: i32) -> i32 {
            a + b
        }

        struct User {
            name: String
        }

        impl User {
            fn get_name(&self) -> &str {
                &self.name
            }
        }
        "#;

        let mut segmenter = Segmenter::new("rust").unwrap();
        let segments = segmenter.segment_code(code).unwrap();

        assert_eq!(segments.len(), 2);

        let add_fn = &segments[0];
        assert_eq!(add_fn.kind, "function_item");
        assert!(add_fn.code_text.contains("pub fn add"));

        let get_name_fn = &segments[1];
        assert_eq!(get_name_fn.kind, "function_item");
        assert!(get_name_fn.code_text.contains("fn get_name"));
    }

    #[test]
    fn test_segmenter_unsupported_language() {
        let result = Segmenter::new("python");
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_process_snapshot_async() {
        let temp_dir = tempfile::tempdir().unwrap();
        let storage_root = temp_dir.path();
        let snapshot_id = Uuid::new_v4();
        let snapshot_dir = storage_root.join(snapshot_id.to_string());
        tokio::fs::create_dir_all(&snapshot_dir).await.unwrap();

        // 1. Prepare mock file on NAS
        let file_rel_path = "src/lib.rs";
        let file_content = "pub fn add(a: i32, b: i32) -> i32 { a + b }";
        let storage_key = "src_lib_rs_key";
        let file_full_path = snapshot_dir.join(storage_key);
        tokio::fs::write(&file_full_path, file_content).await.unwrap();

        // 2. Prepare mock manifest
        let manifest_entry = common::models::FileManifestEntry {
            path: file_rel_path.to_string(),
            storage_key: storage_key.to_string(),
        };
        let manifest_json = serde_json::to_vec(&vec![manifest_entry]).unwrap();
        let manifest_rel_path = "manifest.json";
        tokio::fs::write(storage_root.join(manifest_rel_path), manifest_json).await.unwrap();

        // 3. Setup Mock DAO
        let mut mock_dao = MockSegmentDao::new();
        mock_dao.expect_insert_segments()
            .withf(move |sid, symbol, text, _hash| {
                *sid == snapshot_id && symbol.as_deref() == Some("add") && text.contains("pub fn add")
            })
            .times(1)
            .returning(|_, _, _, _| Ok(()));

        // 4. Run process_snapshot
        let result = process_snapshot(&mock_dao, storage_root, manifest_rel_path, snapshot_id).await;
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 1); // 1 segment processed
    }
}

