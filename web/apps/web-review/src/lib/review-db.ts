import { Pool } from 'pg';

/**
 * Connection pool for the catest_review database.
 * Stores TM, TB, findings, review tasks, etc.
 *
 * Uses REVIEW_DATABASE_URL env var, or falls back to deriving from DATABASE_URL
 * by replacing the database name, or constructs from POSTGRES_PORT.
 */
function getReviewDbUrl(): string {
  if (process.env.REVIEW_DATABASE_URL) return process.env.REVIEW_DATABASE_URL;

  // Derive from DATABASE_URL by replacing the db name
  const gatewayUrl = process.env.DATABASE_URL;
  if (gatewayUrl) {
    return gatewayUrl.replace(/\/catest_gateway$/, '/catest_review');
  }

  // Fallback: construct from port
  const port = process.env.POSTGRES_PORT || process.env.PORT_POSTGRES || '34321';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const user = process.env.POSTGRES_USER || 'catest';
  const pass = process.env.POSTGRES_PASSWORD || 'password';
  return `postgres://${user}:${pass}@${host}:${port}/catest_review`;
}

const globalForReviewPg = global as unknown as { reviewPool: Pool };

export const reviewPool = globalForReviewPg.reviewPool || new Pool({
  connectionString: getReviewDbUrl(),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: false,
});

if (process.env.NODE_ENV !== 'production') globalForReviewPg.reviewPool = reviewPool;

export async function reviewQuery(text: string, params?: unknown[]) {
  try {
    return await reviewPool.query(text, params as unknown[]);
  } catch (error: any) {
    console.error('Review DB Query Error:', error.message);
    throw error;
  }
}
