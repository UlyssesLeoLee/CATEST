import { Pool } from 'pg';

/**
 * Connection pool for the catest_tb database.
 * Dedicated Terminology Base storage.
 */
function getTbDbUrl(): string {
  if (process.env.TB_DATABASE_URL) return process.env.TB_DATABASE_URL;
  const gatewayUrl = process.env.DATABASE_URL;
  if (gatewayUrl) return gatewayUrl.replace(/\/catest_gateway$/, '/catest_tb');
  const port = process.env.POSTGRES_PORT || process.env.PORT_POSTGRES || '34321';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const user = process.env.POSTGRES_USER || 'catest';
  const pass = process.env.POSTGRES_PASSWORD || 'password';
  return `postgres://${user}:${pass}@${host}:${port}/catest_tb`;
}

const globalForTb = global as unknown as { tbPool: Pool };

export const tbPool = globalForTb.tbPool || new Pool({
  connectionString: getTbDbUrl(),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: false,
});

if (process.env.NODE_ENV !== 'production') globalForTb.tbPool = tbPool;

export async function tbQuery(text: string, params?: unknown[]) {
  try {
    return await tbPool.query(text, params as unknown[]);
  } catch (error: any) {
    console.error('TB DB Query Error:', error.message);
    throw error;
  }
}
