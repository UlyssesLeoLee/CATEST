import { Pool } from 'pg';

const dbUrl = process.env.DATABASE_URL || `postgres://catest:password@localhost:${process.env.POSTGRES_PORT || '34321'}/catest_gateway`;

const globalForPg = global as unknown as { pool: Pool };

export const pool = globalForPg.pool || new Pool({
  connectionString: dbUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: false,
});

if (process.env.NODE_ENV !== 'production') globalForPg.pool = pool;

export async function query(text: string, params?: unknown[]) {
  try {
    return await pool.query(text, params as unknown[]);
  } catch (error: any) {
    console.error('RAG DB Query Error:', error.message);
    throw error;
  }
}
