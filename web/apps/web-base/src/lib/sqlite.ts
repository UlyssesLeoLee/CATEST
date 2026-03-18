import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// This utility manages isolated SQLite databases for individual workspace sessions.
// It mimics a local .cat project file in traditional CAT tools.

const WORKSPACES_DIR = path.join(process.cwd(), '.workspaces');

// Ensure the workspaces directory exists
if (!fs.existsSync(WORKSPACES_DIR)) {
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
}

export function getWorkspaceDb(workspaceId: string) {
  const dbPath = path.join(WORKSPACES_DIR, `${workspaceId}.db`);
  const db = new Database(dbPath);

  // Initialize the CAT schema if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      language TEXT NOT NULL,
      status TEXT DEFAULT 'pending' -- pending, confirmed
    );

    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      source_text TEXT NOT NULL,
      target_text TEXT,
      status TEXT DEFAULT 'pending', -- pending, confirmed
      FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
    );
  `);

  return db;
}

export function listWorkspaces() {
  if (!fs.existsSync(WORKSPACES_DIR)) return [];
  return fs.readdirSync(WORKSPACES_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => f.replace('.db', ''));
}
