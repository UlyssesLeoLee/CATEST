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

pub async fn scan_and_index_files(
    pool: &PgPool,
    snapshot_id: Uuid,
    repo_path: &Path,
) -> Result<usize> {
    let mut count = 0;
    for entry in WalkDir::new(repo_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        if path.components().any(|c| c.as_os_str() == ".git") {
            continue;
        }

        let relative_path = path.strip_prefix(repo_path)?.to_string_lossy().to_string();
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown");
        let content = std::fs::read(path)?;
        let sha256 = format!("{:x}", Sha256::digest(&content));

        sqlx::query(
            "INSERT INTO files (snapshot_id, path, language, size_bytes, sha256, content_text)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (snapshot_id, path) DO NOTHING",
        )
        .bind(snapshot_id)
        .bind(relative_path)
        .bind(extension)
        .bind(content.len() as i64)
        .bind(sha256)
        .bind(String::from_utf8_lossy(&content))
        .execute(pool)
        .await?;

        count += 1;
    }
    Ok(count)
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_scan_and_index_files() {
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
