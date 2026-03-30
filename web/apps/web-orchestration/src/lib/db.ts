import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://catest:password@localhost:35432/catest_orchestration',
});

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}
