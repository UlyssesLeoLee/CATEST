import { Pool } from 'pg';

/**
 * Connection pool for catest_ingestion database.
 * Snapshots, files (with S3 references).
 */
const globalForIngPg = global as unknown as { ingPool: Pool };

function getIngestionDbUrl(): string {
  if (process.env.INGESTION_DATABASE_URL) return process.env.INGESTION_DATABASE_URL;
  // Derive from DATABASE_URL
  const gatewayUrl = process.env.DATABASE_URL;
  if (gatewayUrl) return gatewayUrl.replace(/\/catest_gateway$/, '/catest_ingestion');
  const port = process.env.POSTGRES_PORT || process.env.PORT_POSTGRES || '34321';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const user = process.env.POSTGRES_USER || 'catest';
  const pass = process.env.POSTGRES_PASSWORD || 'password';
  return `postgres://${user}:${pass}@${host}:${port}/catest_ingestion`;
}

export const ingPool = globalForIngPg.ingPool || new Pool({
  connectionString: getIngestionDbUrl(),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: false,
});

if (process.env.NODE_ENV !== 'production') globalForIngPg.ingPool = ingPool;

export async function ingQuery(text: string, params?: unknown[]) {
  try {
    return await ingPool.query(text, params as unknown[]);
  } catch (error: any) {
    console.error('Ingestion DB Query Error:', error.message);
    throw error;
  }
}
