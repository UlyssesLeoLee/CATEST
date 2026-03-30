"use server";

import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { gwQuery } from "./gateway-db";

export interface SessionUser {
  userId: string;
  email: string;
  role: "admin" | "user" | "viewer";
  sessionId: string;
  plan: string;
}

/**
 * Extract current user from JWT session cookie.
 * Returns null if not authenticated.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const secret = process.env.JWT_HS256_SECRET;
  if (!secret) return null;

  const token = (await cookies()).get("session")?.value;
  if (!token) return null;

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: (payload.role as "admin" | "user" | "viewer") || "viewer",
      sessionId: payload.sessionId as string,
      plan: (payload.plan as string) || "free",
    };
  } catch {
    return null;
  }
}

/**
 * Require authentication. Throws if no valid session.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized: no valid session");
  return user;
}

/**
 * Require one of the specified roles. Throws if not authorized.
 */
export async function requireRole(
  ...roles: ("admin" | "user" | "viewer")[]
): Promise<SessionUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new Error(`Forbidden: requires role ${roles.join(" or ")}, got ${user.role}`);
  }
  return user;
}

// ── Role-based permission helpers ──────────────────────────────────

/** Admin: full CRUD on banks and entries, import/export, bulk ops */
export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("admin");
}

/** Admin or User: can add/edit entries, export */
export async function requireEditor(): Promise<SessionUser> {
  return requireRole("admin", "user");
}

/** Any authenticated user can read */
export async function requireReader(): Promise<SessionUser> {
  return requireRole("admin", "user", "viewer");
}

/**
 * Get the role of the current user for client-side permission checks.
 * Returns 'guest' if not authenticated.
 */
export async function getCurrentRole(): Promise<"admin" | "user" | "viewer" | "guest"> {
  const user = await getSessionUser();
  return user?.role ?? "guest";
}

/**
 * List all users (admin only) for assignment/sharing features.
 */
export async function listUsers(): Promise<
  { id: string; email: string; display_name: string | null; role: string }[]
> {
  await requireAdmin();
  const res = await gwQuery(
    `SELECT id, email, display_name, role FROM users WHERE status = 'active' ORDER BY email`
  );
  return res.rows;
}
