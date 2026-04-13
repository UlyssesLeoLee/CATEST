/**
 * Embedding inference client — Ollama-compatible API
 * Configured via CATEST_INFERENCE_URL (default: http://localhost:38080)
 * Model: EMBED_MODEL_NAME (default: intfloat/multilingual-e5-small, 384-dim)
 */

const INFERENCE_URL = process.env.CATEST_INFERENCE_URL ?? "http://localhost:38080";
const EMBED_MODEL = process.env.EMBED_MODEL_NAME ?? "intfloat/multilingual-e5-small";

export async function embedText(text: string): Promise<number[]> {
  const resp = await fetch(`${INFERENCE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!resp.ok) throw new Error(`Embed failed: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  // Ollama returns { embeddings: [[...]] }
  return data.embeddings[0] as number[];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const resp = await fetch(`${INFERENCE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!resp.ok) throw new Error(`Embed batch failed: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  return data.embeddings as number[][];
}
