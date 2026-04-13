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
    .filter(f => f.endsWith('.db') && f !== 'app-state.db')
    .map(f => f.replace('.db', ''));
}

/**
 * Opens (or creates) the shared app-state SQLite database at
 * .workspaces/app-state.db.  This DB is NOT per-workspace — it stores
 * per-user UI state that survives browser clears.
 */
export function getAppStateDb() {
  if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  }

  const dbPath = path.join(WORKSPACES_DIR, 'app-state.db');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_state (
      user_id    TEXT NOT NULL,
      app        TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      PRIMARY KEY (user_id, app, key)
    )
  `);

  return db;
}
