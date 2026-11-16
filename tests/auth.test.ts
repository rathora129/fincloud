import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { proxy } from "@/proxy";
import {
  SESSION_COOKIE,
  createSessionToken,
  getSessionUser,
  isEphemeralSessionMode,
  resolveSessionContext,
  sessionState,
  verifySessionToken,
} from "@/server/session";
import { getStore, resetStore } from "@/server/store";
import { storeAdapter } from "@/server/env";
import { __clearCookies, __setCookie } from "./support/next-headers";

const DEMO_PASSWORD = "Fincloud@2026";
const MANAGER_EMAIL = "manager.mumbai@fincloud.demo";
const SUSPENDED_EMAIL = "officer.suspended@fincloud.demo";

let ipCounter = 0;

function fresh() {
  resetStore();
  __clearCookies();
  ipCounter = 0;
}

function userByEmail(email: string) {
  const user = getStore().users.find((entry) => entry.email.toLowerCase() === email);
  assert.ok(user, `seed user ${email} is missing`);
  return user;
}

function login(email = MANAGER_EMAIL, password = DEMO_PASSWORD) {
  ipCounter += 1;
  return loginRoute(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.20.0.${ipCounter}`,
        "user-agent": "fincloud-auth-test",
      },
      body: JSON.stringify({ email, password }),
    }),
  );
}

function sessionCookie(response: Response) {
  const raw = response.headers.getSetCookie().find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(raw, "expected a session Set-Cookie header");
  return { raw, value: raw.split(";")[0].slice(SESSION_COOKIE.length + 1) };
}

test("login signs in an active demo account with a signed HttpOnly cookie", async () => {
  fresh();
  const response = await login();
  assert.equal(response.status, 200);
  const body = (await response.json()) as { user: { email: string; role: string; permissions: string[] } };
  assert.equal(body.user.email, MANAGER_EMAIL);
  assert.equal(body.user.role, "BRANCH_MANAGER");
  assert.ok(Array.isArray(body.user.permissions) && body.user.permissions.length > 0);

  const cookie = sessionCookie(response);
  assert.match(cookie.raw, /HttpOnly/i);
  assert.match(cookie.raw, /SameSite=Lax/i);
  assert.match(cookie.raw, /Max-Age=\d+/i);
  assert.ok(cookie.value.length > 20);
  assert.ok(verifySessionToken(cookie.value), "issued token must verify");
});

test("login rejects wrong passwords and inactive accounts", async () => {
  fresh();
  const wrong = await login(MANAGER_EMAIL, "not-the-password");
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.getSetCookie().length, 0);

  const suspended = await login(SUSPENDED_EMAIL, DEMO_PASSWORD);
  assert.equal(suspended.status, 403);
  assert.equal(suspended.headers.getSetCookie().length, 0);
});

test("session refresh resolves the signed-in user (GET /api/auth/session)", async () => {
  fresh();
  const cookie = sessionCookie(await login());
  __setCookie(SESSION_COOKIE, cookie.value);

  const response = await sessionRoute();
  assert.equal(response.status, 200);
  const body = (await response.json()) as { user: { email: string; role: string; branchId: string } };
  assert.equal(body.user.email, MANAGER_EMAIL);
  assert.equal(body.user.role, "BRANCH_MANAGER");
  assert.equal(body.user.branchId, "br-mumbai");
});

test("login survives a fresh serverless instance that has no session registry", async () => {
  fresh();
  const cookie = sessionCookie(await login());
  const manager = userByEmail(MANAGER_EMAIL);

  // Simulate the next Vercel invocation: same seed data, empty session registry.
  resetStore();
  assert.equal(getStore().sessions.length, 0);

  const context = resolveSessionContext(cookie.value);
  assert.ok(context, "a signed, unexpired token must authenticate on any instance in ephemeral mode");
  assert.equal(context.user.id, manager.id);

  __setCookie(SESSION_COOKIE, cookie.value);
  assert.equal((await sessionRoute()).status, 200, "dashboard/session requests must not bounce to /login");
  const user = await getSessionUser();
  assert.equal(user?.email, MANAGER_EMAIL, "(app) layout gate sees the user and does not redirect");
});

test("invalid, malformed and missing cookies are rejected", async () => {
  fresh();
  const valid = sessionCookie(await login()).value;
  const tampered = `${valid.slice(0, -1)}${valid.endsWith("A") ? "B" : "A"}`;

  __setCookie(SESSION_COOKIE, tampered);
  assert.equal((await sessionRoute()).status, 401);
  assert.equal(resolveSessionContext(tampered), null);

  __setCookie(SESSION_COOKIE, "forged.payload.signature");
  assert.equal((await sessionRoute()).status, 401);

  __setCookie(SESSION_COOKIE, null);
  assert.equal((await sessionRoute()).status, 401);
});

test("expired sessions are rejected even with a valid signature", async () => {
  fresh();
  const manager = userByEmail(MANAGER_EMAIL);
  const expired = createSessionToken(manager.id, "ses-expired", -30);

  assert.ok(verifySessionToken(expired) === null, "expired token must not verify");
  __setCookie(SESSION_COOKIE, expired);
  assert.equal((await sessionRoute()).status, 401);
  assert.equal(resolveSessionContext(expired), null);
});

test("a valid token for an inactive account is rejected", async () => {
  fresh();
  const suspended = userByEmail(SUSPENDED_EMAIL);
  const token = createSessionToken(suspended.id, "ses-inactive");

  assert.ok(verifySessionToken(token), "signature itself is valid");
  __setCookie(SESSION_COOKIE, token);
  assert.equal((await sessionRoute()).status, 401);
  assert.equal(resolveSessionContext(token), null);
});

test("logout revokes the session and clears the browser cookie", async () => {
  fresh();
  const cookie = sessionCookie(await login());
  __setCookie(SESSION_COOKIE, cookie.value);

  const response = await logoutRoute(
    new Request("http://localhost/api/auth/logout", { method: "POST", headers: { "x-forwarded-for": "10.20.9.9" } }),
  );
  assert.equal(response.status, 200);

  const cleared = response.headers.getSetCookie().find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(cleared, "logout must emit a clearing Set-Cookie header");
  assert.match(cleared!, new RegExp(`^${SESSION_COOKIE}=;`));
  assert.match(cleared!, /Max-Age=0/i);
  assert.match(cleared!, /Expires=Thu, 01 Jan 1970/i);

  __setCookie(SESSION_COOKIE, cookie.value);
  assert.equal(
    (await sessionRoute()).status,
    401,
    "a replayed pre-logout cookie must fail on the instance that recorded the revocation",
  );
});

test("logout clears the cookie even without a resolvable session", async () => {
  fresh();
  __setCookie(SESSION_COOKIE, "garbage.token");
  const response = await logoutRoute(new Request("http://localhost/api/auth/logout", { method: "POST" }));
  assert.equal(response.status, 200);
  const cleared = response.headers.getSetCookie().find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  assert.match(cleared ?? "", /Max-Age=0/i);
});

test("session state distinguishes active, revoked and missing records", async () => {
  fresh();
  const cookie = sessionCookie(await login());
  const payload = verifySessionToken(cookie.value);
  assert.ok(payload);
  const manager = userByEmail(MANAGER_EMAIL);

  assert.equal(sessionState(payload!.sid, manager.id), "active");
  assert.equal(sessionState(payload!.sid, userByEmail(SUSPENDED_EMAIL).id), "revoked");
  assert.equal(sessionState("ses-never-issued", manager.id), "missing");
});

test("stateless acceptance is limited to the explicitly ephemeral demo store", () => {
  const saved = {
    nodeEnv: process.env.NODE_ENV,
    adapter: process.env.FINCLOUD_STORE_ADAPTER,
    allow: process.env.FINCLOUD_ALLOW_EPHEMERAL_STORE,
    phase: process.env.NEXT_PHASE,
  };
  const mutableEnv = process.env as Record<string, string | undefined>;
  try {
    mutableEnv.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    delete process.env.FINCLOUD_STORE_ADAPTER;
    delete process.env.FINCLOUD_ALLOW_EPHEMERAL_STORE;

    assert.throws(() => storeAdapter(), /FINCLOUD_STORE_ADAPTER/);

    process.env.FINCLOUD_STORE_ADAPTER = "memory";
    assert.throws(() => storeAdapter(), /FINCLOUD_ALLOW_EPHEMERAL_STORE/);

    process.env.FINCLOUD_ALLOW_EPHEMERAL_STORE = "true";
    assert.equal(storeAdapter(), "memory");
    assert.equal(isEphemeralSessionMode(), true);
  } finally {
    if (saved.nodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = saved.nodeEnv;
    for (const [key, value] of [
      ["FINCLOUD_STORE_ADAPTER", saved.adapter],
      ["FINCLOUD_ALLOW_EPHEMERAL_STORE", saved.allow],
      ["NEXT_PHASE", saved.phase],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(isEphemeralSessionMode(), true, "test process runs the memory demo store");
});

test("dashboard navigation redirects anonymous visitors and passes signed sessions", async () => {
  fresh();

  const anonymous = proxy(new NextRequest("http://localhost:3100/dashboard?tab=all"));
  assert.equal(anonymous.status, 307);
  const location = new URL(anonymous.headers.get("location") ?? "");
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("next"), "/dashboard?tab=all");

  const publicPage = proxy(new NextRequest("http://localhost:3100/login"));
  assert.equal(publicPage.status, 200);

  const cookie = sessionCookie(await login());
  const authenticated = proxy(
    new NextRequest("http://localhost:3100/dashboard", {
      headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` },
    }),
  );
  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.headers.get("x-middleware-next"), "1");
});
