import { getSessionUser, SESSION_COOKIE } from "@/server/session";
import { appendAudit, getStore } from "@/server/store";

export async function POST() {
  const user = await getSessionUser();
  if (user) {
    appendAudit(getStore(), user.id, "LOGOUT", "User session", user.id, "Signed out of the DEMO workspace");
  }
  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return response;
}

export const runtime = "nodejs";
