"use server";

import { query } from "@/lib/db";
import { ingQuery } from "@/lib/ingestion-db";
import { wsQuery } from "@/lib/workspace-db";
import { parseSegments, detectLanguage, isCodeFile, shouldSkip } from "@/lib/segment-parser";
import {
  serializeCatestFile,
  serializeCatestGroup,
  type CatestGroupFile,
} from "@/lib/catest-format";
import crypto from "crypto";

// ── Types ────────────────────────────────────────────────────────────

export interface ImportFileEntry {
  /** Relative path within the uploaded folder */
  path: string;
  /** Raw file content (text) */
  content: string;
  /** File size in bytes */
  sizeBytes: number;
}

export interface ImportResult {
  success: boolean;
  error?: string;
  projectId?: string;
  snapshotId?: string;
  /** The .catestgroup JSON content */
  catestGroupContent?: string;
  /** Individual .catest file contents, keyed by relative path */
  catestFiles?: Record<string, string>;
  stats?: {
    totalFiles: number;
    totalSegments: number;
    skippedFiles: number;
    languages: Record<string, number>;
  };
}

export interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  file_count?: number;
  segment_count?: number;
}

// ── List existing projects ───────────────────────────────────────────

export async function listWorkspaceProjects(): Promise<ProjectInfo[]> {
  try {
    const res = await query(
      `SELECT p.id, p.name, p.description, p.status, p.created_at
       FROM projects p
       ORDER BY p.updated_at DESC`
    );
    return res.rows;
  } catch {
    return [];
  }
}

// ── Main import action ───────────────────────────────────────────────

/**
 * Import a folder of code files → create project, snapshot, files,
 * parse segments, generate .catest + .catestgroup files.
 *
 * Flow:
 * 1. Create project in catest_gateway.projects
 * 2. Create repository + snapshot in catest_gateway / catest_ingestion
 * 3. Store file content in catest_ingestion.files
 * 4. Parse each file into segments → store in catest_workspace.segments
 * 5. Generate .catest file per source + .catestgroup manifest
 * 6. Return all generated content for download
 */
