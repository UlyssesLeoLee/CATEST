/**
 * Qdrant REST operations for Translation Memory semantic search.
 * Collection: catest_tm  |  384-dim cosine
 *
 * PostgreSQL remains the source of truth — Qdrant is a fast semantic index.
 * All operations degrade gracefully: errors are logged and never throw to callers.
 */

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:36334";
const COLLECTION = "catest_tm";
const VECTOR_DIM = parseInt(process.env.EMBED_VECTOR_DIM ?? "384", 10);

// ── Internal fetch helper ─────────────────────────────────────────────

async function qFetch(path: string, method: string, body?: unknown): Promise<unknown> {
  const resp = await fetch(`${QDRANT_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Qdrant ${method} ${path} → ${resp.status}: ${text}`);
  }
  return resp.json();
}

// ── Collection bootstrap ──────────────────────────────────────────────

let _collectionReady = false;

export async function ensureTMCollection(): Promise<void> {
  if (_collectionReady) return;
  try {
    await qFetch(`/collections/${COLLECTION}`, "GET");
    _collectionReady = true;
  } catch {
    // Collection does not exist — create it
    await qFetch(`/collections/${COLLECTION}`, "PUT", {
      vectors: { size: VECTOR_DIM, distance: "Cosine" },
    });
    _collectionReady = true;
  }
}

// ── Write ─────────────────────────────────────────────────────────────

export async function upsertTMVector(
  id: string,
  vector: number[],
  payload: { source_text: string; target_text: string; tm_name: string },
): Promise<void> {
  await ensureTMCollection();
  await qFetch(`/collections/${COLLECTION}/points`, "PUT", {
    points: [{ id, vector, payload }],
  });
}

export async function deleteTMVector(id: string): Promise<void> {
  try {
    await ensureTMCollection();
    await qFetch(`/collections/${COLLECTION}/points/delete`, "POST", { points: [id] });
  } catch (e) {
    console.warn("[Qdrant/TM] delete failed:", (e as Error).message);
  }
}

// ── Search ────────────────────────────────────────────────────────────

export interface QdrantTMHit {
  id: string;
  score: number;
  source_text: string;
  target_text: string;
  tm_name: string;
}

export async function searchTMVectors(
  vector: number[],
  limit: number = 8,
  tmName?: string,
): Promise<QdrantTMHit[]> {
  await ensureTMCollection();
  const body: Record<string, unknown> = { vector, limit, with_payload: true };
  if (tmName) {
    body.filter = { must: [{ key: "tm_name", match: { value: tmName } }] };
  }
  const data = (await qFetch(
    `/collections/${COLLECTION}/points/search`,
    "POST",
    body,
  )) as { result: Array<{ id: string; score: number; payload: Record<string, string> }> };

  return (data.result ?? []).map((r) => ({
    id: String(r.id),
    score: r.score,
    source_text: r.payload.source_text ?? "",
    target_text: r.payload.target_text ?? "",
    tm_name: r.payload.tm_name ?? "",
  }));
}
