import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { Pool } from 'pg';

const JWT_HS256_SECRET = process.env.JWT_HS256_SECRET;

function getGatewayDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const port = process.env.POSTGRES_PORT || process.env.PORT_POSTGRES || '34321';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const user = process.env.POSTGRES_USER || 'catest';
  const pass = process.env.POSTGRES_PASSWORD || 'password';
  return `postgres://${user}:${pass}@${host}:${port}/catest_gateway`;
}

const globalForGw = global as unknown as { gwPool: Pool };
const gwPool = globalForGw.gwPool || new Pool({
  connectionString: getGatewayDbUrl(),
  max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, ssl: false,
});
if (process.env.NODE_ENV !== 'production') globalForGw.gwPool = gwPool;

export async function getSession() {
  const token = (await cookies()).get('session')?.value;
  if (!token || !JWT_HS256_SECRET) return null;
  try {
    const key = new TextEncoder().encode(JWT_HS256_SECRET);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    const res = await gwPool.query('SELECT id FROM user_sessions WHERE id = $1 AND revoked = false', [payload.sessionId]);
    return res.rowCount ? payload : null;
  } catch { return null; }
}

export async function getUser(userId: string) {
  const res = await gwPool.query('SELECT email, display_name, role FROM users WHERE id = $1', [userId]);
  return res.rows[0];
}
