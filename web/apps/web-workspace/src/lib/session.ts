import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { query } from './db';

const JWT_HS256_SECRET = process.env.JWT_HS256_SECRET;

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  plan: string;
}

export async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    if (!JWT_HS256_SECRET) return null;
    const key = new TextEncoder().encode(JWT_HS256_SECRET);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) return null;

  const payload = await decrypt(token);
  if (!payload?.sessionId) return null;

  const res = await query(
    'SELECT id FROM user_sessions WHERE id = $1 AND revoked = false AND expires_at > now()',
    [payload.sessionId],
  );
  if (res.rowCount === 0) return null;

  return payload;
}

export async function getUser(userId: string) {
  const res = await query(
    `SELECT u.id, u.email, u.display_name, u.role, u.status,
            l.plan
       FROM users u
       LEFT JOIN licenses l ON l.user_id = u.id AND l.is_active = true
      WHERE u.id = $1`,
    [userId],
  );
  return res.rows[0] ?? null;
}
