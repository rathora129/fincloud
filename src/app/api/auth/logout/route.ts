import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  clearedSessionCookieHeader,
  getSessionUser,
  revokeSession,
  verifySessionToken,
} from "@/server/session";
import { appendAudit, getStore } from "@/server/store";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const jar = await cookies();
  const payload = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  const user = await getSessionUser();

  if (payload) {
    revokeSession(payload.sid);
  }
  if (user) {
    appendAudit(getStore(), user.id, "LOGOUT", "User session", user.id, "Signed out and revoked the session", ip);
  }

  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", clearedSessionCookieHeader());
  return response;
}

export const runtime = "nodejs";
