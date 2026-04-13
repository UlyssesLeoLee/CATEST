'use server';

import { getAppStateDb } from '@/lib/sqlite';
import { getSession } from '@/lib/session';

/**
 * Get one state value for the current user.
 * Returns null if no session or key not found.
 */
export async function getUserState(app: string, key: string): Promise<string | null> {
  const session = await getSession();
  if (!session?.userId) return null;

  try {
    const db = getAppStateDb();
    const row = db
      .prepare('SELECT value FROM user_state WHERE user_id = ? AND app = ? AND key = ?')
      .get(session.userId, app, key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Get all state values for the current user under a given app namespace.
 * Returns {} if no session or no keys found.
 */
export async function getAllUserState(app: string): Promise<Record<string, string>> {
  const session = await getSession();
  if (!session?.userId) return {};

  try {
    const db = getAppStateDb();
    const rows = db
      .prepare('SELECT key, value FROM user_state WHERE user_id = ? AND app = ?')
      .all(session.userId, app) as { key: string; value: string }[];

    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

/**
 * Upsert one state value for the current user.
 * Returns { ok: false } if no session.
 */
export async function setUserState(
  app: string,
  key: string,
  value: string,
): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.userId) return { ok: false };

  try {
    const db = getAppStateDb();
    db.prepare(`
      INSERT INTO user_state (user_id, app, key, value, updated_at)
      VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      ON CONFLICT (user_id, app, key)
      DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(session.userId, app, key, value);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Delete one state key for the current user.
 * Returns { ok: false } if no session.
 */
export async function deleteUserState(app: string, key: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.userId) return { ok: false };

  try {
    const db = getAppStateDb();
    db.prepare('DELETE FROM user_state WHERE user_id = ? AND app = ? AND key = ?')
      .run(session.userId, app, key);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
