"use server";

import { reviewQuery } from "@/lib/review-db";

export interface TMEntry {
  id: string;
  tm_name: string;
  source_text: string;
  target_text: string;
  context: string | null;
  quality_score: number;
  usage_count: number;
  created_at: string;
}

export interface TMBank {
  name: string;
  entry_count: number;
}

/** List all available TM banks */
export async function listTMBanks(): Promise<TMBank[]> {
  try {
    const res = await reviewQuery(
      `SELECT tm_name AS name, COUNT(*) AS entry_count
       FROM translation_memory GROUP BY tm_name ORDER BY tm_name`
    );
    return res.rows.map((r: any) => ({ name: r.name, entry_count: Number(r.entry_count) }));
  } catch {
    return [{ name: "default", entry_count: 0 }];
  }
}

/** Search TM for fuzzy matches against a source string */
export async function searchTM(
  sourceText: string,
  tmName: string = "default",
  limit: number = 5
): Promise<TMEntry[]> {
  try {
    // Use trigram-like matching via ts_rank for fuzzy search
    const res = await reviewQuery(
      `SELECT id, tm_name, source_text, target_text, context, quality_score, usage_count, created_at
       FROM translation_memory
       WHERE tm_name = $1
         AND to_tsvector('simple', source_text) @@ plainto_tsquery('simple', $2)
       ORDER BY ts_rank(to_tsvector('simple', source_text), plainto_tsquery('simple', $2)) DESC,
                quality_score DESC
       LIMIT $3`,
      [tmName, sourceText, limit]
    );
    return res.rows;
  } catch {
    return [];
  }
}

/** Add a verified segment pair to TM (called when user confirms with Ctrl+Enter) */
export async function addToTM(
  sourceText: string,
  targetText: string,
  tmName: string = "default",
  context?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Check if exact match already exists — increment usage_count instead
    const existing = await reviewQuery(
      `SELECT id, usage_count FROM translation_memory
       WHERE tm_name = $1 AND source_text = $2 AND target_text = $3`,
      [tmName, sourceText, targetText]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      await reviewQuery(
        `UPDATE translation_memory SET usage_count = usage_count + 1, updated_at = now()
         WHERE id = $1`,
        [existing.rows[0].id]
      );
      return { success: true, id: existing.rows[0].id };
    }

    const res = await reviewQuery(
      `INSERT INTO translation_memory (tm_name, source_text, target_text, context, quality_score)
       VALUES ($1, $2, $3, $4, 1.0)
       RETURNING id`,
      [tmName, sourceText, targetText, context || null]
    );
    return { success: true, id: res.rows[0].id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Delete a TM entry */
export async function deleteTMEntry(id: string): Promise<{ success: boolean }> {
  try {
    await reviewQuery(`DELETE FROM translation_memory WHERE id = $1`, [id]);
    return { success: true };
  } catch {
    return { success: false };
  }
}

/** Get all entries in a TM bank */
export async function getTMEntries(
  tmName: string = "default",
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: TMEntry[]; total: number }> {
  try {
    const countRes = await reviewQuery(
      `SELECT COUNT(*) FROM translation_memory WHERE tm_name = $1`,
      [tmName]
    );
    const res = await reviewQuery(
      `SELECT id, tm_name, source_text, target_text, context, quality_score, usage_count, created_at
       FROM translation_memory WHERE tm_name = $1
       ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
      [tmName, limit, offset]
    );
    return { entries: res.rows, total: Number(countRes.rows[0].count) };
  } catch {
    return { entries: [], total: 0 };
  }
}
