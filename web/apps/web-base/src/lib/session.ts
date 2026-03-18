import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies, headers } from 'next/headers';
import { query } from '@/lib/db';

const JWT_EXPIRY_SECONDS = 60 * 60 * 24 * 30; // 30 days — matches user_sessions.expires_at

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  plan: string;
}

function getJwtKey() {
  const secret = process.env.JWT_HS256_SECRET;
  if (!secret) throw new Error('JWT_HS256_SECRET not set');
  return new TextEncoder().encode(secret);
}

/** Create a signed JWT. */
export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${JWT_EXPIRY_SECONDS}s`)
    .sign(getJwtKey());
}

/** Verify and decode a JWT, returns null on any error. */
export async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtKey(), { algorithms: ['HS256'] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Read the active session from the cookie, verify JWT, and check DB revocation status. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('session')?.value;
  if (!raw) return null;

  const payload = await decrypt(raw);
  if (!payload?.sessionId) return null;

  // Check that the session has not been revoked in the DB
  const res = await query(
    'SELECT id FROM user_sessions WHERE id = $1 AND revoked = false AND expires_at > now()',
    [payload.sessionId],
  );
  if (res.rowCount === 0) return null;

  return payload;
}

/** Fetch the full user row + active license info from PostgreSQL. */
export async function getUser(userId: string) {
  const res = await query(
    `SELECT u.id, u.email, u.display_name, u.role, u.status, u.last_login, u.created_at,
            l.plan, l.expires_at AS license_expires_at
       FROM users u
       LEFT JOIN licenses l ON l.user_id = u.id AND l.is_active = true
      WHERE u.id = $1`,
    [userId],
  );
  return res.rows[0] ?? null;
}

/** Write a session row and set the HTTP-only cookie. Returns the session record id. */
export async function createSession(
  userId: string,
  email: string,
  role: string,
  plan: string,
): Promise<string> {
  const headerStore = await headers();
  const userAgent = headerStore.get('user-agent') ?? '';

  const sessionRes = await query(
    `INSERT INTO user_sessions (user_id, user_agent)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, userAgent],
  );
  const sessionId = sessionRes.rows[0].id as string;

  const token = await encrypt({ userId, email, role, sessionId, plan });
  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: JWT_EXPIRY_SECONDS,
    path: '/',
  });

  return sessionId;
}

/** Soft-delete the current session row and clear the cookie. */
export async function invalidateSession(sessionId: string): Promise<void> {
  await query('UPDATE user_sessions SET revoked = true WHERE id = $1', [sessionId]);
  const cookieStore = await cookies();
  cookieStore.delete('session');
}
