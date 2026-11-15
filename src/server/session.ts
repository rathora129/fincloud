import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionRecord, SessionUser } from "@/lib/types";
import { sessionSecret } from "./env";
import { effectivePermissionsForUser, getRoleDefinition, isProtectedSuperAdmin } from "./permissions";
import { getStore, makeId } from "./store";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "./session-constants";

export { SESSION_COOKIE, SESSION_TTL_SECONDS };

type SessionPayload = { uid: string; exp: number; sid: string };

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(
  userId: string,
  sessionId: string,
  ttlSeconds = SESSION_TTL_SECONDS,
) {
  const payload: SessionPayload = { uid: userId, exp: Date.now() + ttlSeconds * 1000, sid: sessionId };
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
    if (!payload.sid || typeof payload.sid !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

export function registerSession(userId: string, meta: { ip: string; userAgent: string }) {
  const store = getStore();
  const now = Date.now();
  const retentionFloor = now - 24 * 60 * 60 * 1000;
  store.sessions = store.sessions.filter((session) => new Date(session.expiresAt).getTime() > retentionFloor);

  const session: SessionRecord = {
    id: makeId("ses"),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000).toISOString(),
    revokedAt: null,
    ip: meta.ip,
    userAgent: meta.userAgent.slice(0, 300),
  };
  store.sessions.unshift(session);
  if (store.sessions.length > 500) store.sessions.length = 500;

  return { token: createSessionToken(userId, session.id), session };
}

export function activeSession(sessionId: string, userId: string): SessionRecord | null {
  const session = getStore().sessions.find((item) => item.id === sessionId);
  if (!session || session.userId !== userId || session.revokedAt) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return session;
}

export function revokeSession(sessionId: string) {
  const session = getStore().sessions.find((item) => item.id === sessionId);
  if (!session || session.revokedAt) return false;
  session.revokedAt = new Date().toISOString();
  return true;
}

export function revokeAllUserSessions(userId: string) {
  const now = new Date().toISOString();
  let revoked = 0;
  for (const session of getStore().sessions) {
    if (session.userId === userId && !session.revokedAt) {
      session.revokedAt = now;
      revoked += 1;
    }
  }
  return revoked;
}

export function toSessionUser(userId: string): SessionUser | null {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user || user.status !== "ACTIVE") return null;
  const branch = store.branches.find((b) => b.id === user.branchId);
  const role = getRoleDefinition(user.role);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleName: role?.name ?? user.role,
    designation: user.designation,
    department: user.department,
    branchId: user.branchId,
    branchIds: user.branchIds,
    branchName: branch?.name ?? "Unassigned",
    recordAccess: user.recordAccess,
    permissions: effectivePermissionsForUser(user.id),
    isSuperAdmin: isProtectedSuperAdmin(user.id),
    avatarColor: user.avatarColor,
  };
}

export async function getSessionContext(): Promise<{ user: SessionUser; payload: SessionPayload } | null> {
  const jar = await cookies();
  const payload = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  if (!activeSession(payload.sid, payload.uid)) return null;
  const user = toSessionUser(payload.uid);
  return user ? { user, payload } : null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const context = await getSessionContext();
  return context?.user ?? null;
}

export function sessionCookieHeader(token: string, maxAge = SESSION_TTL_SECONDS) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    "Priority=High",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearedSessionCookieHeader() {
  return sessionCookieHeader("", 0);
}
