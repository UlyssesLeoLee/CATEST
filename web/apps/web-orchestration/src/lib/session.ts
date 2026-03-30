import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { query } from './db';

const JWT_HS256_SECRET = process.env.JWT_HS256_SECRET;

export async function getSession() {
  const token = (await cookies()).get('session')?.value;
  if (!token || !JWT_HS256_SECRET) return null;
  try {
    const key = new TextEncoder().encode(JWT_HS256_SECRET);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    const res = await query('SELECT id FROM user_sessions WHERE id = $1 AND revoked = false', [payload.sessionId]);
    return res.rowCount ? payload : null;
  } catch { return null; }
}

export async function getUser(userId: string) {
  const res = await query('SELECT email, display_name, role FROM users WHERE id = $1', [userId]);
  return res.rows[0];
}
