"use server";

import { tmQuery } from "@/lib/db";
import { requireAuth, requireAdmin, requireEditor, getSessionUser } from "@/lib/permissions";

// ── Types ──────────────────────────────────────────────────────────

export interface TMBank {
  id: string;
  name: string;
  description: string | null;
  source_lang: string;
  target_lang: string;
  entry_count: number;
  created_at: string;
}

export interface TMEntry {
  id: string;
  bank_id: string;
  source_text: string;
  target_text: string;
  context: string | null;
  quality_score: number;
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Bank Management ────────────────────────────────────────────────

export async function listBanks(): Promise<TMBank[]> {
  await requireAuth();
  const res = await tmQuery(
    `SELECT b.id, b.name, b.description, b.source_lang, b.target_lang, b.created_at,
            COALESCE(c.cnt, 0) AS entry_count
     FROM tm_banks b
     LEFT JOIN (SELECT bank_id, COUNT(*) AS cnt FROM tm_entries GROUP BY bank_id) c ON c.bank_id = b.id
     ORDER BY b.name`
  );
  return res.rows;
}

export async function createBank(
  name: string, description?: string, sourceLang?: string, targetLang?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    await requireAdmin();
    const trimmed = name.trim();
    if (!trimmed) return { success: false, error: "Bank name required" };
    const res = await tmQuery(
      `INSERT INTO tm_banks (name, description, source_lang, target_lang)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [trimmed, description || null, sourceLang || "en", targetLang || "zh"]
    );
    return { success: true, id: res.rows[0].id };
  } catch (err: any) {
    if (err.code === "23505") return { success: false, error: "Bank name already exists" };
    return { success: false, error: err.message };
  }
}

export async function updateBank(
  id: string, updates: { name?: string; description?: string; source_lang?: string; target_lang?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (updates.name !== undefined) { sets.push(`name = $${idx++}`); params.push(updates.name.trim()); }
    if (updates.description !== undefined) { sets.push(`description = $${idx++}`); params.push(updates.description); }
    if (updates.source_lang !== undefined) { sets.push(`source_lang = $${idx++}`); params.push(updates.source_lang); }
    if (updates.target_lang !== undefined) { sets.push(`target_lang = $${idx++}`); params.push(updates.target_lang); }
    if (sets.length === 0) return { success: true };
    sets.push(`updated_at = now()`);
    params.push(id);
    await tmQuery(`UPDATE tm_banks SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteBank(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    await tmQuery(`DELETE FROM tm_banks WHERE id = $1`, [id]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Entry CRUD ─────────────────────────────────────────────────────

export async function getEntries(
  bankId: string, limit = 50, offset = 0, search?: string
): Promise<{ entries: TMEntry[]; total: number }> {
  await requireAuth();
  const whereSearch = search
    ? `AND (to_tsvector('simple', source_text) @@ plainto_tsquery('simple', $4) OR to_tsvector('simple', target_text) @@ plainto_tsquery('simple', $4))`
    : "";
  const params: unknown[] = [bankId, limit, offset];
  if (search) params.push(search);

  const countRes = await tmQuery(
    `SELECT COUNT(*) FROM tm_entries WHERE bank_id = $1 ${whereSearch}`,
    search ? [bankId, search] : [bankId]
  );
  const res = await tmQuery(
    `SELECT id, bank_id, source_text, target_text, context, quality_score, usage_count, created_by, created_at, updated_at
     FROM tm_entries WHERE bank_id = $1 ${whereSearch}
     ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
    params
  );
  return { entries: res.rows, total: Number(countRes.rows[0].count) };
}

export async function searchEntries(
  bankId: string, sourceText: string, limit = 10
): Promise<TMEntry[]> {
  await requireAuth();
  const res = await tmQuery(
    `SELECT id, bank_id, source_text, target_text, context, quality_score, usage_count, created_by, created_at, updated_at
     FROM tm_entries
     WHERE bank_id = $1
       AND to_tsvector('simple', source_text) @@ plainto_tsquery('simple', $2)
     ORDER BY ts_rank(to_tsvector('simple', source_text), plainto_tsquery('simple', $2)) DESC,
              quality_score DESC
     LIMIT $3`,
    [bankId, sourceText, limit]
  );
  return res.rows;
}

export async function addEntry(
  bankId: string, sourceText: string, targetText: string, context?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const user = await requireEditor();
    // Deduplicate: if same source+target exists, increment usage
    const existing = await tmQuery(
      `SELECT id FROM tm_entries WHERE bank_id = $1 AND source_text = $2 AND target_text = $3`,
      [bankId, sourceText, targetText]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await tmQuery(
        `UPDATE tm_entries SET usage_count = usage_count + 1, updated_at = now() WHERE id = $1`,
        [existing.rows[0].id]
      );
      return { success: true, id: existing.rows[0].id };
    }
    const res = await tmQuery(
      `INSERT INTO tm_entries (bank_id, source_text, target_text, context, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [bankId, sourceText, targetText, context || null, user.userId]
    );
    return { success: true, id: res.rows[0].id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateEntry(
  id: string,
  updates: { source_text?: string; target_text?: string; context?: string; quality_score?: number }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAdmin();
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (updates.source_text !== undefined) { sets.push(`source_text = $${idx++}`); params.push(updates.source_text); }
    if (updates.target_text !== undefined) { sets.push(`target_text = $${idx++}`); params.push(updates.target_text); }
    if (updates.context !== undefined) { sets.push(`context = $${idx++}`); params.push(updates.context); }
    if (updates.quality_score !== undefined) { sets.push(`quality_score = $${idx++}`); params.push(updates.quality_score); }
    if (sets.length === 0) return { success: true };
    sets.push(`updated_by = $${idx++}`);
    params.push(user.userId);
    sets.push(`updated_at = now()`);
    params.push(id);
    await tmQuery(`UPDATE tm_entries SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteEntry(id: string): Promise<{ success: boolean }> {
  try {
    await requireAdmin();
    await tmQuery(`DELETE FROM tm_entries WHERE id = $1`, [id]);
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function bulkDeleteEntries(ids: string[]): Promise<{ success: boolean; deleted: number }> {
  try {
    await requireAdmin();
    if (ids.length === 0) return { success: true, deleted: 0 };
    const res = await tmQuery(`DELETE FROM tm_entries WHERE id = ANY($1::uuid[])`, [ids]);
    return { success: true, deleted: res.rowCount ?? 0 };
  } catch {
    return { success: false, deleted: 0 };
  }
}

// ── TMX Import/Export ──────────────────────────────────────────────

export async function exportTMX(bankId: string): Promise<{ success: boolean; tmx?: string; bankName?: string; error?: string }> {
  try {
    await requireAuth();
    const bankRes = await tmQuery(`SELECT name, source_lang, target_lang FROM tm_banks WHERE id = $1`, [bankId]);
    if (!bankRes.rows[0]) return { success: false, error: "Bank not found" };
    const bank = bankRes.rows[0];

    const res = await tmQuery(
      `SELECT source_text, target_text, context, quality_score, usage_count, created_at, updated_at
       FROM tm_entries WHERE bank_id = $1 ORDER BY created_at`,
      [bankId]
    );

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const fmtDate = (d: string) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

    const tus = res.rows.map((r: any) =>
      `    <tu creationdate="${fmtDate(r.created_at)}" changedate="${fmtDate(r.updated_at)}">
      <prop type="x-context">${esc(r.context || "")}</prop>
      <prop type="x-quality-score">${r.quality_score}</prop>
      <prop type="x-usage-count">${r.usage_count}</prop>
      <tuv xml:lang="${bank.source_lang}">
        <seg>${esc(r.source_text)}</seg>
      </tuv>
      <tuv xml:lang="${bank.target_lang}">
        <seg>${esc(r.target_text)}</seg>
      </tuv>
    </tu>`
    ).join("\n");

    const tmx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tmx SYSTEM "tmx14.dtd">
<tmx version="1.4">
  <header creationtool="CATEST" creationtoolversion="1.0" datatype="plaintext" segtype="sentence" adminlang="en" srclang="${bank.source_lang}" o-tmf="CATEST-TM"/>
  <body>
${tus}
  </body>
</tmx>`;

    return { success: true, tmx, bankName: bank.name };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function importTMX(
  bankId: string, tmxContent: string, fileName: string
): Promise<{ success: boolean; imported: number; skipped: number; error?: string }> {
  try {
    const user = await requireAdmin();
    const entries = parseTmxContent(tmxContent);
    let imported = 0, skipped = 0;

    for (const entry of entries) {
      if (!entry.source || !entry.target) { skipped++; continue; }
      const existing = await tmQuery(
        `SELECT id FROM tm_entries WHERE bank_id = $1 AND source_text = $2 AND target_text = $3`,
        [bankId, entry.source, entry.target]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        await tmQuery(`UPDATE tm_entries SET usage_count = usage_count + 1, updated_at = now() WHERE id = $1`, [existing.rows[0].id]);
        skipped++;
      } else {
        await tmQuery(
          `INSERT INTO tm_entries (bank_id, source_text, target_text, context, quality_score, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [bankId, entry.source, entry.target, entry.context || null, entry.qualityScore ?? 1.0, user.userId]
        );
        imported++;
      }
    }

    // Record import history
    await tmQuery(
      `INSERT INTO tm_import_history (bank_id, file_name, format, imported_count, skipped_count, imported_by)
       VALUES ($1, $2, 'tmx', $3, $4, $5)`,
      [bankId, fileName, imported, skipped, user.userId]
    );

    return { success: true, imported, skipped };
  } catch (err: any) {
    return { success: false, imported: 0, skipped: 0, error: err.message };
  }
}

export async function importTSV(
  bankId: string, tsvContent: string, fileName: string
): Promise<{ success: boolean; imported: number; skipped: number; error?: string }> {
  try {
    const user = await requireAdmin();
    const lines = tsvContent.split("\n").filter((l) => l.trim());
    let imported = 0, skipped = 0;

    for (const line of lines) {
      const parts = line.split("\t");
      const source = parts[0]?.trim();
      const target = parts[1]?.trim();
      const context = parts[2]?.trim() || null;
      if (!source || !target) { skipped++; continue; }

      const existing = await tmQuery(
        `SELECT id FROM tm_entries WHERE bank_id = $1 AND source_text = $2 AND target_text = $3`,
        [bankId, source, target]
      );
      if (existing.rowCount && existing.rowCount > 0) { skipped++; continue; }

      await tmQuery(
        `INSERT INTO tm_entries (bank_id, source_text, target_text, context, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [bankId, source, target, context, user.userId]
      );
      imported++;
    }

    await tmQuery(
      `INSERT INTO tm_import_history (bank_id, file_name, format, imported_count, skipped_count, imported_by)
       VALUES ($1, $2, 'tsv', $3, $4, $5)`,
      [bankId, fileName, imported, skipped, user.userId]
    );

    return { success: true, imported, skipped };
  } catch (err: any) {
    return { success: false, imported: 0, skipped: 0, error: err.message };
  }
}

export async function getImportHistory(
  bankId: string
): Promise<{ file_name: string; format: string; imported_count: number; skipped_count: number; created_at: string }[]> {
  await requireAuth();
  const res = await tmQuery(
    `SELECT file_name, format, imported_count, skipped_count, created_at
     FROM tm_import_history WHERE bank_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [bankId]
  );
  return res.rows;
}

// ── Helpers ────────────────────────────────────────────────────────

function parseTmxContent(tmx: string): { source: string; target: string; context?: string; qualityScore?: number }[] {
  const entries: { source: string; target: string; context?: string; qualityScore?: number }[] = [];
  const tuBlocks = tmx.split(/<tu[^>]*>/i).slice(1);
  for (const block of tuBlocks) {
    const tuContent = block.split(/<\/tu>/i)[0] || "";
    const ctxMatch = tuContent.match(/<prop\s+type="x-context">([\s\S]*?)<\/prop>/i);
    const qsMatch = tuContent.match(/<prop\s+type="x-quality-score">([\s\S]*?)<\/prop>/i);
    const segMatches = [...tuContent.matchAll(/<seg>([\s\S]*?)<\/seg>/gi)];
    if (segMatches.length >= 2) {
      entries.push({
        source: unesc(segMatches[0][1].trim()),
        target: unesc(segMatches[1][1].trim()),
        context: ctxMatch ? unesc(ctxMatch[1].trim()) : undefined,
        qualityScore: qsMatch ? parseFloat(qsMatch[1]) : undefined,
      });
    }
  }
  return entries;
}

function unesc(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
