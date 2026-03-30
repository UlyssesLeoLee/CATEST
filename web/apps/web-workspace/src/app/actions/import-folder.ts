"use server";

import { query } from "@/lib/db";
import { ingQuery } from "@/lib/ingestion-db";
import { wsQuery } from "@/lib/workspace-db";
import { parseSegments, detectLanguage, isCodeFile, shouldSkip } from "@/lib/segment-parser";
import {
  serializeCatestFile,
  serializeCatestGroup,
  parseCatestFile,
  parseCatestGroup,
  type CatestGroupFile,
  type CatestGroup,
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
      const lang = detectLanguage(file.path) || "text";
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

// ── Import from .catestgroup ─────────────────────────────────────────

/**
 * Import a project from a .catestgroup manifest + .catest files.
 * Used for collaboration: user A exports → user B imports into their workspace.
 *
 * This re-creates the project, snapshot, files, and segments from the
 * provided .catestgroup + .catest data — no original source files needed.
 */
export async function importFromCatestGroup(
  catestGroupContent: string,
  catestFileContents: Record<string, string>  // catestPath → content
): Promise<ImportResult> {
  try {
    const group = parseCatestGroup(catestGroupContent);

    if (!group.files || group.files.length === 0) {
      return { success: false, error: "The .catestgroup file contains no files." };
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

    // 2. Create project (new ID — separate from original)
    const projRes = await query(
      `INSERT INTO projects (tenant_id, name, description, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [tenantId, group.project.name, group.project.description || null]
    );
    const projectId = projRes.rows[0].id;

    // 3. Create repository
    const repoRes = await query(
      `INSERT INTO repositories (project_id, provider, git_url, default_branch)
       VALUES ($1, 'catestgroup', $2, 'main')
       RETURNING id`,
      [projectId, `catestgroup://${group.project.name}`]
    );
    const repoId = repoRes.rows[0].id;

    // 4. Create snapshot
    const snapshotRes = await ingQuery(
      `INSERT INTO snapshots (repository_id, commit_sha, status)
       VALUES ($1, $2, 'ready')
       RETURNING id`,
      [repoId, crypto.randomBytes(20).toString("hex")]
    );
    const snapshotId = snapshotRes.rows[0].id;

    // 5. Process each file from the group manifest
    let totalSegments = 0;
    const languageCounts: Record<string, number> = {};
    const newCatestFiles: Record<string, string> = {};
    const newGroupFiles: CatestGroupFile[] = [];

    for (const fileInfo of group.files) {
      const catestContent = catestFileContents[fileInfo.catestPath];
      if (!catestContent) continue; // skip missing .catest files

      const parsed = parseCatestFile(catestContent);
      const lang = fileInfo.language || "text";

      // Reconstruct source from segments
      const reconstructedSource = parsed.segments.map((s) => s.source).join("\n\n");
      const sha256 = crypto.createHash("sha256").update(reconstructedSource).digest("hex");

      // Store file in ingestion DB
      await ingQuery(
        `INSERT INTO files (snapshot_id, path, language, size_bytes, sha256, content_text, is_binary)
         VALUES ($1, $2, $3, $4, $5, $6, false)
         ON CONFLICT (snapshot_id, path) DO UPDATE SET content_text = $6, sha256 = $5`,
        [snapshotId, fileInfo.originalPath, lang, fileInfo.sizeBytes, sha256, reconstructedSource]
      );

      // Store segments in workspace DB
      for (const seg of parsed.segments) {
        const normHash = crypto
          .createHash("sha256")
          .update(`${snapshotId}:${fileInfo.originalPath}:${seg.id}:${seg.source}`)
          .digest("hex");

        await wsQuery(
          `INSERT INTO segments (snapshot_id, kind, symbol_name, code_text, normalized_hash, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (normalized_hash) DO NOTHING`,
          [
            snapshotId,
            seg.kind,
            seg.symbol || null,
            seg.source,
            normHash,
            JSON.stringify({
              file_path: fileInfo.originalPath,
              language: lang,
              target: seg.target,
              status: seg.status,
            }),
          ]
        );
      }

      totalSegments += parsed.segments.length;
      languageCounts[lang] = (languageCounts[lang] || 0) + 1;

      // Preserve the .catest content (may contain review data from collaborator)
      newCatestFiles[fileInfo.catestPath] = catestContent;
      newGroupFiles.push(fileInfo);
    }

    // 6. Generate new .catestgroup (with new IDs)
    const catestGroupOut = serializeCatestGroup({
      projectName: group.project.name,
      description: group.project.description || "",
      projectId,
      snapshotId,
      files: newGroupFiles,
    });

    return {
      success: true,
      projectId,
      snapshotId,
      catestGroupContent: catestGroupOut,
      catestFiles: newCatestFiles,
      stats: {
        totalFiles: newGroupFiles.length,
        totalSegments,
        skippedFiles: group.files.length - newGroupFiles.length,
        languages: languageCounts,
      },
    };
  } catch (err: any) {
    console.error("Import catestgroup error:", err);
    return { success: false, error: err.message };
  }
}

// ── Export project as downloadable .catestgroup ──────────────────────

/**
 * Re-generate the .catestgroup + .catest files for an existing project,
 * ready for download and sharing with collaborators.
 */
export async function exportProject(projectId: string): Promise<ImportResult> {
  try {
    // Get project
    const projRes = await query(
      `SELECT id, name, description FROM projects WHERE id = $1`,
      [projectId]
    );
    if (projRes.rows.length === 0) {
      return { success: false, error: "Project not found." };
    }
    const project = projRes.rows[0];

    // Get repos + snapshots
    const repoRes = await query(
      `SELECT id FROM repositories WHERE project_id = $1`,
      [projectId]
    );
    if (repoRes.rows.length === 0) {
      return { success: false, error: "No repositories found for this project." };
    }

    const snapshotRes = await ingQuery(
      `SELECT id FROM snapshots WHERE repository_id = $1 AND status = 'ready' ORDER BY created_at DESC LIMIT 1`,
      [repoRes.rows[0].id]
    );
    if (snapshotRes.rows.length === 0) {
      return { success: false, error: "No ready snapshot found." };
    }
    const snapshotId = snapshotRes.rows[0].id;

    // Get all files in snapshot
    const filesRes = await ingQuery(
      `SELECT id, path, language, size_bytes, content_text FROM files WHERE snapshot_id = $1 AND is_binary = false ORDER BY path`,
      [snapshotId]
    );

    const catestFiles: Record<string, string> = {};
    const groupFiles: CatestGroupFile[] = [];
    let totalSegments = 0;
    const languageCounts: Record<string, number> = {};

    for (const file of filesRes.rows) {
      const segments = parseSegments(file.content_text || "", file.path);
      totalSegments += segments.length;

      const catestPath = file.path.replace(/\.[^.]+$/, ".catest");
      const catestContent = serializeCatestFile({
        originalPath: file.path,
        projectName: project.name,
        language: file.language,
        segments,
      });
      catestFiles[catestPath] = catestContent;

      groupFiles.push({
        catestPath,
        originalPath: file.path,
        language: file.language,
        segmentCount: segments.length,
        totalLines: (file.content_text || "").split("\n").length,
        sizeBytes: file.size_bytes,
      });

      const lang = file.language || "text";
      languageCounts[lang] = (languageCounts[lang] || 0) + 1;
    }

    const catestGroupContent = serializeCatestGroup({
      projectName: project.name,
      description: project.description || "",
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
        totalFiles: groupFiles.length,
        totalSegments,
        skippedFiles: 0,
        languages: languageCounts,
      },
    };
  } catch (err: any) {
    console.error("Export project error:", err);
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
