"use server";

/**
 * GitHub repository import action.
 *
 * Two-phase flow:
 * 1. previewGitHubRepo  — fetch file tree via GitHub API, return metadata for UI preview
 * 2. importFromGitHub   — fetch file contents, run the same DB pipeline as importFolder
 *
 * Supports public repos out-of-the-box; pass a Personal Access Token (or fine-grained
 * token) for private repos.  No oauth is required from the server side.
 *
 * The neo4j-driver package works with the same bolt protocol, and no extra npm packages
 * are needed here — we use the built-in fetch API throughout.
 */

import { query } from "@/lib/db";
import { ingQuery } from "@/lib/ingestion-db";
import { wsQuery } from "@/lib/workspace-db";
import { parseSegments, detectLanguage, isCodeFile, shouldSkip } from "@/lib/segment-parser";
import { serializeCatestFile, serializeCatestGroup, type CatestGroupFile } from "@/lib/catest-format";
import crypto from "crypto";
import type { ImportResult } from "./import-folder";

// ── GitHub REST API helpers ───────────────────────────────────────────

const GITHUB_API = "https://api.github.com";

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const clean = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  // Supports https://github.com/owner/repo and git@github.com:owner/repo
  const match = clean.match(/github\.com[:/]([^/\s]+)\/([^/\s]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

async function ghFetch<T = unknown>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "CATEST-Workspace/1.0",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers,
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `GitHub API ${res.status}: ${(body as { message?: string }).message ?? res.statusText}`,
    );
  }
  return res.json() as Promise<T>;
}

// ── Public Types ─────────────────────────────────────────────────────

export interface GitHubPreviewFile {
  path: string;
  size: number;
  sha: string;
}

export interface GitHubPreviewResult {
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string;
  files: GitHubPreviewFile[];
  totalSize: number;
  truncated: boolean;
}

// ── Phase 1: Preview ─────────────────────────────────────────────────

/**
 * Fetch the repository file tree from GitHub and return filterable metadata.
 * No content is downloaded in this phase — only paths and sizes.
 */
