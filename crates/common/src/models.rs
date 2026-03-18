use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Tenant {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Project {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub settings: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Repository {
    pub id: Uuid,
    pub project_id: Uuid,
    pub provider: String,
    pub git_url: String,
    pub default_branch: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct File {
    pub id: Uuid,
    pub snapshot_id: Uuid,
    pub path: String,
    pub language: String,
    pub size_bytes: i64,
    pub sha256: String,
    pub content_text: Option<String>,
    pub s3_key: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileManifestEntry {
    pub path: String,
    pub storage_key: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn test_tenant_serialization() {
        let tenant = Tenant {
            id: Uuid::new_v4(),
            name: "Test Tenant".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let json = serde_json::to_string(&tenant).unwrap();
        let deserialized: Tenant = serde_json::from_str(&json).unwrap();

        assert_eq!(tenant.id, deserialized.id);
        assert_eq!(tenant.name, deserialized.name);
    }

    #[test]
    fn test_project_serialization() {
        let project = Project {
            id: Uuid::new_v4(),
            tenant_id: Uuid::new_v4(),
            name: "Test Project".to_string(),
            description: Some("Description".to_string()),
            status: "active".to_string(),
            settings: serde_json::json!({"key": "value"}),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let json = serde_json::to_string(&project).unwrap();
        let deserialized: Project = serde_json::from_str(&json).unwrap();

        assert_eq!(project.id, deserialized.id);
        assert_eq!(project.tenant_id, deserialized.tenant_id);
        assert_eq!(project.name, deserialized.name);
        assert_eq!(project.description, deserialized.description);
        assert_eq!(project.status, deserialized.status);
    }

    #[test]
    fn test_repository_serialization() {
        let repo = Repository {
            id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            provider: "github".to_string(),
            git_url: "https://github.com/test/test.git".to_string(),
            default_branch: Some("main".to_string()),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let json = serde_json::to_string(&repo).unwrap();
        let deserialized: Repository = serde_json::from_str(&json).unwrap();

        assert_eq!(repo.id, deserialized.id);
        assert_eq!(repo.project_id, deserialized.project_id);
        assert_eq!(repo.provider, deserialized.provider);
        assert_eq!(repo.git_url, deserialized.git_url);
    }

    #[test]
    fn test_file_serialization() {
        let file = File {
            id: Uuid::new_v4(),
            snapshot_id: Uuid::new_v4(),
            path: "src/main.rs".to_string(),
            language: "rust".to_string(),
            size_bytes: 1024,
            sha256: "hash".to_string(),
            content_text: Some("fn main() {}".to_string()),
            s3_key: Some("bucket/key".to_string()),
            created_at: Utc::now(),
        };

        let json = serde_json::to_string(&file).unwrap();
        let deserialized: File = serde_json::from_str(&json).unwrap();

        assert_eq!(file.id, deserialized.id);
        assert_eq!(file.s3_key, deserialized.s3_key);
    }
}