export async function importFolder(
  projectName: string,
  description: string,
  files: ImportFileEntry[]
): Promise<ImportResult> {
  try {
    // Filter to code files, skip binary/node_modules/etc
    const codeFiles = files.filter(
      (f) => !shouldSkip(f.path) && isCodeFile(f.path)
    );

    if (codeFiles.length === 0) {
      return { success: false, error: "No importable code files found in the folder." };
    }

    // 1. Get or create tenant
    const tenantRes = await query(
      `SELECT id FROM tenants ORDER BY created_at LIMIT 1`
    );
    let tenantId: string;
    if (tenantRes.rows.length > 0) {
      tenantId = tenantRes.rows[0].id;
    } else {
      const newTenant = await query(
        `INSERT INTO tenants (name) VALUES ($1) RETURNING id`,
        ["Default Tenant"]
      );
      tenantId = newTenant.rows[0].id;
    }

    // 2. Create project
    const projRes = await query(
      `INSERT INTO projects (tenant_id, name, description, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [tenantId, projectName, description || null]
    );
    const projectId = projRes.rows[0].id;

    // 3. Create repository (local folder import)
    const repoRes = await query(
      `INSERT INTO repositories (project_id, provider, git_url, default_branch)
       VALUES ($1, 'local', $2, 'main')
       RETURNING id`,
      [projectId, `local://${projectName}`]
    );
    const repoId = repoRes.rows[0].id;

    // 4. Create snapshot in ingestion DB
    const snapshotRes = await ingQuery(
      `INSERT INTO snapshots (repository_id, commit_sha, status)
       VALUES ($1, $2, 'ready')
       RETURNING id`,
      [repoId, crypto.randomBytes(20).toString("hex")]
    );
    const snapshotId = snapshotRes.rows[0].id;

    // 5. Process each file
    const catestFiles: Record<string, string> = {};
    const groupFiles: CatestGroupFile[] = [];
    const languageCounts: Record<string, number> = {};
    let totalSegments = 0;
    let skippedFiles = files.length - codeFiles.length;

    for (const file of codeFiles) {
      const lang = detectLanguage(file.path);
      const sha256 = crypto.createHash("sha256").update(file.content).digest("hex");

      // Store file in ingestion DB
      await ingQuery(
        `INSERT INTO files (snapshot_id, path, language, size_bytes, sha256, content_text, is_binary)
         VALUES ($1, $2, $3, $4, $5, $6, false)
         ON CONFLICT (snapshot_id, path) DO UPDATE SET content_text = $6, sha256 = $5, size_bytes = $4`,
        [snapshotId, file.path, lang, file.sizeBytes, sha256, file.content]
      );

      // Parse segments
      const segments = parseSegments(file.content, file.path);
      totalSegments += segments.length;

      // Store segments in workspace DB
      for (const seg of segments) {
        const normHash = crypto
          .createHash("sha256")
          .update(`${snapshotId}:${file.path}:${seg.index}:${seg.code}`)
          .digest("hex");

        await wsQuery(
          `INSERT INTO segments (snapshot_id, kind, symbol_name, code_text, normalized_hash, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (normalized_hash) DO NOTHING`,
          [
            snapshotId,
            seg.kind,
            seg.symbolName,
            seg.code,
            normHash,
            JSON.stringify({
              file_path: file.path,
              start_line: seg.startLine,
              end_line: seg.endLine,
              language: lang,
            }),
          ]
        );
      }

      // Generate .catest file
      const catestPath = file.path.replace(/\.[^.]+$/, ".catest");
      const catestContent = serializeCatestFile({
        originalPath: file.path,
        projectName,
        language: lang,
        segments,
      });
      catestFiles[catestPath] = catestContent;

      // Track for group
      groupFiles.push({
        catestPath,
        originalPath: file.path,
        language: lang,
        segmentCount: segments.length,
        totalLines: file.content.split("\n").length,
        sizeBytes: file.sizeBytes,
      });

      const langKey = lang || "unknown";
      languageCounts[langKey] = (languageCounts[langKey] || 0) + 1;
    }

    // 6. Generate .catestgroup
    const catestGroupContent = serializeCatestGroup({
      projectName,
      description: description || "",
      projectId,
      snapshotId,
      files: groupFiles,
    });

    return {
      success: true,
      projectId,
      snapshotId,
      catestGroupContent,
      catestFiles,
      stats: {
        totalFiles: codeFiles.length,
        totalSegments,
        skippedFiles,
        languages: languageCounts,
      },
    };
  } catch (err: any) {
    console.error("Import folder error:", err);
    return { success: false, error: err.message };
  }
}

// ── Delete project ───────────────────────────────────────────────────

export async function deleteProject(projectId: string): Promise<{ success: boolean }> {
  try {
    // Get repos & snapshots for cleanup
    const repos = await query(
      `SELECT id FROM repositories WHERE project_id = $1`,
      [projectId]
    );
    for (const repo of repos.rows) {
      // Delete ingestion data
      const snaps = await ingQuery(
        `SELECT id FROM snapshots WHERE repository_id = $1`,
        [repo.id]
      );
      for (const snap of snaps.rows) {
        // Delete segments
        await wsQuery(`DELETE FROM segments WHERE snapshot_id = $1`, [snap.id]);
        // Delete files
        await ingQuery(`DELETE FROM files WHERE snapshot_id = $1`, [snap.id]);
      }
      await ingQuery(`DELETE FROM snapshots WHERE repository_id = $1`, [repo.id]);
    }

    // Delete repos & project
    await query(`DELETE FROM repositories WHERE project_id = $1`, [projectId]);
    await query(`DELETE FROM projects WHERE id = $1`, [projectId]);
    return { success: true };
  } catch (err: any) {
    console.error("Delete project error:", err);
    return { success: false };
  }
}
