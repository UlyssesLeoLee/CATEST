use anyhow::{Result, Context};
use tree_sitter::{Parser, Language};
use uuid::Uuid;
use sqlx::PgPool;

pub struct Segmenter {
    parser: Parser,
    language: String,
}

impl Segmenter {
    pub fn new(language: &str) -> Result<Self> {
        let mut parser = Parser::new();
        let lang: Language = match language {
            "rs" | "rust" => tree_sitter_rust::language(),
            "java" => tree_sitter_java::language(),
            _ => anyhow::bail!("Unsupported language: {}", language),
        };
        parser.set_language(&lang).context("Failed to set language")?;
        Ok(Self {
            parser,
            language: language.to_string(),
        })
    }

    pub fn segment_code(&mut self, code: &str) -> Result<Vec<CodeSegment>> {
        let tree = self.parser.parse(code, None).context("Failed to parse code")?;
        let root_node = tree.root_node();
        
        let mut segments = Vec::new();
        // Simplified: walk tree and find function/method definitions
        // In a real implementation, this would use Tree-sitter Queries
        self.walk_node(root_node, code, &mut segments);
        
        Ok(segments)
    }

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
}
