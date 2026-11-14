import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "@/lib/types";
import { permissionsForRole } from "@/lib/rbac";
import { DEMO_SESSION_SECRET } from "./seed";
import { getStore } from "./store";

export const SESSION_COOKIE = "fincloud_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

type SessionPayload = { uid: string; exp: number };

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", DEMO_SESSION_SECRET).update(value).digest("base64url");
}

export function createSessionToken(userId: string, ttlSeconds = SESSION_TTL_SECONDS) {
  const payload: SessionPayload = { uid: userId, exp: Date.now() + ttlSeconds * 1000 };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.uid || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function toSessionUser(userId: string): SessionUser | null {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user || user.status !== "ACTIVE") return null;
  const branch = store.branches.find((b) => b.id === user.branchId);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    designation: user.designation,
    branchId: user.branchId,
    branchName: branch?.name ?? "Unassigned",
    permissions: permissionsForRole(user.role),
    avatarColor: user.avatarColor,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  return toSessionUser(payload.uid);
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
