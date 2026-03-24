/**
 * .catest / .catestgroup file format generators.
 *
 * ## .catest  (per source file)
 * UTF-8 TSV with BOM.  Each row is a reviewable segment.
 * Columns: ID | Kind | Symbol | Source Code | Target (comment/review) | Status
 * Footer: metadata (project, original path, date, segment count).
 *
 * ## .catestgroup  (project manifest)
 * JSON manifest that lists all .catest files in the project with metadata.
 * Similar to Trados .sdlproj or memoQ .mqproj.
 */

import { type ParsedSegment, type SegmentKind } from "./segment-parser";

// ── .catest format ───────────────────────────────────────────────────

export interface CatestFileOptions {
  /** Original source file path relative to project root */
  originalPath: string;
  /** Project name */
  projectName: string;
  /** Detected language (e.g. "typescript") */
  language: string | null;
  /** Segments parsed from the file */
  segments: ParsedSegment[];
}

/**
 * Serialize segments into .catest file content.
 */
export function serializeCatestFile(opts: CatestFileOptions): string {
  const BOM = "\uFEFF";
  const header = `ID\tKind\tSymbol\tSource Code\tTarget\tStatus`;
  const rows = opts.segments.map((seg) =>
    [
      seg.index,
      seg.kind,
      seg.symbolName || "",
      escapeTsv(seg.code),
      "", // target — empty, to be filled during review
      "draft",
    ].join("\t")
  );

  const meta = [
    ``,
    `# ──────── CATEST File Metadata ────────`,
    `# Project:\t${opts.projectName}`,
    `# Source:\t${opts.originalPath}`,
    `# Language:\t${opts.language || "unknown"}`,
    `# Segments:\t${opts.segments.length}`,
    `# Created:\t${new Date().toISOString()}`,
    `# Generator:\tCATEST Workspace Engine`,
  ];

  return BOM + [header, ...rows, ...meta].join("\n");
}

/**
 * Parse a .catest file back into segments.
 */
export interface CatestSegmentRow {
  id: number;
  kind: SegmentKind;
  symbol: string;
  source: string;
  target: string;
  status: string;
}

export function parseCatestFile(content: string): {
  segments: CatestSegmentRow[];
  metadata: Record<string, string>;
} {
  const lines = content.replace(/^\uFEFF/, "").split("\n");
  const segments: CatestSegmentRow[] = [];
  const metadata: Record<string, string> = {};
  let headerSkipped = false;

  for (const line of lines) {
    if (line.startsWith("#")) {
      // Metadata line
      const match = /^#\s*(\w[\w\s]*):\t(.*)$/.exec(line);
      if (match) metadata[match[1].trim()] = match[2].trim();
      continue;
    }
    if (line.trim() === "") continue;
    if (!headerSkipped) {
      headerSkipped = true; // skip header row
      continue;
    }

    const cols = line.split("\t");
    if (cols.length >= 6) {
      segments.push({
        id: parseInt(cols[0], 10),
        kind: cols[1] as SegmentKind,
        symbol: cols[2],
        source: unescapeTsv(cols[3]),
        target: unescapeTsv(cols[4]),
        status: cols[5],
      });
    }
  }

  return { segments, metadata };
}

// ── .catestgroup format ──────────────────────────────────────────────

export interface CatestGroupFile {
  /** Relative path of the .catest file within the project */
  catestPath: string;
  /** Original source file path */
  originalPath: string;
  /** Detected programming language */
  language: string | null;
  /** Number of segments in this file */
  segmentCount: number;
  /** Total lines in original source */
  totalLines: number;
  /** File size in bytes (original) */
  sizeBytes: number;
}

export interface CatestGroup {
  /** Format version */
  version: "1.0";
  /** Project metadata */
  project: {
    name: string;
    description: string;
    createdAt: string;
    /** UUID of the project in the DB (if persisted) */
    projectId?: string;
    /** UUID of the snapshot (if persisted) */
    snapshotId?: string;
  };
  /** Statistics */
  stats: {
    totalFiles: number;
    totalSegments: number;
    totalSizeBytes: number;
    languages: Record<string, number>; // lang → file count
  };
  /** List of .catest files */
  files: CatestGroupFile[];
}

export interface CatestGroupOptions {
  projectName: string;
  description: string;
  projectId?: string;
  snapshotId?: string;
  files: CatestGroupFile[];
}

/**
 * Generate a .catestgroup JSON manifest.
 */
export function serializeCatestGroup(opts: CatestGroupOptions): string {
  const languages: Record<string, number> = {};
  let totalSegments = 0;
  let totalSize = 0;
  for (const f of opts.files) {
    totalSegments += f.segmentCount;
    totalSize += f.sizeBytes;
    const lang = f.language || "unknown";
    languages[lang] = (languages[lang] || 0) + 1;
  }

  const group: CatestGroup = {
    version: "1.0",
    project: {
      name: opts.projectName,
      description: opts.description,
      createdAt: new Date().toISOString(),
      projectId: opts.projectId,
      snapshotId: opts.snapshotId,
    },
    stats: {
      totalFiles: opts.files.length,
      totalSegments,
      totalSizeBytes: totalSize,
      languages,
    },
    files: opts.files,
  };

  return JSON.stringify(group, null, 2);
}

/**
 * Parse a .catestgroup file.
 */
export function parseCatestGroup(content: string): CatestGroup {
  return JSON.parse(content) as CatestGroup;
}

// ── TSV escaping ─────────────────────────────────────────────────────

function escapeTsv(text: string): string {
  // Replace tabs and newlines so TSV stays single-row per segment
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function unescapeTsv(text: string): string {
  return text
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}
