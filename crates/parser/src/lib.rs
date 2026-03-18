use anyhow::{Context, Result};
use tree_sitter::{Language, Parser};
use uuid::Uuid;

#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait SegmentDao: Send + Sync {
    async fn fetch_files(&self, snapshot_id: Uuid) -> Result<Vec<common::models::File>>;
    async fn insert_segments(&self, snapshot_id: Uuid, symbol_name: Option<String>, code_text: String) -> Result<()>;
}

pub async fn process_snapshot(
    dao: &dyn SegmentDao,
    snapshot_id: Uuid,
) -> Result<usize> {
    let files = dao.fetch_files(snapshot_id).await?;
    let mut total_segments = 0;

    for file in files {
        let extension = file.path.split('.').next_back().unwrap_or("");
        if let Ok(mut segmenter) = Segmenter::new(extension) {
            let segments = segmenter.segment_code(&file.content_text)?;
            for seg in &segments {
                dao.insert_segments(snapshot_id, seg.symbol_name.clone(), seg.code_text.clone()).await?;
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
    async fn test_process_snapshot_mock() {
        let mut mock_dao = MockSegmentDao::new();
        let snapshot_id = Uuid::new_v4();

        mock_dao.expect_fetch_files()
            .times(1)
            .returning(|_| Ok(vec![common::models::File {
                id: Uuid::new_v4(),
                snapshot_id: Uuid::new_v4(),
                path: "test.rs".to_string(),
                language: "rust".to_string(),
                size_bytes: 100,
                sha256: "abc".to_string(),
                content_text: "fn main() {}".to_string(),
                created_at: chrono::Utc::now(),
            }]));

        mock_dao.expect_insert_segments()
            .times(1)
            .returning(|_, _, _| Ok(()));

        let count = process_snapshot(&mock_dao, snapshot_id).await.unwrap();
        assert_eq!(count, 1);
    }
}