export async function previewGitHubRepo(
  repoUrl: string,
  branch?: string,
  accessToken?: string,
): Promise<GitHubPreviewResult> {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed)
    throw new Error(
      "Invalid GitHub URL. Expected: https://github.com/owner/repo",
    );

  const { owner, repo } = parsed;

  // Resolve default branch
  const repoInfo = await ghFetch<{ default_branch: string }>(
    `/repos/${owner}/${repo}`,
    accessToken,
  );
  const defaultBranch = repoInfo.default_branch ?? "main";
  const targetBranch = branch?.trim() || defaultBranch;

  // Recursive tree (GitHub returns up to ~100k entries; truncated=true if more)
  const treeData = await ghFetch<{
    tree: { type: string; path: string; size?: number; sha: string }[];
    truncated: boolean;
  }>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(targetBranch)}?recursive=1`,
    accessToken,
  );

  const files: GitHubPreviewFile[] = treeData.tree
    .filter((item) => item.type === "blob")
    .filter((item) => !shouldSkip(item.path))
    .filter((item) => isCodeFile(item.path))
    .filter((item) => (item.size ?? 0) < 500_000) // skip files > 500 KB
    .map((item) => ({ path: item.path, size: item.size ?? 0, sha: item.sha }));

  return {
    owner,
    repo,
    branch: targetBranch,
    defaultBranch,
    files,
    totalSize: files.reduce((s, f) => s + f.size, 0),
    truncated: treeData.truncated ?? false,
  };
}

// ── Phase 2: Import ───────────────────────────────────────────────────

/**
 * Download file contents from GitHub and run the standard CATEST import pipeline.
 * Creates project → repository (provider='github') → snapshot → files → segments.
 *
 * @param repoUrl       Full GitHub URL, e.g. https://github.com/owner/repo
 * @param branch        Branch to import (resolved via previewGitHubRepo if needed)
 * @param accessToken   Optional PAT for private repos
 * @param projectName   Display name for the created project
 * @param description   Optional project description
 * @param selectedPaths If provided, only import these file paths (subset of preview)
 */
export async function importFromGitHub(
  repoUrl: string,
  branch: string,
  accessToken: string | undefined,
  projectName: string,
  description: string,
  selectedPaths?: string[],
): Promise<ImportResult> {
  try {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) throw new Error("Invalid GitHub URL");
    const { owner, repo } = parsed;

    // Fetch the file list (needed for sha references)
    const preview = await previewGitHubRepo(repoUrl, branch, accessToken);
    const filesToFetch = selectedPaths
      ? preview.files.filter((f) => selectedPaths.includes(f.path))
      : preview.files;

    if (filesToFetch.length === 0) {
      return {
        success: false,
        error: "No importable code files found in this repository.",
      };
    }

    // ── Fetch file contents in concurrent batches ─────────────────────
    const BATCH = 8;
    const fileEntries: { path: string; content: string; size: number }[] = [];

    for (let i = 0; i < filesToFetch.length; i += BATCH) {
      const batch = filesToFetch.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (f) => {
          const encodedPath = f.path
            .split("/")
            .map(encodeURIComponent)
            .join("/");
          const data = await ghFetch<{ content: string }>(
            `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
            accessToken,
          );
          // GitHub returns base64-encoded content (with newlines stripped)
          const rawB64 = (data.content ?? "").replace(/\n/g, "");
          const content = Buffer.from(rawB64, "base64").toString("utf-8");
          return { path: f.path, content, size: f.size };
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          fileEntries.push(r.value);
        } else {
          console.warn(
            "[GitHub import] file fetch failed:",
            (r as PromiseRejectedResult).reason?.message,
          );
        }
      }
    }

    if (fileEntries.length === 0) {
      return {
        success: false,
        error: "Failed to fetch any file contents from GitHub.",
      };
    }

    // ── DB pipeline (mirrors importFolder with provider='github') ─────

    // 1. Get or create tenant
    const tenantRes = await query(
      `SELECT id FROM tenants ORDER BY created_at LIMIT 1`,
    );
    let tenantId: string;
    if (tenantRes.rows.length > 0) {
      tenantId = tenantRes.rows[0].id as string;
    } else {
      const t = await query(
        `INSERT INTO tenants (name) VALUES ($1) RETURNING id`,
        ["Default Tenant"],
      );
      tenantId = t.rows[0].id as string;
    }

    // 2. Create project
    const finalProjectName =
      projectName.trim() || `${owner}/${repo}`;
    const projRes = await query(
      `INSERT INTO projects (tenant_id, name, description, status)
       VALUES ($1, $2, $3, 'active') RETURNING id`,
      [tenantId, finalProjectName, description.trim() || null],
    );
    const projectId = projRes.rows[0].id as string;

    // 3. Create repository with GitHub provenance
    const canonicalUrl = `https://github.com/${owner}/${repo}`;
    const repoRes = await query(
      `INSERT INTO repositories (project_id, provider, git_url, default_branch)
       VALUES ($1, 'github', $2, $3) RETURNING id`,
      [projectId, canonicalUrl, branch],
    );
    const repoId = repoRes.rows[0].id as string;

    // 4. Create snapshot
    const snapshotRes = await ingQuery(
      `INSERT INTO snapshots (repository_id, commit_sha, status)
       VALUES ($1, $2, 'ready') RETURNING id`,
      [repoId, crypto.randomBytes(20).toString("hex")],
    );
    const snapshotId = snapshotRes.rows[0].id as string;

    // 5. Process each file
    const catestFiles: Record<string, string> = {};
    const groupFiles: CatestGroupFile[] = [];
    const languageCounts: Record<string, number> = {};
    let totalSegments = 0;

    for (const file of fileEntries) {
      const lang = detectLanguage(file.path) || "text";
      const sha256 = crypto
        .createHash("sha256")
        .update(file.content)
        .digest("hex");

      // Store raw file in ingestion DB
      await ingQuery(
        `INSERT INTO files (snapshot_id, path, language, size_bytes, sha256, content_text, is_binary)
         VALUES ($1, $2, $3, $4, $5, $6, false)
         ON CONFLICT (snapshot_id, path) DO UPDATE
           SET content_text = $6, sha256 = $5, size_bytes = $4`,
        [snapshotId, file.path, lang, file.size, sha256, file.content],
      );

      // Parse and store segments
      const segments = parseSegments(file.content, file.path);
      totalSegments += segments.length;

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
          ],
        );
      }

      // Generate .catest file
      const catestPath = file.path.replace(/\.[^.]+$/, ".catest");
      catestFiles[catestPath] = serializeCatestFile({
        originalPath: file.path,
        projectName: finalProjectName,
        language: lang,
        segments,
      });

      groupFiles.push({
        catestPath,
        originalPath: file.path,
        language: lang,
        segmentCount: segments.length,
        totalLines: file.content.split("\n").length,
        sizeBytes: file.size,
      });

      languageCounts[lang] = (languageCounts[lang] || 0) + 1;
    }

    // 6. Generate .catestgroup manifest
    const catestGroupContent = serializeCatestGroup({
      projectName: finalProjectName,
      description:
        description.trim() || `Imported from ${canonicalUrl} (${branch})`,
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
        totalFiles: fileEntries.length,
        totalSegments,
        skippedFiles: filesToFetch.length - fileEntries.length,
        languages: languageCounts,
      },
    };
  } catch (err: unknown) {
    console.error("[GitHub import] error:", err);
    return {
      success: false,
      error: (err as Error).message ?? "Unknown error",
    };
  }
}
