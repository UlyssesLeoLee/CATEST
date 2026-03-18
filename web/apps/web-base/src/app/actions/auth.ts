'use server';

import { sendVerificationEmail } from '@/lib/mailer';
import { query } from '@/lib/db';
import { createSession, invalidateSession, getSession } from '@/lib/session';
import bcrypt from 'bcryptjs';

/** 
 * Adapt Authentication to Distributed Architecture (v2)
 * Uses PostgreSQL as a shared state for verification codes instead of in-memory maps.
 */

// No ensureAuthTables here. Managed via k8s/init scripts for consistency.

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

    if (res.rowCount === 0) return { error: 'Invalid identity or security key' };

    const user = res.rows[0];
    if (user.status === 'disabled') return { error: 'Access revoked: Account disabled' };

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return { error: 'Invalid identity or security key' };

    // Establish persistent session
    await createSession(user.id, user.email, user.role, user.plan);

    // Audit login
    await query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);

    return { success: true };
  } catch (err) {
    console.error('Distributed Auth (Login) Error:', err);
    return { error: 'System error during authentication' };
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export async function startRegistration(email: string, password: string) {
  try {
    
    // Check collision
    const check = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (check.rowCount && check.rowCount > 0) return { error: 'Identity already exists in system' };

    // Generate entropy
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = await bcrypt.hash(password, 10);
    
    // Bypass/Debug: If email is SMTP_USER, use fixed code and log it
    const isAdmin = process.env.SMTP_USER && email.toLowerCase() === process.env.SMTP_USER.toLowerCase();
    const finalCode = isAdmin ? "123456" : code;
    if (isAdmin) console.log(`[DEBUG] Registration code for admin: ${finalCode}`);

    // Persist to shared DB state (UPSERT)
    await query(
      `INSERT INTO verification_codes (email, code, pending_data, purpose, expires_at)
       VALUES (lower($1), $2, $3, 'register', now() + interval '15 minutes')
       ON CONFLICT (email) DO UPDATE 
       SET code = EXCLUDED.code, pending_data = EXCLUDED.pending_data, purpose = EXCLUDED.purpose, expires_at = EXCLUDED.expires_at`,
      [email, finalCode, JSON.stringify({ passwordHash: hash })]
    );

    await sendVerificationEmail(email, finalCode);
    return { success: true };
  } catch (err: unknown) {
    console.error('Distributed Auth (StartReg) Error:', err);
    return { error: 'Failed to dispatch verification code' };
  }
}

export async function completeRegistration(email: string, code: string) {
  try {
    const res = await query(
      `SELECT code, pending_data as payload, purpose, expires_at 
         FROM verification_codes 
        WHERE lower(email) = lower($1) AND purpose = 'register'`,
      [email]
    );

    if (res.rowCount === 0) return { error: 'Session expired or not found' };
    
    const { code: storedCode, payload, expires_at } = res.rows[0];
    
    if (new Date() > new Date(expires_at)) {
      await query('DELETE FROM verification_codes WHERE lower(email) = lower($1)', [email]);
      return { error: 'Verification code expired' };
    }
    
    if (storedCode !== code) return { error: 'Invalid audit code' };

    // Transition state: Create User
    const userRes = await query(
      `INSERT INTO users (email, password_hash)
       VALUES (lower($1), $2)
       RETURNING id, email, role`,
      [email, payload.passwordHash],
    );
    const user = userRes.rows[0];

    // Cleanup
    await query('DELETE FROM verification_codes WHERE lower(email) = lower($1)', [email]);

    // Provision default license
    await query(`INSERT INTO licenses (user_id, plan, is_active) VALUES ($1, 'free', true)`, [user.id]);

    // Establish session
    await createSession(user.id, user.email, user.role, 'free');

    return { success: true };
  } catch (err) {
    console.error('Distributed Auth (CompleteReg) Error:', err);
    return { error: 'Failed to finalize identity creation' };
  }
}

// ─── Password Recovery ────────────────────────────────────────────────────────

export async function requestPasswordReset(email: string) {
  try {
    
    const check = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (check.rowCount === 0) return { error: 'Identity not found in node' };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Bypass/Debug for Reset
    const isAdmin = process.env.SMTP_USER && email.toLowerCase() === process.env.SMTP_USER.toLowerCase();
    const finalCode = isAdmin ? "123456" : code;
    if (isAdmin) console.log(`[DEBUG] Password reset code for admin: ${finalCode}`);

    await query(
      `INSERT INTO verification_codes (email, code, purpose, expires_at)
       VALUES (lower($1), $2, $3, now() + interval '10 minutes')
       ON CONFLICT (email) DO UPDATE 
       SET code = EXCLUDED.code, purpose = EXCLUDED.purpose, expires_at = EXCLUDED.expires_at`,
      [email, finalCode, 'reset']
    );

    await sendVerificationEmail(email, finalCode);
    return { success: true };
  } catch (err: unknown) {
    console.error('Distributed Auth (ReqReset) Error:', err);
    return { error: 'Failed to dispatch recovery code' };
  }
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  try {
    const res = await query(
      `SELECT code, purpose, expires_at 
         FROM verification_codes 
        WHERE lower(email) = lower($1) AND purpose = 'reset'`,
      [email]
    );

    if (res.rowCount === 0) return { error: 'Recovery session expired' };
    
    const { code: storedCode, expires_at } = res.rows[0];
    
    if (new Date() > new Date(expires_at)) {
      await query('DELETE FROM verification_codes WHERE lower(email) = lower($1)', [email]);
      return { error: 'Recovery code expired' };
    }
    
    if (storedCode !== code) return { error: 'Invalid security code' };

    const hash = await bcrypt.hash(newPassword, 10);
    await query(
      'UPDATE users SET password_hash = $1, updated_at = now() WHERE lower(email) = lower($2)', 
      [hash, email]
    );
    
    await query('DELETE FROM verification_codes WHERE lower(email) = lower($1)', [email]);
    
    return { success: true };
  } catch (err) {
    console.error('Distributed Auth (ResetPass) Error:', err);
    return { error: 'Failed to update security credentials' };
  }
}

// ─── Termination ─────────────────────────────────────────────────────────────

export async function logout() {
  const session = await getSession();
  if (session?.sessionId) {
    await invalidateSession(session.sessionId);
  } else {
    const { cookies } = await import('next/headers');
    (await cookies()).delete('session');
  }
}
