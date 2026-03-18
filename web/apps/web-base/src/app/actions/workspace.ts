'use server';

import { getWorkspaceDb, listWorkspaces } from '@/lib/sqlite';
import { query } from '@/lib/db'; // PostgreSQL connection
import { randomUUID } from 'crypto';

// 1. Initialize a new local workspace
export async function createWorkspace(files: { path: string; content: string }[]) {
  const workspaceId = `cat_ws_${Date.now()}`;
  const db = getWorkspaceDb(workspaceId);

  // Use a transaction for fast bulk inserts
  const insertFile = db.prepare('INSERT INTO files (id, path, language) VALUES (?, ?, ?)');
  const insertSegment = db.prepare('INSERT INTO segments (id, file_id, source_text) VALUES (?, ?, ?)');

  const insertMany = db.transaction((filesList) => {
    for (const file of filesList) {
      const fileId = randomUUID();
      const ext = file.path.split('.').pop() || 'unknown';
      insertFile.run(fileId, file.path, ext);

      // Primitive line-by-line segmenting for the MVP CAT dual-pane
      const lines = file.content.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          insertSegment.run(randomUUID(), fileId, line);
        }
      }
    }
  });

  insertMany(files);
  return { success: true, workspaceId };
}

// 2. Fetch data for the active workspace
export async function getWorkspaceData(workspaceId: string) {
  const db = getWorkspaceDb(workspaceId);
  const files = db.prepare('SELECT * FROM files').all();
  const segments = db.prepare('SELECT * FROM segments').all();
  return { files, segments };
}

// 3. Update a segment in the local SQLite
export async function updateSegmentTranslation(workspaceId: string, segmentId: string, targetText: string) {
  const db = getWorkspaceDb(workspaceId);
  db.prepare('UPDATE segments SET target_text = ?, status = ? WHERE id = ?')
    .run(targetText, 'confirmed', segmentId);
  return { success: true };
}

// 4. Migrate Confirmed data from Local SQLite -> Remote PostgreSQL
export async function confirmAndSyncWorkspace(workspaceId: string) {
  try {
    const db = getWorkspaceDb(workspaceId);
    // Fetch all confirmed segments
    const confirmed = db.prepare(`
      SELECT s.id, s.source_text, s.target_text, f.path 
      FROM segments s
      JOIN files f ON s.file_id = f.id
      WHERE s.status = 'confirmed'
    `).all() as { id: string, source_text: string, target_text: string, path: string }[];

    if (confirmed.length === 0) {
      return { success: false, message: 'No confirmed segments to sync.' };
    }

    // Connect to PostgreSQL (catest_gateway)
    // We assume an `ingested_data` or similar table exists for RAG. We will create it if not.
    await query(`
      CREATE TABLE IF NOT EXISTS confirmed_translations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id VARCHAR(255),
        file_path TEXT,
        source_text TEXT,
        target_text TEXT,
        rag_status VARCHAR(50) DEFAULT 'ready_for_ingestion',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // In a real app we'd batch this or use pg-promise multi-insert
    for (const seg of confirmed) {
      await query(
        `INSERT INTO confirmed_translations (workspace_id, file_path, source_text, target_text) 
         VALUES ($1, $2, $3, $4)`,
        [workspaceId, seg.path, seg.source_text, seg.target_text]
      );
    }

    // Mark as checked in SQLite so we don't re-sync
    db.prepare('UPDATE segments SET status = ? WHERE status = ?').run('synced', 'confirmed');

    return { success: true, count: confirmed.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Sync failed:', err);
    return { success: false, error: msg };
  }
}

// 5. List available local workspaces
export async function getLocalWorkspaces() {
  return listWorkspaces();
}
