use anyhow::{Context, Result};
use git2::Repository;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::path::Path;
use uuid::Uuid;
use walkdir::WalkDir;

pub async fn clone_repo(url: &str, target_dir: &Path) -> Result<Repository> {
    tracing::info!("Cloning repo {} to {:?}", url, target_dir);
    Repository::clone(url, target_dir).context("Failed to clone repository")
}

#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait FileDao: Send + Sync {
    async fn insert_file(
        &self,
        snapshot_id: Uuid,
        path: String,
        language: String,
        size_bytes: i64,
        sha256: String,
        s3_key: Option<String>,
    ) -> Result<()>;
}

#[async_trait::async_trait]
impl FileDao for sqlx::PgPool {
    async fn insert_file(
        &self,
        snapshot_id: Uuid,
        path: String,
        language: String,
        size_bytes: i64,
        sha256: String,
        s3_key: Option<String>,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO files (snapshot_id, path, language, size_bytes, sha256, s3_key)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (snapshot_id, path) DO UPDATE SET s3_key = $6",
        )
        .bind(snapshot_id)
        .bind(path)
        .bind(language)
        .bind(size_bytes)
        .bind(sha256)
        .bind(s3_key)
        .execute(self)
        .await?;
        Ok(())
    }
}

use common::models::{File, FileManifestEntry};


pub async fn scan_and_index_files(
    dao: &dyn FileDao,
    storage_root: &Path,
    snapshot_id: Uuid,
    repo_path: &Path,
) -> Result<Vec<FileManifestEntry>> {
    let mut manifest = Vec::new();
    let snapshot_dir = storage_root.join(snapshot_id.to_string());
    
    // Create snapshot directory on the NAS
    tokio::fs::create_dir_all(&snapshot_dir).await
        .with_context(|| format!("Failed to create snapshot directory at {:?}", snapshot_dir))?;

    for entry in WalkDir::new(repo_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        if path.components().any(|c| c.as_os_str() == ".git") {
            continue;
        }
 
        let relative_path_os = path.strip_prefix(repo_path)?;
        let relative_path = relative_path_os.to_string_lossy().to_string();
        
        // Normalize path for cross-platform (use forward slashes in DB/Manifest)
        let normalized_path = relative_path.replace('\\', "/");

        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown");
        let content = tokio::fs::read(path).await?;
        let sha256 = format!("{:x}", Sha256::digest(&content));
        
        // Write to shared storage (NAS)
        let target_path = snapshot_dir.join(relative_path_os);
        if let Some(parent) = target_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&target_path, &content).await?;

        // DB indexing
        dao.insert_file(
            snapshot_id,
            normalized_path.clone(),
            extension.to_string(),
            content.len() as i64,
            sha256,
            Some(normalized_path.clone()), // The "key" is now just the relative path
        )
        .await?;

        manifest.push(FileManifestEntry {
            path: normalized_path.clone(),
            storage_key: normalized_path,
        });
    }
    Ok(manifest)
}




#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_scan_and_index_files_mock() {
        let mut mock_dao = MockFileDao::new();
        let snapshot_id = Uuid::new_v4();
        
        // Expect 2 file insertions
        mock_dao.expect_insert_file()
            .times(2)
            .returning(|_, _, _, _, _, _| Ok(()));

        let repo_dir = tempdir().unwrap();
        let repo_path = repo_dir.path();

        let storage_dir = tempdir().unwrap();
        let storage_root = storage_dir.path();

        let file1_path = repo_path.join("test.rs");
        fs::write(file1_path, "fn main() {}").unwrap();

        let file2_path = repo_path.join("other.txt");
        fs::write(file2_path, "hello").unwrap();

        let manifest = scan_and_index_files(&mock_dao, storage_root, snapshot_id, repo_path).await.unwrap();
        assert_eq!(manifest.len(), 2);
    }


    #[tokio::test]
    async fn test_scan_and_index_files_logic() {
        // ... (pre-existing logic test)
        // Create a temporary directory structure
        let dir = tempdir().unwrap();
        let repo_path = dir.path();

        // Create some files
        let file1_path = repo_path.join("file1.rs");
        let mut file1 = fs::File::create(&file1_path).unwrap();
        file1.write_all(b"fn main() {}").unwrap();

        let nested_dir = repo_path.join("src");
        fs::create_dir(&nested_dir).unwrap();
        let file2_path = nested_dir.join("lib.rs");
        let mut file2 = fs::File::create(&file2_path).unwrap();
        file2
            .write_all(b"pub fn add(a: i32, b: i32) -> i32 { a + b }")
            .unwrap();

        // Create a fake .git directory (should be ignored)
        let git_dir = repo_path.join(".git");
        fs::create_dir(&git_dir).unwrap();
        let git_file = git_dir.join("config");
        let mut config_file = fs::File::create(&git_file).unwrap();
        config_file.write_all(b"[core]").unwrap();

        // Test the filtering logic (without DB connection for unit test simplicity)
        let mut count = 0;
        let mut found_files = Vec::new();

        for entry in WalkDir::new(repo_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let path = entry.path();
            if path.components().any(|c| c.as_os_str() == ".git") {
                continue;
            }

            let relative_path = path
                .strip_prefix(repo_path)
                .unwrap()
                .to_string_lossy()
                .to_string();
            found_files.push(relative_path);
            count += 1;
        }

        assert_eq!(count, 2);
        assert!(found_files.contains(&"file1.rs".to_string()));
        #[cfg(windows)]
        assert!(found_files.contains(&"src\\lib.rs".to_string()));
        #[cfg(not(windows))]
        assert!(found_files.contains(&"src/lib.rs".to_string()));
    }
}
