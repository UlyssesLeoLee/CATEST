import { Pool } from 'pg';

const postgresPort = process.env.POSTGRES_PORT || '35432';
const dbUrl = process.env.DATABASE_URL || `postgres://catest:password@localhost:${postgresPort}/catest_gateway`;

const pool = new Pool({
  connectionString: dbUrl,
  max: 5,
});

export async function query(text: string, params?: unknown[]) {
  const res = await pool.query(text, params as unknown[]);
  return res;
}
