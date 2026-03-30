"use server";

import { tbQuery } from "@/lib/db";
import { requireAuth, requireAdmin, requireEditor } from "@/lib/permissions";

// ── Types ──────────────────────────────────────────────────────────

export interface TBBank {
  id: string;
  name: string;
  description: string | null;
  source_lang: string;
  target_lang: string;
  entry_count: number;
  created_at: string;
}

export interface TBEntry {
  id: string;
  bank_id: string;
  source_term: string;
  target_term: string;
  definition: string | null;
  domain: string | null;
  pos: string | null;
  forbidden: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Bank Management ────────────────────────────────────────────────

export async function listBanks(): Promise<TBBank[]> {
  await requireAuth();
  const res = await tbQuery(
    `SELECT b.id, b.name, b.description, b.source_lang, b.target_lang, b.created_at,
            COALESCE(c.cnt, 0) AS entry_count
     FROM tb_banks b
     LEFT JOIN (SELECT bank_id, COUNT(*) AS cnt FROM tb_entries GROUP BY bank_id) c ON c.bank_id = b.id
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
    const res = await tbQuery(
      `INSERT INTO tb_banks (name, description, source_lang, target_lang)
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
    await tbQuery(`UPDATE tb_banks SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteBank(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    await tbQuery(`DELETE FROM tb_banks WHERE id = $1`, [id]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Entry CRUD ─────────────────────────────────────────────────────

export async function getEntries(
  bankId: string, limit = 50, offset = 0, search?: string
): Promise<{ entries: TBEntry[]; total: number }> {
  await requireAuth();
  const whereSearch = search
    ? `AND (source_term ILIKE '%' || $4 || '%' OR target_term ILIKE '%' || $4 || '%')`
    : "";
  const params: unknown[] = [bankId, limit, offset];
  if (search) params.push(search);

  const countRes = await tbQuery(
    `SELECT COUNT(*) FROM tb_entries WHERE bank_id = $1 ${whereSearch}`,
    search ? [bankId, search] : [bankId]
  );
  const res = await tbQuery(
    `SELECT id, bank_id, source_term, target_term, definition, domain, pos, forbidden, note, created_by, created_at, updated_at
     FROM tb_entries WHERE bank_id = $1 ${whereSearch}
     ORDER BY source_term LIMIT $2 OFFSET $3`,
    params
  );
  return { entries: res.rows, total: Number(countRes.rows[0].count) };
}

export async function addEntry(
  bankId: string, sourceTerm: string, targetTerm: string,
  opts?: { definition?: string; domain?: string; pos?: string; forbidden?: boolean; note?: string }
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const user = await requireEditor();
    const existing = await tbQuery(
      `SELECT id FROM tb_entries WHERE bank_id = $1 AND source_term = $2 AND target_term = $3`,
      [bankId, sourceTerm, targetTerm]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return { success: false, error: "Term already exists" };
    }
    const res = await tbQuery(
      `INSERT INTO tb_entries (bank_id, source_term, target_term, definition, domain, pos, forbidden, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [bankId, sourceTerm, targetTerm, opts?.definition || null, opts?.domain || null, opts?.pos || null, opts?.forbidden ?? false, opts?.note || null, user.userId]
    );
    return { success: true, id: res.rows[0].id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateEntry(
  id: string,
  updates: { source_term?: string; target_term?: string; definition?: string; domain?: string; pos?: string; forbidden?: boolean; note?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAdmin();
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (updates.source_term !== undefined) { sets.push(`source_term = $${idx++}`); params.push(updates.source_term); }
    if (updates.target_term !== undefined) { sets.push(`target_term = $${idx++}`); params.push(updates.target_term); }
    if (updates.definition !== undefined) { sets.push(`definition = $${idx++}`); params.push(updates.definition); }
    if (updates.domain !== undefined) { sets.push(`domain = $${idx++}`); params.push(updates.domain); }
    if (updates.pos !== undefined) { sets.push(`pos = $${idx++}`); params.push(updates.pos); }
    if (updates.forbidden !== undefined) { sets.push(`forbidden = $${idx++}`); params.push(updates.forbidden); }
    if (updates.note !== undefined) { sets.push(`note = $${idx++}`); params.push(updates.note); }
    if (sets.length === 0) return { success: true };
    sets.push(`updated_by = $${idx++}`);
    params.push(user.userId);
    sets.push(`updated_at = now()`);
    params.push(id);
    await tbQuery(`UPDATE tb_entries SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteEntry(id: string): Promise<{ success: boolean }> {
  try {
    await requireAdmin();
    await tbQuery(`DELETE FROM tb_entries WHERE id = $1`, [id]);
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function bulkDeleteEntries(ids: string[]): Promise<{ success: boolean; deleted: number }> {
  try {
    await requireAdmin();
    if (ids.length === 0) return { success: true, deleted: 0 };
    const res = await tbQuery(`DELETE FROM tb_entries WHERE id = ANY($1::uuid[])`, [ids]);
    return { success: true, deleted: res.rowCount ?? 0 };
  } catch {
    return { success: false, deleted: 0 };
  }
}

// ── TBX/CSV Export ─────────────────────────────────────────────────

export async function exportTBX(bankId: string): Promise<{ success: boolean; tbx?: string; bankName?: string; error?: string }> {
  try {
    await requireAuth();
    const bankRes = await tbQuery(`SELECT name, source_lang, target_lang FROM tb_banks WHERE id = $1`, [bankId]);
    if (!bankRes.rows[0]) return { success: false, error: "Bank not found" };
    const bank = bankRes.rows[0];

    const res = await tbQuery(
      `SELECT source_term, target_term, definition, domain, pos, forbidden, note
       FROM tb_entries WHERE bank_id = $1 ORDER BY source_term`,
      [bankId]
    );

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const entries = res.rows.map((r: any, i: number) =>
      `    <termEntry id="t${i + 1}">
      ${r.domain ? `<descrip type="subjectField">${esc(r.domain)}</descrip>` : ""}
      ${r.definition ? `<descrip type="definition">${esc(r.definition)}</descrip>` : ""}
      ${r.pos ? `<descrip type="partOfSpeech">${esc(r.pos)}</descrip>` : ""}
      ${r.forbidden ? `<note>FORBIDDEN — do not use this term</note>` : ""}
      ${r.note ? `<note>${esc(r.note)}</note>` : ""}
      <langSet xml:lang="${bank.source_lang}">
        <tig><term>${esc(r.source_term)}</term></tig>
      </langSet>
      <langSet xml:lang="${bank.target_lang}">
        <tig><term>${esc(r.target_term)}</term></tig>
      </langSet>
    </termEntry>`
    ).join("\n");

    const tbx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE martif SYSTEM "TBXcoreStructV02.dtd">
<martif type="TBX" xml:lang="${bank.source_lang}">
  <martifHeader>
    <fileDesc>
      <titleStmt><title>CATEST Terminology Base: ${esc(bank.name)}</title></titleStmt>
      <sourceDesc><p>Exported from CATEST</p></sourceDesc>
    </fileDesc>
  </martifHeader>
  <text>
    <body>
${entries}
    </body>
  </text>
</martif>`;

    return { success: true, tbx, bankName: bank.name };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function exportCSV(bankId: string): Promise<{ success: boolean; csv?: string; bankName?: string; error?: string }> {
  try {
    await requireAuth();
    const bankRes = await tbQuery(`SELECT name FROM tb_banks WHERE id = $1`, [bankId]);
    if (!bankRes.rows[0]) return { success: false, error: "Bank not found" };

    const res = await tbQuery(
      `SELECT source_term, target_term, domain, definition, pos, forbidden, note
       FROM tb_entries WHERE bank_id = $1 ORDER BY source_term`,
      [bankId]
    );

    const escCsv = (s: string | null) => {
      if (!s) return "";
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = "source_term,target_term,domain,definition,pos,forbidden,note";
    const rows = res.rows.map((r: any) =>
      `${escCsv(r.source_term)},${escCsv(r.target_term)},${escCsv(r.domain)},${escCsv(r.definition)},${escCsv(r.pos)},${r.forbidden},${escCsv(r.note)}`
    );

    return { success: true, csv: [header, ...rows].join("\n"), bankName: bankRes.rows[0].name };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── CSV/TBX Import ─────────────────────────────────────────────────

export async function importCSV(
  bankId: string, csvContent: string, fileName: string
): Promise<{ success: boolean; imported: number; skipped: number; error?: string }> {
  try {
    const user = await requireAdmin();
    const lines = csvContent.split("\n").filter((l) => l.trim());
    const startIdx = lines[0]?.toLowerCase().includes("source_term") ? 1 : 0;
    let imported = 0, skipped = 0;

    for (let i = startIdx; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      const source = fields[0]?.trim();
      const target = fields[1]?.trim();
      if (!source || !target) { skipped++; continue; }

      const existing = await tbQuery(
        `SELECT id FROM tb_entries WHERE bank_id = $1 AND source_term = $2 AND target_term = $3`,
        [bankId, source, target]
      );
      if (existing.rowCount && existing.rowCount > 0) { skipped++; continue; }

      await tbQuery(
        `INSERT INTO tb_entries (bank_id, source_term, target_term, domain, definition, pos, forbidden, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [bankId, source, target, fields[2]?.trim() || null, fields[3]?.trim() || null, fields[4]?.trim() || null, fields[5]?.trim().toLowerCase() === "true", fields[6]?.trim() || null, user.userId]
      );
      imported++;
    }

    await tbQuery(
      `INSERT INTO tb_import_history (bank_id, file_name, format, imported_count, skipped_count, imported_by)
       VALUES ($1, $2, 'csv', $3, $4, $5)`,
      [bankId, fileName, imported, skipped, user.userId]
    );

    return { success: true, imported, skipped };
  } catch (err: any) {
    return { success: false, imported: 0, skipped: 0, error: err.message };
  }
}

export async function importTBX(
  bankId: string, tbxContent: string, fileName: string
): Promise<{ success: boolean; imported: number; skipped: number; error?: string }> {
  try {
    const user = await requireAdmin();
    const entries = parseTbxContent(tbxContent);
    let imported = 0, skipped = 0;

    for (const entry of entries) {
      if (!entry.source || !entry.target) { skipped++; continue; }
      const existing = await tbQuery(
        `SELECT id FROM tb_entries WHERE bank_id = $1 AND source_term = $2 AND target_term = $3`,
        [bankId, entry.source, entry.target]
      );
      if (existing.rowCount && existing.rowCount > 0) { skipped++; continue; }

      await tbQuery(
        `INSERT INTO tb_entries (bank_id, source_term, target_term, domain, definition, forbidden, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [bankId, entry.source, entry.target, entry.domain || null, entry.definition || null, entry.forbidden, user.userId]
      );
      imported++;
    }

    await tbQuery(
      `INSERT INTO tb_import_history (bank_id, file_name, format, imported_count, skipped_count, imported_by)
       VALUES ($1, $2, 'tbx', $3, $4, $5)`,
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
  const res = await tbQuery(
    `SELECT file_name, format, imported_count, skipped_count, created_at
     FROM tb_import_history WHERE bank_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [bankId]
  );
  return res.rows;
}

// ── Helpers ────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { fields.push(current); current = ""; }
      else current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseTbxContent(tbx: string): { source: string; target: string; domain?: string; definition?: string; forbidden: boolean }[] {
  const entries: { source: string; target: string; domain?: string; definition?: string; forbidden: boolean }[] = [];
  const blocks = tbx.split(/<termEntry[^>]*>/i).slice(1);
  for (const block of blocks) {
    const content = block.split(/<\/termEntry>/i)[0] || "";
    const domMatch = content.match(/<descrip\s+type="subjectField">([\s\S]*?)<\/descrip>/i);
    const defMatch = content.match(/<descrip\s+type="definition">([\s\S]*?)<\/descrip>/i);
    const forbidden = /<note>.*FORBIDDEN/i.test(content);
    const langSets = [...content.matchAll(/<langSet[^>]*xml:lang="([^"]*)"[^>]*>([\s\S]*?)<\/langSet>/gi)];
    let source = "", target = "";
    for (const ls of langSets) {
      const termMatch = ls[2].match(/<term>([\s\S]*?)<\/term>/i);
      if (termMatch) {
        const t = unesc(termMatch[1].trim());
        if (ls[1].toLowerCase().startsWith("en")) source = t; else target = t;
      }
    }
    if (!source && !target && langSets.length >= 2) {
      const t1 = langSets[0][2].match(/<term>([\s\S]*?)<\/term>/i);
      const t2 = langSets[1][2].match(/<term>([\s\S]*?)<\/term>/i);
      if (t1) source = unesc(t1[1].trim());
      if (t2) target = unesc(t2[1].trim());
    }
    if (source || target) {
      entries.push({
        source, target,
        domain: domMatch ? unesc(domMatch[1].trim()) : undefined,
        definition: defMatch ? unesc(defMatch[1].trim()) : undefined,
        forbidden,
      });
    }
  }
  return entries;
}

function unesc(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
