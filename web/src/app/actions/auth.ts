'use server';

import { sendVerificationEmail } from '@/lib/mailer';
import { query } from '@/lib/db';
import { createSession, invalidateSession, getSession } from '@/lib/session';
import bcrypt from 'bcryptjs';

// ─── Verification State Persistence (HMR friendly) ──────────────────────────
const globalForAuth = global as unknown as {
  resetCodes: Map<string, { code: string; expires: number }>;
  pendingRegistrations: Map<string, { code: string; passwordHash: string; expires: number }>;
};

const resetCodes = globalForAuth.resetCodes || new Map();
const pendingRegistrations = globalForAuth.pendingRegistrations || new Map();

if (process.env.NODE_ENV !== 'production') {
  globalForAuth.resetCodes = resetCodes;
  globalForAuth.pendingRegistrations = pendingRegistrations;
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string) {
  try {
    const res = await query(
      `SELECT u.id, u.email, u.role, u.status, u.password_hash,
              COALESCE(l.plan, 'free') AS plan
         FROM users u
         LEFT JOIN licenses l ON l.user_id = u.id AND l.is_active = true
        WHERE lower(u.email) = lower($1)`,
      [email],
    );

    if (res.rowCount === 0) return { error: 'Invalid email or password' };

    const user = res.rows[0];
    if (user.status === 'disabled') return { error: 'Account is disabled' };

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return { error: 'Invalid email or password' };

    // Persist session + set cookie
    await createSession(user.id, user.email, user.role, user.plan);

    // Track last login
    await query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);

    return { success: true, user: { email: user.email, role: user.role, plan: user.plan } };
  } catch (err) {
    console.error('Login error:', err);
    return { error: 'Internal server error' };
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export async function startRegistration(email: string, password: string) {
  try {
    const check = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (check.rowCount && check.rowCount > 0) return { error: 'Email already registered' };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = await bcrypt.hash(password, 10);
    pendingRegistrations.set(email.toLowerCase(), {
      code,
      passwordHash: hash,
      expires: Date.now() + 10 * 60 * 1000, // 10 min
    });

    await sendVerificationEmail(email, code);
    return { success: true };
  } catch (err: unknown) {
    console.error('REGISTRATION SMTP ERROR:', err);
    return { error: 'Internal server error during registration: ' + (err instanceof Error ? err.message : 'Unknown error') };
  }
}

export async function completeRegistration(email: string, code: string) {
  const key = email.toLowerCase();
  const pending = pendingRegistrations.get(key);
  if (!pending) return { error: 'No registration session found. Please request a new code.' };
  if (Date.now() > pending.expires) {
    pendingRegistrations.delete(key);
    return { error: 'Verification code expired. Please register again.' };
  }
  if (pending.code !== code) return { error: 'Invalid verification code' };

  try {
    // 1. Insert user
    const userRes = await query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, role`,
      [email, pending.passwordHash],
    );
    const user = userRes.rows[0];
    pendingRegistrations.delete(key);

    // 2. Grant a free license
    await query(
      `INSERT INTO licenses (user_id, plan) VALUES ($1, 'free')`,
      [user.id],
    );

    // 3. Create session + cookie
    await createSession(user.id, user.email, user.role, 'free');

    return { success: true, user: { email: user.email } };
  } catch (err) {
    console.error('Registration completion error:', err);
    return { error: 'Failed to finalize registration' };
  }
}

// ─── Password Reset ───────────────────────────────────────────────────────────

export async function requestPasswordReset(email: string) {
  try {
    const check = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (check.rowCount === 0) return { error: 'Email not found' };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes.set(email.toLowerCase(), { code, expires: Date.now() + 5 * 60 * 1000 });

    await sendVerificationEmail(email, code);
    return { success: true };
  } catch (err: unknown) {
    console.error('SMTP ERROR during email dispatch:', err);
    return { error: 'Failed to send reset code: ' + (err instanceof Error ? err.message : 'Unknown error') };
  }
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  const key = email.toLowerCase();
  const stored = resetCodes.get(key);
  if (!stored) return { error: 'No reset requested for this email' };
  if (Date.now() > stored.expires) {
    resetCodes.delete(key);
    return { error: 'Reset code expired' };
  }
  if (stored.code !== code) return { error: 'Invalid code' };

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE lower(email) = lower($2)', [hash, email]);
    resetCodes.delete(key);
    return { success: true };
  } catch (err) {
    console.error('Reset password error:', err);
    return { error: 'Internal server error during password reset' };
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout() {
  const session = await getSession();
  if (session?.sessionId) {
    await invalidateSession(session.sessionId);
  } else {
    // Fallback: just clear cookie
    const { cookies } = await import('next/headers');
    (await cookies()).delete('session');
  }
}
