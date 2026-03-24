"use server";

import { gwQuery } from "@/lib/gateway-db";
import { ingQuery } from "@/lib/ingestion-db";

// ── Types ────────────────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  repo_count: number;
}

export interface SnapshotSummary {
  id: string;
  repository_id: string;
  commit_sha: string;
  status: string;
  created_at: string;
  file_count: number;
  repo_git_url?: string;
}

export interface FileSummary {
  id: string;
  snapshot_id: string;
  path: string;
  language: string | null;
  size_bytes: number;
  is_binary: boolean;
}

export interface FileContent {
  id: string;
  path: string;
  language: string | null;
  content_text: string | null;
}

// ── Server Actions ───────────────────────────────────────────────────

/**
 * List all projects with their repository counts.
 */
export async function listProjects(): Promise<{ projects: ProjectSummary[]; error?: string }> {
  try {
    const result = await gwQuery(`
      SELECT p.id, p.name, p.description, p.status,
             COUNT(r.id)::int AS repo_count
      FROM projects p
      LEFT JOIN repositories r ON r.project_id = p.id
      GROUP BY p.id
      ORDER BY p.name ASC
    `);
    return { projects: result.rows };
  } catch (error: any) {
    console.error("listProjects error:", error.message);
    return { projects: [], error: error.message };
  }
}

/**
 * List snapshots for a project (via its repositories).
 * Only returns snapshots with status 'ready'.
 */
export async function listSnapshots(projectId: string): Promise<{ snapshots: SnapshotSummary[]; error?: string }> {
  try {
    // First get repository IDs from gateway
    const repoResult = await gwQuery(
      `SELECT id, git_url FROM repositories WHERE project_id = $1`,
      [projectId]
    );

    if (repoResult.rows.length === 0) {
      return { snapshots: [] };
    }

    const repoIds = repoResult.rows.map((r: any) => r.id);
    const repoMap = new Map(repoResult.rows.map((r: any) => [r.id, r.git_url]));

    // Query ingestion DB for snapshots
    const placeholders = repoIds.map((_: string, i: number) => `$${i + 1}`).join(",");
    const snapResult = await ingQuery(
      `SELECT s.id, s.repository_id, s.commit_sha, s.status, s.created_at,
              COUNT(f.id)::int AS file_count
       FROM snapshots s
       LEFT JOIN files f ON f.snapshot_id = s.id
       WHERE s.repository_id IN (${placeholders})
         AND s.status = 'ready'
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      repoIds
    );

    const snapshots = snapResult.rows.map((s: any) => ({
      ...s,
      repo_git_url: repoMap.get(s.repository_id) || "",
    }));

    return { snapshots };
  } catch (error: any) {
    console.error("listSnapshots error:", error.message);
    return { snapshots: [], error: error.message };
  }
}

/**
 * List files in a snapshot, excluding binaries.
 */
export async function listFiles(snapshotId: string): Promise<{ files: FileSummary[]; error?: string }> {
  try {
    const result = await ingQuery(
      `SELECT id, snapshot_id, path, language, size_bytes, is_binary
       FROM files
       WHERE snapshot_id = $1 AND is_binary = false
       ORDER BY path ASC`,
      [snapshotId]
    );
    return { files: result.rows };
  } catch (error: any) {
    console.error("listFiles error:", error.message);
    return { files: [], error: error.message };
  }
}

/**
 * Get file content for loading into the editor.
 */
export async function getFileContent(fileId: string): Promise<{ file: FileContent | null; error?: string }> {
  try {
    const result = await ingQuery(
      `SELECT id, path, language, content_text
       FROM files
       WHERE id = $1`,
      [fileId]
    );
    if (result.rows.length === 0) {
      return { file: null, error: "File not found" };
    }
    return { file: result.rows[0] };
  } catch (error: any) {
    console.error("getFileContent error:", error.message);
    return { file: null, error: error.message };
  }
}

/**
 * Get multiple files' content at once (batch load).
 */
export async function getFilesContent(fileIds: string[]): Promise<{ files: FileContent[]; error?: string }> {
  if (fileIds.length === 0) return { files: [] };
  try {
    const placeholders = fileIds.map((_, i) => `$${i + 1}`).join(",");
    const result = await ingQuery(
      `SELECT id, path, language, content_text
       FROM files
       WHERE id IN (${placeholders})`,
      fileIds
    );
    return { files: result.rows };
  } catch (error: any) {
    console.error("getFilesContent error:", error.message);
    return { files: [], error: error.message };
  }
}
