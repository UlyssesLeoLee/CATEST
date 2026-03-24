import { Pool } from 'pg';

/**
 * Connection pool for catest_gateway database.
 * Projects, repositories, users, tenants.
 */
const globalForGwPg = global as unknown as { gwPool: Pool };

function getGatewayDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const port = process.env.POSTGRES_PORT || process.env.PORT_POSTGRES || '34321';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const user = process.env.POSTGRES_USER || 'catest';
  const pass = process.env.POSTGRES_PASSWORD || 'password';
  return `postgres://${user}:${pass}@${host}:${port}/catest_gateway`;
}

export const gwPool = globalForGwPg.gwPool || new Pool({
  connectionString: getGatewayDbUrl(),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: false,
});

if (process.env.NODE_ENV !== 'production') globalForGwPg.gwPool = gwPool;

export async function gwQuery(text: string, params?: unknown[]) {
  try {
    return await gwPool.query(text, params as unknown[]);
  } catch (error: any) {
    console.error('Gateway DB Query Error:', error.message);
    throw error;
  }
}
