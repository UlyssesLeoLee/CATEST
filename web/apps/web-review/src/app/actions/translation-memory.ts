"use server";

import { reviewQuery } from "@/lib/review-db";
import { requireReader, requireEditor, requireAdmin, getSessionUser } from "@/lib/permissions";

// ── Types ──────────────────────────────────────────────────────────

export interface TMEntry {
  id: string;
  tm_name: string;
  source_text: string;
  target_text: string;
  context: string | null;
  quality_score: number;
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TMBank {
  name: string;
  entry_count: number;
}

// ── Bank Management (Admin only) ───────────────────────────────────

/** Create a new TM bank (admin only) */
export async function createTMBank(
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) {
      return { success: false, error: "Bank name must be 1-100 characters" };
    }
    // Check if bank already has entries (banks are implicit via tm_name)
    const existing = await reviewQuery(
      `SELECT COUNT(*) FROM translation_memory WHERE tm_name = $1`,
      [trimmed]
    );
    if (Number(existing.rows[0].count) > 0) {
      return { success: false, error: "Bank already exists" };
    }
    // Insert a placeholder entry to materialize the bank, then delete it
    // Actually, banks are implicit — just return success, the bank will exist when entries are added
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Rename a TM bank (admin only) */
export async function renameTMBank(
  oldName: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const trimmed = newName.trim();
    if (!trimmed) return { success: false, error: "New name cannot be empty" };
    await reviewQuery(
      `UPDATE translation_memory SET tm_name = $1, updated_at = now() WHERE tm_name = $2`,
      [trimmed, oldName]
    );
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Delete an entire TM bank and all entries (admin only) */
export async function deleteTMBank(
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    await reviewQuery(`DELETE FROM translation_memory WHERE tm_name = $1`, [name]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Read Operations (Any authenticated user) ───────────────────────

/** List all available TM banks */
export async function listTMBanks(): Promise<TMBank[]> {
  try {
    await requireReader();
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
    await requireReader();
    const res = await reviewQuery(
      `SELECT id, tm_name, source_text, target_text, context, quality_score, usage_count, created_by, created_at, updated_at
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

/** Get entries in a TM bank with pagination */
export async function getTMEntries(
  tmName: string = "default",
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: TMEntry[]; total: number }> {
  try {
    await requireReader();
    const countRes = await reviewQuery(
      `SELECT COUNT(*) FROM translation_memory WHERE tm_name = $1`,
      [tmName]
    );
    const res = await reviewQuery(
      `SELECT id, tm_name, source_text, target_text, context, quality_score, usage_count, created_by, created_at, updated_at
       FROM translation_memory WHERE tm_name = $1
       ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
      [tmName, limit, offset]
    );
    return { entries: res.rows, total: Number(countRes.rows[0].count) };
  } catch {
    return { entries: [], total: 0 };
  }
}

// ── Write Operations (Admin or User) ───────────────────────────────

/** Add a verified segment pair to TM */
export async function addToTM(
  sourceText: string,
  targetText: string,
  tmName: string = "default",
  context?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const user = await requireEditor();

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
      `INSERT INTO translation_memory (tm_name, source_text, target_text, context, quality_score, created_by)
       VALUES ($1, $2, $3, $4, 1.0, $5)
       RETURNING id`,
      [tmName, sourceText, targetText, context || null, user.userId]
    );
    return { success: true, id: res.rows[0].id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Update a TM entry (admin only) */
export async function updateTMEntry(
  id: string,
  updates: {
    source_text?: string;
    target_text?: string;
    context?: string;
    quality_score?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.source_text !== undefined) { sets.push(`source_text = $${idx++}`); params.push(updates.source_text); }
    if (updates.target_text !== undefined) { sets.push(`target_text = $${idx++}`); params.push(updates.target_text); }
    if (updates.context !== undefined) { sets.push(`context = $${idx++}`); params.push(updates.context); }
    if (updates.quality_score !== undefined) { sets.push(`quality_score = $${idx++}`); params.push(updates.quality_score); }
    if (sets.length === 0) return { success: true };

    sets.push(`updated_at = now()`);
    params.push(id);

    await reviewQuery(
      `UPDATE translation_memory SET ${sets.join(", ")} WHERE id = $${idx}`,
      params
    );
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Delete a TM entry (admin only) */
export async function deleteTMEntry(id: string): Promise<{ success: boolean }> {
  try {
    await requireAdmin();
    await reviewQuery(`DELETE FROM translation_memory WHERE id = $1`, [id]);
    return { success: true };
  } catch {
    return { success: false };
  }
}

/** Bulk delete TM entries (admin only) */
export async function bulkDeleteTMEntries(
  ids: string[]
): Promise<{ success: boolean; deleted: number }> {
  try {
    await requireAdmin();
    if (ids.length === 0) return { success: true, deleted: 0 };
    const res = await reviewQuery(
      `DELETE FROM translation_memory WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    return { success: true, deleted: res.rowCount ?? 0 };
  } catch {
    return { success: false, deleted: 0 };
  }
}

// ── TMX Import/Export (Industry standard format) ───────────────────

/**
 * Export TM bank as TMX 1.4b XML string.
 * TMX (Translation Memory eXchange) is the standard format used by
 * SDL Trados, memoQ, Memsource, OmegaT, etc.
 */
export async function exportTMX(
  tmName: string = "default"
): Promise<{ success: boolean; tmx?: string; error?: string }> {
  try {
    await requireReader();
    const res = await reviewQuery(
      `SELECT source_text, target_text, context, quality_score, usage_count, created_at, updated_at
       FROM translation_memory WHERE tm_name = $1 ORDER BY created_at`,
      [tmName]
    );

    const escXml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const tus = res.rows
      .map(
        (r: any) =>
          `    <tu creationdate="${fmtTmxDate(r.created_at)}" changedate="${fmtTmxDate(r.updated_at)}">
      <prop type="x-context">${escXml(r.context || "")}</prop>
      <prop type="x-quality-score">${r.quality_score}</prop>
      <prop type="x-usage-count">${r.usage_count}</prop>
      <tuv xml:lang="en">
        <seg>${escXml(r.source_text)}</seg>
      </tuv>
      <tuv xml:lang="zh">
        <seg>${escXml(r.target_text)}</seg>
      </tuv>
    </tu>`
      )
      .join("\n");

    const tmx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tmx SYSTEM "tmx14.dtd">
<tmx version="1.4">
  <header
    creationtool="CATEST"
    creationtoolversion="1.0"
    datatype="plaintext"
    segtype="sentence"
    adminlang="en"
    srclang="en"
    o-tmf="CATEST-TM"
  />
  <body>
${tus}
  </body>
</tmx>`;

    return { success: true, tmx };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Import TMX content into a TM bank (admin only).
 * Parses TMX XML and inserts/updates entries.
 */
export async function importTMX(
  tmName: string,
  tmxContent: string
): Promise<{ success: boolean; imported: number; skipped: number; error?: string }> {
  try {
    const user = await requireAdmin();
    const entries = parseTmxContent(tmxContent);
    let imported = 0;
    let skipped = 0;

    for (const entry of entries) {
      if (!entry.source || !entry.target) { skipped++; continue; }

      // Upsert: skip if exact duplicate exists
      const existing = await reviewQuery(
        `SELECT id FROM translation_memory
         WHERE tm_name = $1 AND source_text = $2 AND target_text = $3`,
        [tmName, entry.source, entry.target]
      );

      if (existing.rowCount && existing.rowCount > 0) {
        // Update usage count
        await reviewQuery(
          `UPDATE translation_memory SET usage_count = usage_count + 1, updated_at = now() WHERE id = $1`,
          [existing.rows[0].id]
        );
        skipped++;
      } else {
        await reviewQuery(
          `INSERT INTO translation_memory (tm_name, source_text, target_text, context, quality_score, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            tmName,
            entry.source,
            entry.target,
            entry.context || null,
            entry.qualityScore ?? 1.0,
            user.userId,
          ]
        );
        imported++;
      }
    }

    return { success: true, imported, skipped };
  } catch (err: any) {
    return { success: false, imported: 0, skipped: 0, error: err.message };
  }
}

/**
 * Import tab-separated text into TM (admin only).
 * Format: source\ttarget[\tcontext] per line.
 */
export async function importTMFromTSV(
  tmName: string,
  tsvContent: string
): Promise<{ success: boolean; imported: number; skipped: number; error?: string }> {
  try {
    const user = await requireAdmin();
    const lines = tsvContent.split("\n").filter((l) => l.trim());
    let imported = 0;
    let skipped = 0;

    for (const line of lines) {
      const parts = line.split("\t");
      const source = parts[0]?.trim();
      const target = parts[1]?.trim();
      const context = parts[2]?.trim() || null;

      if (!source || !target) { skipped++; continue; }

      const existing = await reviewQuery(
        `SELECT id FROM translation_memory WHERE tm_name = $1 AND source_text = $2 AND target_text = $3`,
        [tmName, source, target]
      );

      if (existing.rowCount && existing.rowCount > 0) {
        skipped++;
      } else {
        await reviewQuery(
          `INSERT INTO translation_memory (tm_name, source_text, target_text, context, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [tmName, source, target, context, user.userId]
        );
        imported++;
      }
    }

    return { success: true, imported, skipped };
  } catch (err: any) {
    return { success: false, imported: 0, skipped: 0, error: err.message };
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function fmtTmxDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

/** Minimal TMX parser — extracts <tu> entries with <tuv> segments. */
function parseTmxContent(
  tmx: string
): { source: string; target: string; context?: string; qualityScore?: number }[] {
  const entries: { source: string; target: string; context?: string; qualityScore?: number }[] = [];

  // Split by <tu> blocks
  const tuBlocks = tmx.split(/<tu[^>]*>/i).slice(1);

  for (const block of tuBlocks) {
    const tuContent = block.split(/<\/tu>/i)[0] || "";

    // Extract context prop
    const ctxMatch = tuContent.match(/<prop\s+type="x-context">([\s\S]*?)<\/prop>/i);
    const context = ctxMatch ? unescXml(ctxMatch[1].trim()) : undefined;

    // Extract quality score prop
    const qsMatch = tuContent.match(/<prop\s+type="x-quality-score">([\s\S]*?)<\/prop>/i);
    const qualityScore = qsMatch ? parseFloat(qsMatch[1]) : undefined;

    // Extract <tuv> segments — first is source, second is target
    const segMatches = [...tuContent.matchAll(/<seg>([\s\S]*?)<\/seg>/gi)];
    if (segMatches.length >= 2) {
      entries.push({
        source: unescXml(segMatches[0][1].trim()),
        target: unescXml(segMatches[1][1].trim()),
        context: context || undefined,
        qualityScore: isNaN(qualityScore ?? NaN) ? undefined : qualityScore,
      });
    }
  }

  return entries;
}

function unescXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}
