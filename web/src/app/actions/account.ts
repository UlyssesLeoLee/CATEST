'use server';

import { getSession, getUser } from '@/lib/session';
import { query } from '@/lib/db';
import { randomBytes, createHash } from 'crypto';

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getMyAccount() {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const user = await getUser(session.userId);
  if (!user) return { error: 'User not found' };

  return { success: true, user };
}

export async function updateProfile(displayName: string) {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  await query(
    'UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2',
    [displayName, session.userId],
  );
  return { success: true };
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function listActiveSessions() {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const res = await query(
    `SELECT id, user_agent, ip_address, created_at, expires_at,
            id = $2 AS is_current
       FROM user_sessions
      WHERE user_id = $1 AND revoked = false AND expires_at > now()
      ORDER BY created_at DESC`,
    [session.userId, session.sessionId],
  );
  return { success: true, sessions: res.rows };
}

export async function revokeSession(targetSessionId: string) {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  // Only allow revoking own sessions
  await query(
    'UPDATE user_sessions SET revoked = true WHERE id = $1 AND user_id = $2',
    [targetSessionId, session.userId],
  );
  return { success: true };
}

export async function revokeAllOtherSessions() {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const res = await query(
    'UPDATE user_sessions SET revoked = true WHERE user_id = $1 AND id != $2 AND revoked = false RETURNING id',
    [session.userId, session.sessionId],
  );
  return { success: true, count: res.rowCount };
}

// ─── API Tokens ───────────────────────────────────────────────────────────────

export async function generateApiToken(name: string): Promise<{ success: true; rawToken: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  // Generate a 32-byte cryptographically-secure random token
  const raw = randomBytes(32).toString('hex'); // 64 hex chars
  const prefix = raw.slice(0, 8);
  const hash = createHash('sha256').update(raw).digest('hex');

  await query(
    `INSERT INTO api_tokens (user_id, name, token_prefix, token_hash)
     VALUES ($1, $2, $3, $4)`,
    [session.userId, name, prefix, hash],
  );

  // Return the raw token ONCE — never stored in DB
  return { success: true, rawToken: `ct_${raw}` };
}

export async function listApiTokens() {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const res = await query(
    `SELECT id, name, token_prefix, created_at, last_used_at, expires_at
       FROM api_tokens
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [session.userId],
  );
  return { success: true, tokens: res.rows };
}

export async function revokeApiToken(tokenId: string) {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  await query(
    'DELETE FROM api_tokens WHERE id = $1 AND user_id = $2',
    [tokenId, session.userId],
  );
  return { success: true };
}
