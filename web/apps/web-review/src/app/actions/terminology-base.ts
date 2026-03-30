"use server";

import { reviewQuery } from "@/lib/review-db";
import { requireReader, requireEditor, requireAdmin } from "@/lib/permissions";

// ── Types ──────────────────────────────────────────────────────────

export interface TBEntry {
  id: string;
  tb_name: string;
  source_term: string;
  target_term: string;
  definition: string | null;
  domain: string | null;
  forbidden: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TBBank {
  name: string;
  entry_count: number;
}

// ── Bank Management (Admin only) ───────────────────────────────────

/** Rename a TB bank (admin only) */
export async function renameTBBank(
  oldName: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const trimmed = newName.trim();
    if (!trimmed) return { success: false, error: "New name cannot be empty" };
    await reviewQuery(
      `UPDATE terminology_base SET tb_name = $1, updated_at = now() WHERE tb_name = $2`,
      [trimmed, oldName]
    );
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Delete an entire TB bank and all entries (admin only) */
export async function deleteTBBank(
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    await reviewQuery(`DELETE FROM terminology_base WHERE tb_name = $1`, [name]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Read Operations (Any authenticated user) ───────────────────────

/** List all available TB banks */
export async function listTBBanks(): Promise<TBBank[]> {
  try {
    await requireReader();
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
    await requireReader();
    const res = await reviewQuery(
      `SELECT id, tb_name, source_term, target_term, definition, domain, forbidden, created_by, created_at, updated_at
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

/** Get entries in a TB bank with pagination */
export async function getTBEntries(
  tbName: string = "default",
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: TBEntry[]; total: number }> {
  try {
    await requireReader();
    const countRes = await reviewQuery(
      `SELECT COUNT(*) FROM terminology_base WHERE tb_name = $1`,
      [tbName]
    );
    const res = await reviewQuery(
      `SELECT id, tb_name, source_term, target_term, definition, domain, forbidden, created_by, created_at, updated_at
       FROM terminology_base WHERE tb_name = $1
       ORDER BY source_term LIMIT $2 OFFSET $3`,
      [tbName, limit, offset]
    );
    return { entries: res.rows, total: Number(countRes.rows[0].count) };
  } catch {
    return { entries: [], total: 0 };
  }
}

// ── Write Operations (Admin or User) ───────────────────────────────

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
    const user = await requireEditor();

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
      `INSERT INTO terminology_base (tb_name, source_term, target_term, definition, domain, forbidden, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [tbName, sourceTerm, targetTerm, definition || null, domain || null, forbidden, user.userId]
    );
    return { success: true, id: res.rows[0].id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Update a TB entry (admin only) */
export async function updateTBEntry(
  id: string,
  updates: { source_term?: string; target_term?: string; definition?: string; domain?: string; forbidden?: boolean }
): Promise<{ success: boolean }> {
  try {
    await requireAdmin();
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.source_term !== undefined) { sets.push(`source_term = $${idx++}`); params.push(updates.source_term); }
    if (updates.target_term !== undefined) { sets.push(`target_term = $${idx++}`); params.push(updates.target_term); }
    if (updates.definition !== undefined) { sets.push(`definition = $${idx++}`); params.push(updates.definition); }
    if (updates.domain !== undefined) { sets.push(`domain = $${idx++}`); params.push(updates.domain); }
    if (updates.forbidden !== undefined) { sets.push(`forbidden = $${idx++}`); params.push(updates.forbidden); }
    if (sets.length === 0) return { success: true };

    sets.push(`updated_at = now()`);
    params.push(id);

    await reviewQuery(`UPDATE terminology_base SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    return { success: true };
  } catch {
    return { success: false };
  }
}

/** Delete a TB entry (admin only) */
export async function deleteTBEntry(id: string): Promise<{ success: boolean }> {
  try {
    await requireAdmin();
    await reviewQuery(`DELETE FROM terminology_base WHERE id = $1`, [id]);
    return { success: true };
  } catch {
    return { success: false };
  }
}

/** Bulk delete TB entries (admin only) */
export async function bulkDeleteTBEntries(
  ids: string[]
): Promise<{ success: boolean; deleted: number }> {
  try {
    await requireAdmin();
    if (ids.length === 0) return { success: true, deleted: 0 };
    const res = await reviewQuery(
      `DELETE FROM terminology_base WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    return { success: true, deleted: res.rowCount ?? 0 };
  } catch {
    return { success: false, deleted: 0 };
  }
}

// ── TBX Export (Industry standard) ─────────────────────────────────

/**
 * Export TB bank as TBX (TermBase eXchange) XML string.
 * TBX is the ISO 30042 standard used by SDL MultiTerm, memoQ, etc.
 */
export async function exportTBX(
  tbName: string = "default"
): Promise<{ success: boolean; tbx?: string; error?: string }> {
  try {
    await requireReader();
    const res = await reviewQuery(
      `SELECT source_term, target_term, definition, domain, forbidden, created_at
       FROM terminology_base WHERE tb_name = $1 ORDER BY source_term`,
      [tbName]
    );

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const entries = res.rows
      .map(
        (r: any, i: number) =>
          `    <termEntry id="t${i + 1}">
      ${r.domain ? `<descrip type="subjectField">${esc(r.domain)}</descrip>` : ""}
      ${r.definition ? `<descrip type="definition">${esc(r.definition)}</descrip>` : ""}
      ${r.forbidden ? `<note>FORBIDDEN — do not use this term</note>` : ""}
      <langSet xml:lang="en">
        <tig>
          <term>${esc(r.source_term)}</term>
        </tig>
      </langSet>
      <langSet xml:lang="zh">
        <tig>
          <term>${esc(r.target_term)}</term>
        </tig>
      </langSet>
    </termEntry>`
      )
      .join("\n");

    const tbx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE martif SYSTEM "TBXcoreStructV02.dtd">
<martif type="TBX" xml:lang="en">
  <martifHeader>
    <fileDesc>
      <titleStmt><title>CATEST Terminology Base: ${esc(tbName)}</title></titleStmt>
      <sourceDesc><p>Exported from CATEST</p></sourceDesc>
    </fileDesc>
  </martifHeader>
  <text>
    <body>
${entries}
    </body>
  </text>
</martif>`;

    return { success: true, tbx };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Export TB bank as CSV.
 * Columns: source_term, target_term, domain, definition, forbidden
 */
export async function exportTBCSV(
  tbName: string = "default"
): Promise<{ success: boolean; csv?: string; error?: string }> {
  try {
    await requireReader();
    const res = await reviewQuery(
      `SELECT source_term, target_term, domain, definition, forbidden
       FROM terminology_base WHERE tb_name = $1 ORDER BY source_term`,
      [tbName]
    );

    const escCsv = (s: string | null) => {
      if (!s) return "";
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = "source_term,target_term,domain,definition,forbidden";
    const rows = res.rows.map(
      (r: any) =>
        `${escCsv(r.source_term)},${escCsv(r.target_term)},${escCsv(r.domain)},${escCsv(r.definition)},${r.forbidden}`
    );

    return { success: true, csv: [header, ...rows].join("\n") };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Import CSV content into TB (admin only).
 * Expected columns: source_term, target_term [, domain, definition, forbidden]
 */
export async function importTBFromCSV(
  tbName: string,
  csvContent: string
): Promise<{ success: boolean; imported: number; skipped: number; error?: string }> {
  try {
    const user = await requireAdmin();
    const lines = csvContent.split("\n").filter((l) => l.trim());
    let imported = 0;
    let skipped = 0;

    // Skip header if it looks like a header
    const startIdx = lines[0]?.toLowerCase().includes("source_term") ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      const source = fields[0]?.trim();
      const target = fields[1]?.trim();
      const domain = fields[2]?.trim() || null;
      const definition = fields[3]?.trim() || null;
      const forbidden = fields[4]?.trim().toLowerCase() === "true";

      if (!source || !target) { skipped++; continue; }

      const existing = await reviewQuery(
        `SELECT id FROM terminology_base WHERE tb_name = $1 AND source_term = $2 AND target_term = $3`,
        [tbName, source, target]
      );

      if (existing.rowCount && existing.rowCount > 0) {
        skipped++;
      } else {
        await reviewQuery(
          `INSERT INTO terminology_base (tb_name, source_term, target_term, domain, definition, forbidden, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tbName, source, target, domain, definition, forbidden, user.userId]
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
 * Import TBX XML content into TB (admin only).
 */
export async function importTBX(
  tbName: string,
  tbxContent: string
): Promise<{ success: boolean; imported: number; skipped: number; error?: string }> {
  try {
    const user = await requireAdmin();
    const entries = parseTbxContent(tbxContent);
    let imported = 0;
    let skipped = 0;

    for (const entry of entries) {
      if (!entry.source || !entry.target) { skipped++; continue; }

      const existing = await reviewQuery(
        `SELECT id FROM terminology_base WHERE tb_name = $1 AND source_term = $2 AND target_term = $3`,
        [tbName, entry.source, entry.target]
      );

      if (existing.rowCount && existing.rowCount > 0) {
        skipped++;
      } else {
        await reviewQuery(
          `INSERT INTO terminology_base (tb_name, source_term, target_term, domain, definition, forbidden, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tbName, entry.source, entry.target, entry.domain || null, entry.definition || null, entry.forbidden, user.userId]
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

/** Parse a CSV line respecting quoted fields */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/** Minimal TBX parser */
function parseTbxContent(
  tbx: string
): { source: string; target: string; domain?: string; definition?: string; forbidden: boolean }[] {
  const entries: { source: string; target: string; domain?: string; definition?: string; forbidden: boolean }[] = [];

  const termBlocks = tbx.split(/<termEntry[^>]*>/i).slice(1);

  for (const block of termBlocks) {
    const content = block.split(/<\/termEntry>/i)[0] || "";

    const domainMatch = content.match(/<descrip\s+type="subjectField">([\s\S]*?)<\/descrip>/i);
    const defMatch = content.match(/<descrip\s+type="definition">([\s\S]*?)<\/descrip>/i);
    const forbidden = /<note>.*FORBIDDEN/i.test(content);

    // Extract terms from langSet blocks
    const langSets = [...content.matchAll(/<langSet[^>]*xml:lang="([^"]*)"[^>]*>([\s\S]*?)<\/langSet>/gi)];
    let source = "";
    let target = "";

    for (const ls of langSets) {
      const lang = ls[1].toLowerCase();
      const termMatch = ls[2].match(/<term>([\s\S]*?)<\/term>/i);
      if (termMatch) {
        const term = unescXml(termMatch[1].trim());
        if (lang.startsWith("en")) source = term;
        else target = term;
      }
    }

    // If only 2 langSets and no explicit en/zh, use positional
    if (!source && !target && langSets.length >= 2) {
      const t1 = langSets[0][2].match(/<term>([\s\S]*?)<\/term>/i);
      const t2 = langSets[1][2].match(/<term>([\s\S]*?)<\/term>/i);
      if (t1) source = unescXml(t1[1].trim());
      if (t2) target = unescXml(t2[1].trim());
    }

    if (source || target) {
      entries.push({
        source,
        target,
        domain: domainMatch ? unescXml(domainMatch[1].trim()) : undefined,
        definition: defMatch ? unescXml(defMatch[1].trim()) : undefined,
        forbidden,
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
