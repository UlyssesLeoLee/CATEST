import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://catest:password@localhost:34321/catest_gateway',
});

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}
