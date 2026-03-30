"use server";

import { cookies } from "next/headers";
import { jwtVerify } from "jose";

export interface SessionUser {
  userId: string;
  email: string;
  role: "admin" | "user" | "viewer";
}

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
    };
  } catch {
    return null;
  }
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== "admin") throw new Error("Forbidden: admin only");
  return user;
}

export async function requireEditor(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role === "viewer") throw new Error("Forbidden: editor access required");
  return user;
}

export async function getCurrentRole(): Promise<"admin" | "user" | "viewer" | "guest"> {
  const user = await getSessionUser();
  return user?.role ?? "guest";
}
