"use server";

import { reviewQuery } from "@/lib/review-db";

export interface TBEntry {
  id: string;
  tb_name: string;
  source_term: string;
  target_term: string;
  definition: string | null;
  domain: string | null;
  forbidden: boolean;
  created_at: string;
}

export interface TBBank {
  name: string;
  entry_count: number;
}

/** List all available TB banks */
export async function listTBBanks(): Promise<TBBank[]> {
  try {
    const res = await reviewQuery(
      `SELECT tb_name AS name, COUNT(*) AS entry_count
       FROM terminology_base GROUP BY tb_name ORDER BY tb_name`
    );
    return res.rows.map((r: any) => ({ name: r.name, entry_count: Number(r.entry_count) }));
  } catch {
    return [{ name: "default", entry_count: 0 }];
  }
}

/** Search TB for term matches */
export async function searchTB(
  term: string,
  tbName: string = "default"
): Promise<TBEntry[]> {
  try {
    const res = await reviewQuery(
      `SELECT id, tb_name, source_term, target_term, definition, domain, forbidden, created_at
       FROM terminology_base
       WHERE tb_name = $1
         AND (source_term ILIKE '%' || $2 || '%' OR target_term ILIKE '%' || $2 || '%')
       ORDER BY
         CASE WHEN source_term ILIKE $2 THEN 0
              WHEN source_term ILIKE $2 || '%' THEN 1
              ELSE 2 END,
         source_term
       LIMIT 20`,
      [tbName, term]
    );
    return res.rows;
  } catch {
    return [];
  }
}

/** Add a new term to TB */
export async function addTBEntry(
  sourceTerm: string,
  targetTerm: string,
  tbName: string = "default",
  definition?: string,
  domain?: string,
  forbidden: boolean = false
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Check duplicate
    const existing = await reviewQuery(
      `SELECT id FROM terminology_base
       WHERE tb_name = $1 AND source_term = $2 AND target_term = $3`,
      [tbName, sourceTerm, targetTerm]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return { success: false, error: "Term already exists" };
    }

    const res = await reviewQuery(
      `INSERT INTO terminology_base (tb_name, source_term, target_term, definition, domain, forbidden)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tbName, sourceTerm, targetTerm, definition || null, domain || null, forbidden]
    );
    return { success: true, id: res.rows[0].id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Update a TB entry */
export async function updateTBEntry(
  id: string,
  updates: { source_term?: string; target_term?: string; definition?: string; domain?: string; forbidden?: boolean }
): Promise<{ success: boolean }> {
  try {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.source_term !== undefined) { sets.push(`source_term = $${idx++}`); params.push(updates.source_term); }
    if (updates.target_term !== undefined) { sets.push(`target_term = $${idx++}`); params.push(updates.target_term); }
    if (updates.definition !== undefined) { sets.push(`definition = $${idx++}`); params.push(updates.definition); }
    if (updates.domain !== undefined) { sets.push(`domain = $${idx++}`); params.push(updates.domain); }
    if (updates.forbidden !== undefined) { sets.push(`forbidden = $${idx++}`); params.push(updates.forbidden); }
    sets.push(`updated_at = now()`);
    params.push(id);

    await reviewQuery(`UPDATE terminology_base SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    return { success: true };
  } catch {
    return { success: false };
  }
}

/** Delete a TB entry */
export async function deleteTBEntry(id: string): Promise<{ success: boolean }> {
  try {
    await reviewQuery(`DELETE FROM terminology_base WHERE id = $1`, [id]);
    return { success: true };
  } catch {
    return { success: false };
  }
}

/** Get all entries in a TB bank */
export async function getTBEntries(
  tbName: string = "default",
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: TBEntry[]; total: number }> {
  try {
    const countRes = await reviewQuery(
      `SELECT COUNT(*) FROM terminology_base WHERE tb_name = $1`,
      [tbName]
    );
    const res = await reviewQuery(
      `SELECT id, tb_name, source_term, target_term, definition, domain, forbidden, created_at
       FROM terminology_base WHERE tb_name = $1
       ORDER BY source_term LIMIT $2 OFFSET $3`,
      [tbName, limit, offset]
    );
    return { entries: res.rows, total: Number(countRes.rows[0].count) };
  } catch {
    return { entries: [], total: 0 };
  }
}
