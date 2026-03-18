'use server';

import { query } from '@/lib/db'; // Postgres

export async function getConfirmedTranslations() {
  try {
    const res = await query(`
      SELECT id, workspace_id, file_path, source_text, target_text, rag_status, created_at 
      FROM confirmed_translations 
      ORDER BY created_at DESC
    `);
    return { success: true, data: res.rows };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to fetch confirmed translations:', err);
    return { success: false, error: msg };
  }
}

export async function triggerRagIngestion(itemIds: string[]) {
  try {
    // 1. Fetch the actual content to send to Kafka
    const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(',');
    const items = await query(`
      SELECT * FROM confirmed_translations WHERE id IN (${placeholders})
    `, itemIds);

    // 2. Trigger Rust Gateway to publish to Kafka
    // Next.js (Frontend Service) -> Rust Gateway (Backend Service) -> Kafka
    const GATEWAY_PORT = process.env.GATEWAY_PORT || '33080';
    const gatewayUrl = `http://localhost:${GATEWAY_PORT}/api/ingest-rag`;

    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.rows }),
    });

    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }

    // 3. Update status in Postgres
    await query(`
      UPDATE confirmed_translations 
      SET rag_status = 'processing' 
      WHERE id IN (${placeholders})
    `, itemIds);

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to trigger RAG ingestion:', err);
    return { success: false, error: msg };
  }
}
