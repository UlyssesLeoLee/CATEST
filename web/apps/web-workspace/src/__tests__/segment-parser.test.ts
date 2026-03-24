/**
 * Unit tests for segment parser and .catest format.
 */
import { parseSegments, detectLanguage, isCodeFile, shouldSkip } from "@/lib/segment-parser";
import { serializeCatestFile, parseCatestFile, serializeCatestGroup, parseCatestGroup } from "@/lib/catest-format";

// ═══════════════════════════════════════════════════════════════════════
// Language Detection
// ═══════════════════════════════════════════════════════════════════════

describe("detectLanguage", () => {
  test("detects TypeScript", () => {
    expect(detectLanguage("src/app.ts")).toBe("typescript");
    expect(detectLanguage("component.tsx")).toBe("typescript");
  });

  test("detects JavaScript", () => {
    expect(detectLanguage("index.js")).toBe("javascript");
    expect(detectLanguage("config.mjs")).toBe("javascript");
  });

  test("detects Python", () => {
    expect(detectLanguage("main.py")).toBe("python");
  });

  test("detects Dockerfile", () => {
    expect(detectLanguage("Dockerfile")).toBe("dockerfile");
  });

  test("returns null for unknown extensions", () => {
    expect(detectLanguage("README")).toBeNull();
    expect(detectLanguage("data.bin")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// File filtering
// ═══════════════════════════════════════════════════════════════════════

describe("isCodeFile", () => {
  test("accepts code files", () => {
    expect(isCodeFile("src/main.ts")).toBe(true);
    expect(isCodeFile("lib/util.py")).toBe(true);
    expect(isCodeFile("Dockerfile")).toBe(true);
    expect(isCodeFile("config.json")).toBe(true);
  });

  test("rejects non-code files", () => {
    expect(isCodeFile("image.png")).toBe(false);
    expect(isCodeFile("data.bin")).toBe(false);
    expect(isCodeFile("archive.zip")).toBe(false);
  });
});

describe("shouldSkip", () => {
  test("skips node_modules", () => {
    expect(shouldSkip("project/node_modules/package/index.js")).toBe(true);
  });

  test("skips .git", () => {
    expect(shouldSkip("project/.git/HEAD")).toBe(true);
  });

  test("skips lock files", () => {
    expect(shouldSkip("package-lock.json")).toBe(true);
    expect(shouldSkip("yarn.lock")).toBe(true);
  });

  test("allows normal files", () => {
    expect(shouldSkip("src/main.ts")).toBe(false);
    expect(shouldSkip("lib/utils.py")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Segment Parsing — TypeScript
// ═══════════════════════════════════════════════════════════════════════

describe("parseSegments — TypeScript", () => {
  const tsCode = `import { Pool } from 'pg';

const DB_URL = process.env.DATABASE_URL;

export function createPool() {
  return new Pool({
    connectionString: DB_URL,
    max: 10,
  });
}

export async function query(text: string) {
  const pool = createPool();
  return pool.query(text);
}

export class DatabaseManager {
  private pool: Pool;

  constructor() {
    this.pool = createPool();
  }

  async execute(sql: string) {
    return this.pool.query(sql);
  }
}
`;

  test("detects file header (imports)", () => {
    const segments = parseSegments(tsCode, "db.ts");
    const header = segments.find(s => s.kind === "file_header");
    expect(header).toBeDefined();
    expect(header!.code).toContain("import { Pool }");
  });

  test("detects functions", () => {
    const segments = parseSegments(tsCode, "db.ts");
    const funcs = segments.filter(s => s.kind === "function");
    expect(funcs.length).toBeGreaterThanOrEqual(2);
    const names = funcs.map(f => f.symbolName);
    expect(names).toContain("createPool");
    expect(names).toContain("query");
  });

  test("detects classes", () => {
    const segments = parseSegments(tsCode, "db.ts");
    const classes = segments.filter(s => s.kind === "class");
    expect(classes.length).toBe(1);
    expect(classes[0].symbolName).toBe("DatabaseManager");
  });

  test("all segments have line ranges", () => {
    const segments = parseSegments(tsCode, "db.ts");
    for (const seg of segments) {
      expect(seg.startLine).toBeGreaterThan(0);
      expect(seg.endLine).toBeGreaterThanOrEqual(seg.startLine);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Segment Parsing — Python
// ═══════════════════════════════════════════════════════════════════════

describe("parseSegments — Python", () => {
  const pyCode = `#!/usr/bin/env python3
# Database utilities

import os
import psycopg2

DB_URL = os.environ.get("DATABASE_URL")

def create_connection():
    return psycopg2.connect(DB_URL)

class QueryExecutor:
    def __init__(self):
        self.conn = create_connection()

    def execute(self, sql):
        with self.conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()
`;

  test("detects Python functions", () => {
    const segments = parseSegments(pyCode, "db.py");
    const funcs = segments.filter(s => s.kind === "function");
    expect(funcs.length).toBeGreaterThanOrEqual(1);
    expect(funcs[0].symbolName).toBe("create_connection");
  });

  test("detects Python classes", () => {
    const segments = parseSegments(pyCode, "db.py");
    const classes = segments.filter(s => s.kind === "class");
    expect(classes.length).toBe(1);
    expect(classes[0].symbolName).toBe("QueryExecutor");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Segment Parsing — JSON (config file)
// ═══════════════════════════════════════════════════════════════════════

describe("parseSegments — Config files", () => {
  test("JSON becomes single config_block", () => {
    const json = `{"name": "test", "version": "1.0"}`;
    const segments = parseSegments(json, "package.json");
    expect(segments.length).toBe(1);
    expect(segments[0].kind).toBe("config_block");
  });

  test("YAML becomes single config_block", () => {
    const yaml = `name: test\nversion: "1.0"\ndependencies:\n  - foo`;
    const segments = parseSegments(yaml, "config.yaml");
    expect(segments.length).toBe(1);
    expect(segments[0].kind).toBe("config_block");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// .catest Format
// ═══════════════════════════════════════════════════════════════════════

describe(".catest format", () => {
  test("serialize → parse round-trip preserves segments", () => {
    const segments = parseSegments(`export function hello() {\n  return "world";\n}`, "test.ts");
    const serialized = serializeCatestFile({
      originalPath: "src/test.ts",
      projectName: "Test Project",
      language: "typescript",
      segments,
    });

    expect(serialized).toContain("Source Code");
    expect(serialized).toContain("Test Project");

    const parsed = parseCatestFile(serialized);
    expect(parsed.segments.length).toBeGreaterThan(0);
    expect(parsed.metadata["Project"]).toBe("Test Project");
    expect(parsed.metadata["Language"]).toBe("typescript");
  });

  test("TSV escaping handles tabs and newlines in code", () => {
    const code = `function test() {\n\tconst x = 1;\n\treturn x;\n}`;
    const segments = parseSegments(code, "test.ts");
    const serialized = serializeCatestFile({
      originalPath: "test.ts",
      projectName: "P",
      language: "typescript",
      segments,
    });

    // Verify tabs/newlines are escaped in the data rows
    const dataLines = serialized.split("\n").filter(l => !l.startsWith("#") && l.trim() !== "" && !l.startsWith("ID"));
    for (const line of dataLines) {
      // Each data row should have exactly 5 tabs (6 columns)
      const tabCount = (line.match(/\t/g) || []).length;
      expect(tabCount).toBe(5);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// .catestgroup Format
// ═══════════════════════════════════════════════════════════════════════

describe(".catestgroup format", () => {
  test("serialize → parse round-trip preserves structure", () => {
    const serialized = serializeCatestGroup({
      projectName: "My Project",
      description: "Test project",
      projectId: "proj-123",
      snapshotId: "snap-456",
      files: [
        { catestPath: "src/main.catest", originalPath: "src/main.ts", language: "typescript", segmentCount: 5, totalLines: 30, sizeBytes: 1024 },
        { catestPath: "lib/utils.catest", originalPath: "lib/utils.py", language: "python", segmentCount: 3, totalLines: 20, sizeBytes: 512 },
      ],
    });

    const parsed = parseCatestGroup(serialized);
    expect(parsed.version).toBe("1.0");
    expect(parsed.project.name).toBe("My Project");
    expect(parsed.project.projectId).toBe("proj-123");
    expect(parsed.stats.totalFiles).toBe(2);
    expect(parsed.stats.totalSegments).toBe(8);
    expect(parsed.stats.totalSizeBytes).toBe(1536);
    expect(parsed.stats.languages["typescript"]).toBe(1);
    expect(parsed.stats.languages["python"]).toBe(1);
    expect(parsed.files.length).toBe(2);
  });
});
