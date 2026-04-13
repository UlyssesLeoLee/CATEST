/**
 * Memgraph operations for Terminology Base graph layer.
 *
 * Graph model:
 *   (:Term {id, source_term, target_term, forbidden, tb_name})
 *   (:Domain {name})
 *   (:Term)-[:IN_DOMAIN]->(:Domain)
 *
 * PostgreSQL remains the source of truth — Memgraph enables relationship queries.
 * All operations degrade gracefully: errors are logged and never throw to callers.
 *
 * Uses the neo4j-driver npm package which is Bolt-compatible with Memgraph.
 */

import neo4j, { type Driver, type Session } from "neo4j-driver";

let _driver: Driver | null = null;

function getDriver(): Driver {
  if (!_driver) {
    _driver = neo4j.driver(
      process.env.MEMGRAPH_URI ?? "bolt://localhost:37687",
      neo4j.auth.basic(
        process.env.MEMGRAPH_USER ?? "memgraph",
        process.env.MEMGRAPH_PASSWORD ?? "memgraph",
      ),
      { maxConnectionLifetime: 3 * 60 * 1000, connectionAcquisitionTimeout: 5000 },
    );
  }
  return _driver;
}

async function withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

// ── Schema bootstrap ──────────────────────────────────────────────────

let _schemaReady = false;

export async function ensureTBSchema(): Promise<void> {
  if (_schemaReady) return;
  await withSession(async (s) => {
    await s.run(
      "CREATE CONSTRAINT term_id IF NOT EXISTS FOR (t:Term) REQUIRE t.id IS UNIQUE",
    );
    await s.run(
      "CREATE CONSTRAINT domain_name IF NOT EXISTS FOR (d:Domain) REQUIRE d.name IS UNIQUE",
    );
  });
  _schemaReady = true;
}

// ── Write ─────────────────────────────────────────────────────────────

export interface TBGraphEntry {
  id: string;
  source_term: string;
  target_term: string;
  domain: string | null;
  forbidden: boolean;
  tb_name: string;
}

export async function upsertTBNode(entry: TBGraphEntry): Promise<void> {
  await ensureTBSchema();
  await withSession(async (s) => {
    await s.run(
      `MERGE (t:Term {id: $id})
       SET t.source_term = $source_term,
           t.target_term = $target_term,
           t.forbidden   = $forbidden,
           t.tb_name     = $tb_name
       WITH t
       FOREACH (_ IN CASE WHEN $domain IS NOT NULL THEN [1] ELSE [] END |
         MERGE (d:Domain {name: $domain})
         MERGE (t)-[:IN_DOMAIN]->(d)
       )`,
      {
        id: entry.id,
        source_term: entry.source_term,
        target_term: entry.target_term,
        forbidden: entry.forbidden,
        tb_name: entry.tb_name,
        domain: entry.domain,
      },
    );
  });
}

export async function deleteTBNode(id: string): Promise<void> {
  try {
    await withSession(async (s) => {
      await s.run("MATCH (t:Term {id: $id}) DETACH DELETE t", { id });
    });
  } catch (e) {
    console.warn("[Memgraph/TB] delete failed:", (e as Error).message);
  }
}

// ── Query ─────────────────────────────────────────────────────────────

export interface RelatedTerm {
  id: string;
  source_term: string;
  target_term: string;
  forbidden: boolean;
  domain: string | null;
  relation: string;
}

/** All terms in the same domain(s) as the given term. */
export async function findTermNeighbors(
  sourceTerm: string,
  tbName: string = "default",
  limit: number = 15,
): Promise<RelatedTerm[]> {
  return withSession(async (s) => {
    const result = await s.run(
      `MATCH (t:Term {source_term: $sourceTerm, tb_name: $tbName})-[:IN_DOMAIN]->(d:Domain)<-[:IN_DOMAIN]-(other:Term)
       WHERE other.id <> t.id
       RETURN other.id AS id,
              other.source_term AS source_term,
              other.target_term AS target_term,
              other.forbidden   AS forbidden,
              d.name            AS domain,
              'SAME_DOMAIN'     AS relation
       LIMIT $limit`,
      { sourceTerm, tbName, limit: neo4j.int(limit) },
    );
    return result.records.map((r) => ({
      id: r.get("id") as string,
      source_term: r.get("source_term") as string,
      target_term: r.get("target_term") as string,
      forbidden: r.get("forbidden") as boolean,
      domain: r.get("domain") as string | null,
      relation: r.get("relation") as string,
    }));
  });
}

/** All terms in a given domain. */
export async function getTermsByDomain(
  domain: string,
  tbName: string = "default",
  limit: number = 30,
): Promise<RelatedTerm[]> {
  return withSession(async (s) => {
    const result = await s.run(
      `MATCH (t:Term)-[:IN_DOMAIN]->(d:Domain {name: $domain})
       WHERE t.tb_name = $tbName
       RETURN t.id AS id,
              t.source_term AS source_term,
              t.target_term AS target_term,
              t.forbidden   AS forbidden,
              d.name        AS domain,
              'IN_DOMAIN'   AS relation
       LIMIT $limit`,
      { domain, tbName, limit: neo4j.int(limit) },
    );
    return result.records.map((r) => ({
      id: r.get("id") as string,
      source_term: r.get("source_term") as string,
      target_term: r.get("target_term") as string,
      forbidden: r.get("forbidden") as boolean,
      domain: r.get("domain") as string | null,
      relation: r.get("relation") as string,
    }));
  });
}

/** All distinct domains across all TB banks. */
export async function listDomains(tbName?: string): Promise<string[]> {
  return withSession(async (s) => {
    const query = tbName
      ? `MATCH (t:Term {tb_name: $tbName})-[:IN_DOMAIN]->(d:Domain) RETURN DISTINCT d.name AS name ORDER BY name`
      : `MATCH (:Term)-[:IN_DOMAIN]->(d:Domain) RETURN DISTINCT d.name AS name ORDER BY name`;
    const result = await s.run(query, tbName ? { tbName } : {});
    return result.records.map((r) => r.get("name") as string);
  });
}
