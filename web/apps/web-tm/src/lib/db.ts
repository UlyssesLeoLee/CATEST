import { Pool } from 'pg';

/**
 * Connection pool for the catest_tm database.
 * Dedicated Translation Memory storage.
 */
function getTmDbUrl(): string {
  if (process.env.TM_DATABASE_URL) return process.env.TM_DATABASE_URL;
  const gatewayUrl = process.env.DATABASE_URL;
  if (gatewayUrl) return gatewayUrl.replace(/\/catest_gateway$/, '/catest_tm');
  const port = process.env.POSTGRES_PORT || process.env.PORT_POSTGRES || '34321';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const user = process.env.POSTGRES_USER || 'catest';
  const pass = process.env.POSTGRES_PASSWORD || 'password';
  return `postgres://${user}:${pass}@${host}:${port}/catest_tm`;
}

const globalForTm = global as unknown as { tmPool: Pool };

export const tmPool = globalForTm.tmPool || new Pool({
  connectionString: getTmDbUrl(),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: false,
});

if (process.env.NODE_ENV !== 'production') globalForTm.tmPool = tmPool;

export async function tmQuery(text: string, params?: unknown[]) {
  try {
    return await tmPool.query(text, params as unknown[]);
  } catch (error: any) {
    console.error('TM DB Query Error:', error.message);
    throw error;
  }
}
