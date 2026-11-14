import { scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getStore, appendAudit } from "@/server/store";
import { toSessionUser, createSessionToken, SESSION_COOKIE } from "@/server/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid credentials." } },
        { status: 422 },
      );
    }

    if (rateLimited(`${ip}:${parsed.data.email}`)) {
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a minute and retry." } },
        { status: 429 },
      );
    }

    const store = getStore();
    const user = store.users.find((u) => u.email.toLowerCase() === parsed.data.email);

    if (!user) {
      return Response.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } },
        { status: 401 },
      );
    }

    const provided = Buffer.from(scryptSync(parsed.data.password, "fincloud-demo-salt", 64).toString("hex"));
    const stored = Buffer.from(user.passwordHash);
    const valid = provided.length === stored.length && timingSafeEqual(provided, stored);

    if (!valid) {
      return Response.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } },
        { status: 401 },
      );
    }

    if (user.status !== "ACTIVE") {
      return Response.json(
        { error: { code: "ACCOUNT_INACTIVE", message: "This account is inactive. Contact your administrator." } },
        { status: 403 },
      );
    }

    const sessionUser = toSessionUser(user.id);
    if (!sessionUser) {
      return Response.json({ error: { code: "ACCOUNT_INACTIVE", message: "Account unavailable." } }, { status: 403 });
    }

    user.lastLoginAt = new Date().toISOString();
    appendAudit(store, user.id, "LOGIN", "User session", user.id, "Signed in to the DEMO workspace");

    const response = Response.json({ user: sessionUser });
    response.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${createSessionToken(user.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
        60 * 60 * 8
      }${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return response;
  } catch {
    return Response.json(
      { error: { code: "INTERNAL", message: "Sign-in failed. Please retry." } },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
