/**
 * Comprehensive Integration Tests for CATEST Review Server Actions
 *
 * Tests: Translation Memory, Terminology Base, Project Files, pgvector, AGE
 * Requires: PostgreSQL with pgvector + AGE running on catest_review / catest_gateway / catest_ingestion
 */

// ── Translation Memory Tests ──────────────────────────────────────────
import {
  listTMBanks,
  searchTM,
  addToTM,
  getTMEntries,
  deleteTMEntry,
} from "../app/actions/translation-memory";

import {
  listTBBanks,
  searchTB,
  addTBEntry,
  getTBEntries,
  deleteTBEntry,
} from "../app/actions/terminology-base";

import {
  listProjects,
  listSnapshots,
  listFiles,
  getFileContent,
  getFilesContent,
} from "../app/actions/project-files";

import { reviewQuery, reviewPool } from "@/lib/review-db";
import type { PoolClient } from "pg";

// ═══════════════════════════════════════════════════════════════════════
// Translation Memory
// ═══════════════════════════════════════════════════════════════════════

describe("Translation Memory", () => {
  let testEntryId: string | null = null;

  test("listTMBanks returns banks with counts", async () => {
    const banks = await listTMBanks();
    expect(Array.isArray(banks)).toBe(true);
    expect(banks.length).toBeGreaterThan(0);
    const defaultBank = banks.find((b) => b.name === "default");
    expect(defaultBank).toBeDefined();
    expect(Number(defaultBank!.entry_count)).toBeGreaterThan(0);
    console.log(`  TM banks: ${banks.map((b) => `${b.name}(${b.entry_count})`).join(", ")}`);
  });

  test("getTMEntries returns seeded entries", async () => {
    const result = await getTMEntries("default", 50);
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);

    const entry = result.entries[0];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("source_text");
    expect(entry).toHaveProperty("target_text");
    expect(entry).toHaveProperty("usage_count");
    console.log(`  TM entries: ${result.total} total, first: "${entry.source_text.slice(0, 40)}..."`);
  });

  test("searchTM finds relevant entries by full-text", async () => {
    const result = await searchTM("handleRequest", "default", 10);
    expect(result.length).toBeGreaterThan(0);
    const match = result.find((e) => e.source_text.includes("handleRequest"));
    expect(match).toBeDefined();
    console.log(`  TM search 'handleRequest': ${result.length} result(s)`);
  });

  test("searchTM returns empty for non-existent term", async () => {
    const result = await searchTM("xyznonexistent12345", "default", 10);
    expect(result.length).toBe(0);
  });

  test("addToTM creates new entry", async () => {
    const uniqueSource = `test_source_${Date.now()}`;
    const result = await addToTM(uniqueSource, "test target value", "default", "test context");
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
    testEntryId = result.id!;
    // Verify the entry exists
    const entries = await getTMEntries("default", 100);
    const created = entries.entries.find((e) => e.id === testEntryId);
    expect(created).toBeDefined();
    expect(created!.source_text).toBe(uniqueSource);
    console.log(`  TM add: created entry ${testEntryId}`);
  });

  test("addToTM increments usage_count on duplicate", async () => {
    if (!testEntryId) return;
    const entries1 = await getTMEntries("default", 100);
    const before = entries1.entries.find((e) => e.id === testEntryId);
    const countBefore = before ? Number(before.usage_count) : 0;

    // Add same source+target again
    const entry = entries1.entries.find((e) => e.id === testEntryId);
    if (entry) {
      await addToTM(entry.source_text, entry.target_text, "default");
    }

    const entries2 = await getTMEntries("default", 100);
    const after = entries2.entries.find((e) => e.id === testEntryId);
    expect(Number(after!.usage_count)).toBe(countBefore + 1);
    console.log(`  TM duplicate: usage_count ${countBefore} -> ${countBefore + 1}`);
  });

  test("deleteTMEntry removes the test entry", async () => {
    if (!testEntryId) return;
    const result = await deleteTMEntry(testEntryId);
    expect(result.success).toBe(true);

    const entries = await getTMEntries("default", 100);
    const deleted = entries.entries.find((e) => e.id === testEntryId);
    expect(deleted).toBeUndefined();
    console.log(`  TM delete: entry ${testEntryId} removed`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Terminology Base
// ═══════════════════════════════════════════════════════════════════════

describe("Terminology Base", () => {
  let testTermId: string | null = null;

  test("listTBBanks returns banks with counts", async () => {
    const banks = await listTBBanks();
    expect(Array.isArray(banks)).toBe(true);
    expect(banks.length).toBeGreaterThan(0);
    const defaultBank = banks.find((b) => b.name === "default");
    expect(defaultBank).toBeDefined();
    expect(Number(defaultBank!.entry_count)).toBeGreaterThan(0);
    console.log(`  TB banks: ${banks.map((b) => `${b.name}(${b.entry_count})`).join(", ")}`);
  });

  test("getTBEntries returns seeded terms", async () => {
    const result = await getTBEntries("default", 50);
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);

    const entry = result.entries[0];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("source_term");
    expect(entry).toHaveProperty("target_term");
    expect(entry).toHaveProperty("domain");
    console.log(`  TB entries: ${result.total} total, first: "${entry.source_term}" -> "${entry.target_term}"`);
  });

  test("searchTB finds terms by prefix", async () => {
    const result = await searchTB("validate", "default");
    expect(result.length).toBeGreaterThan(0);
    const match = result.find((e) => e.source_term.toLowerCase().includes("validate"));
    expect(match).toBeDefined();
    console.log(`  TB search 'validate': ${result.length} result(s)`);
  });

  test("searchTB finds forbidden terms", async () => {
    const result = await searchTB("eval", "default");
    expect(result.length).toBeGreaterThan(0);
    const forbidden = result.find((e) => e.forbidden === true);
    expect(forbidden).toBeDefined();
    expect(forbidden!.source_term).toBe("eval()");
    console.log(`  TB forbidden: found "${forbidden!.source_term}" marked as forbidden`);
  });

  test("searchTB returns empty for non-existent term", async () => {
    const result = await searchTB("xyznonexistent12345", "default");
    expect(result.length).toBe(0);
  });

  test("addTBEntry creates new term", async () => {
    const uniqueSource = `testTerm_${Date.now()}`;
    const result = await addTBEntry(uniqueSource, "testTarget", "default", "test def", "testing", false);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
    testTermId = result.id!;
    // Verify the entry exists
    const entries = await getTBEntries("default", 100);
    const created = entries.entries.find((e) => e.id === testTermId);
    expect(created).toBeDefined();
    expect(created!.source_term).toBe(uniqueSource);
    console.log(`  TB add: created term ${testTermId}`);
  });

  test("deleteTBEntry removes the test term", async () => {
    if (!testTermId) return;
    const result = await deleteTBEntry(testTermId);
    expect(result.success).toBe(true);

    const entries = await getTBEntries("default", 100);
    const deleted = entries.entries.find((e) => e.id === testTermId);
    expect(deleted).toBeUndefined();
    console.log(`  TB delete: term ${testTermId} removed`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Project Files (cross-database: gateway + ingestion)
// ═══════════════════════════════════════════════════════════════════════

describe("Project Files", () => {
  let projectId: string | null = null;
  let snapshotId: string | null = null;
  let fileId: string | null = null;

  test("listProjects returns seeded projects", async () => {
    const result = await listProjects();
    expect(result.error).toBeUndefined();
    expect(result.projects.length).toBeGreaterThan(0);

    const authProject = result.projects.find((p) => p.name === "Auth Service");
    expect(authProject).toBeDefined();
    expect(Number(authProject!.repo_count)).toBeGreaterThan(0);
    projectId = authProject!.id;
    console.log(`  Projects: ${result.projects.length}, Auth Service repos: ${authProject!.repo_count}`);
  });

  test("listSnapshots returns ready snapshots for project", async () => {
    if (!projectId) return;
    const result = await listSnapshots(projectId);
    expect(result.error).toBeUndefined();
    expect(result.snapshots.length).toBeGreaterThan(0);

    const snap = result.snapshots[0];
    expect(snap.status).toBe("ready");
    expect(Number(snap.file_count)).toBeGreaterThan(0);
    snapshotId = snap.id;
    console.log(`  Snapshots: ${result.snapshots.length}, first: ${snap.commit_sha.slice(0, 8)} (${snap.file_count} files)`);
  });

  test("listFiles returns non-binary files in snapshot", async () => {
    if (!snapshotId) return;
    const result = await listFiles(snapshotId);
    expect(result.error).toBeUndefined();
    expect(result.files.length).toBeGreaterThan(0);

    const tsFile = result.files.find((f) => f.path.endsWith(".ts"));
    expect(tsFile).toBeDefined();
    expect(tsFile!.is_binary).toBe(false);
    fileId = tsFile!.id;
    console.log(`  Files: ${result.files.length}, paths: ${result.files.map((f) => f.path).join(", ")}`);
  });

  test("getFileContent returns actual file content", async () => {
    if (!fileId) return;
    const result = await getFileContent(fileId);
    expect(result.error).toBeUndefined();
    expect(result.file).toBeDefined();
    expect(result.file!.content_text).toBeTruthy();
    expect(result.file!.content_text!.length).toBeGreaterThan(0);
    console.log(`  File content: ${result.file!.path} (${result.file!.content_text!.length} chars)`);
  });

  test("getFileContent returns error for non-existent file", async () => {
    const result = await getFileContent("00000000-0000-0000-0000-000000000000");
    expect(result.file).toBeNull();
  });

  test("getFilesContent returns batch of files", async () => {
    if (!snapshotId) return;
    const filesResult = await listFiles(snapshotId);
    const ids = filesResult.files.slice(0, 3).map((f) => f.id);
    const result = await getFilesContent(ids);
    expect(result.error).toBeUndefined();
    expect(result.files.length).toBe(ids.length);
    console.log(`  Batch: ${result.files.length} files fetched`);
  });

  test("getFilesContent handles empty array", async () => {
    const result = await getFilesContent([]);
    expect(result.files.length).toBe(0);
  });

  test("listSnapshots returns empty for non-existent project", async () => {
    const result = await listSnapshots("00000000-0000-0000-0000-000000000000");
    expect(result.snapshots.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// pgvector Extension (via review-db)
// ═══════════════════════════════════════════════════════════════════════

describe("pgvector Extension", () => {

  beforeAll(async () => {
    await reviewQuery(`
      CREATE TABLE IF NOT EXISTS test_embeddings (
        id serial PRIMARY KEY,
        label text NOT NULL,
        embedding vector(4)
      )
    `);
    await reviewQuery(`DELETE FROM test_embeddings`);
    await reviewQuery(`
      INSERT INTO test_embeddings (label, embedding) VALUES
        ('cat',    '[0.1, 0.2, 0.3, 0.4]'),
        ('kitten', '[0.12, 0.22, 0.28, 0.42]'),
        ('dog',    '[0.8, 0.7, 0.6, 0.5]'),
        ('car',    '[0.9, 0.1, 0.9, 0.1]')
    `);
  });

  afterAll(async () => {
    await reviewQuery(`DROP TABLE IF EXISTS test_embeddings`);
  });

  test("L2 distance search returns closest vectors", async () => {
    const result = await reviewQuery(`
      SELECT label, embedding <-> '[0.1, 0.2, 0.3, 0.4]' AS distance
      FROM test_embeddings
      ORDER BY embedding <-> '[0.1, 0.2, 0.3, 0.4]'
      LIMIT 2
    `);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].label).toBe("cat");       // exact match
    expect(result.rows[1].label).toBe("kitten");     // closest
    expect(parseFloat(result.rows[0].distance)).toBe(0);
    expect(parseFloat(result.rows[1].distance)).toBeGreaterThan(0);
    console.log(`  pgvector L2: closest to 'cat' is '${result.rows[1].label}' (dist=${parseFloat(result.rows[1].distance).toFixed(4)})`);
  });

  test("Cosine distance search works", async () => {
    const result = await reviewQuery(`
      SELECT label, 1 - (embedding <=> '[0.1, 0.2, 0.3, 0.4]') AS cosine_similarity
      FROM test_embeddings
      ORDER BY embedding <=> '[0.1, 0.2, 0.3, 0.4]'
      LIMIT 2
    `);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].label).toBe("cat");
    expect(parseFloat(result.rows[0].cosine_similarity)).toBeCloseTo(1.0, 4);
    console.log(`  pgvector cosine: 'cat' similarity=${parseFloat(result.rows[0].cosine_similarity).toFixed(4)}`);
  });

  test("Inner product search works", async () => {
    const result = await reviewQuery(`
      SELECT label, (embedding <#> '[0.1, 0.2, 0.3, 0.4]') AS neg_inner_product
      FROM test_embeddings
      ORDER BY embedding <#> '[0.1, 0.2, 0.3, 0.4]'
      LIMIT 1
    `);
    expect(result.rows.length).toBe(1);
    // The entry with largest inner product should come first (most negative of negative IP)
    console.log(`  pgvector IP: top='${result.rows[0].label}' neg_ip=${result.rows[0].neg_inner_product}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Apache AGE Extension (graph queries via review-db)
// ═══════════════════════════════════════════════════════════════════════

describe("Apache AGE Extension", () => {
  // AGE requires LOAD and SET on the same connection, so use a dedicated client
  let client: PoolClient;

  async function ageQuery(sql: string) {
    return client.query(sql);
  }

  beforeAll(async () => {
    client = await reviewPool.connect();
    await client.query(`LOAD 'age'`);
    await client.query(`SET search_path = ag_catalog, public`);
    // Clean up any previous test graph
    try {
      await client.query(`SELECT drop_graph('ut_test_graph', true)`);
    } catch { /* ignore if doesn't exist */ }
    await client.query(`SELECT create_graph('ut_test_graph')`);
  });

  afterAll(async () => {
    try {
      await client.query(`SELECT drop_graph('ut_test_graph', true)`);
    } catch { /* ignore cleanup errors */ }
    client.release();
  });

  test("Create graph nodes and edges", async () => {
    const result = await ageQuery(`
      SELECT * FROM cypher('ut_test_graph', $$
        CREATE (a:File {path: 'handler.ts', lang: 'typescript'})
               -[:IMPORTS]->
               (b:File {path: 'validator.ts', lang: 'typescript'})
        CREATE (a)-[:IMPORTS]->(c:File {path: 'config.json', lang: 'json'})
        CREATE (b)-[:IMPORTS]->(d:File {path: 'crypto.ts', lang: 'typescript'})
        RETURN count(*)
      $$) AS (count agtype)
    `);
    expect(result.rows.length).toBe(1);
    console.log(`  AGE create: nodes and edges created`);
  });

  test("Query graph: find direct imports", async () => {
    const result = await ageQuery(`
      SELECT * FROM cypher('ut_test_graph', $$
        MATCH (a:File {path: 'handler.ts'})-[:IMPORTS]->(dep)
        RETURN dep.path AS imported_file
      $$) AS (imported_file agtype)
    `);
    expect(result.rows.length).toBe(2);
    const paths = result.rows.map((r: any) => JSON.parse(r.imported_file));
    expect(paths).toContain("validator.ts");
    expect(paths).toContain("config.json");
    console.log(`  AGE query: handler.ts imports ${paths.join(", ")}`);
  });

  test("Query graph: transitive dependencies", async () => {
    const result = await ageQuery(`
      SELECT * FROM cypher('ut_test_graph', $$
        MATCH (a:File {path: 'handler.ts'})-[:IMPORTS*1..3]->(dep)
        RETURN DISTINCT dep.path AS transitive_dep
      $$) AS (transitive_dep agtype)
    `);
    expect(result.rows.length).toBe(3); // validator.ts, config.json, crypto.ts
    const paths = result.rows.map((r: any) => JSON.parse(r.transitive_dep));
    expect(paths).toContain("crypto.ts"); // 2-hop dependency
    console.log(`  AGE transitive: handler.ts -> ${paths.join(", ")}`);
  });
});
