import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const postgresPort = process.env.POSTGRES_PORT || '35432';
const dbUrl = process.env.DATABASE_URL || `postgres://catest:password@localhost:${postgresPort}/catest_gateway`;

console.log('Connecting to:', dbUrl);

const pool = new Pool({
  connectionString: dbUrl,
  max: 1,
});

async function run() {
  try {
    console.log('Creating users table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Success!');
  } catch (err) {
    console.error('Failed to create users table:', err);
  } finally {
    pool.end();
  }
}

run();
