#!/usr/bin/env node
/**
 * HTTP security regression for the FinCloud LMS demo.
 *
 * Exercises the same API surface the browser uses: authentication, cookie
 * flags, session revocation, CSRF, branch/record scoping, protected Super
 * Admin identity, escalation guards, grants/DENY precedence, temporary
 * access, audit append-only behaviour and document IDOR.
 *
 * Usage: node scripts/security-regression.mjs [baseUrl]
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = (process.argv[2] ?? process.env.FINCLOUD_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = "Fincloud@2026";
const ARTIFACTS = path.resolve(".artifacts/security");

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail: detail ?? null });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${!pass && detail ? ` — ${detail}` : ""}`);
}

class Client {
  constructor(label) {
    this.label = label;
    this.cookie = "";
    this.user = null;
  }

  async login(email, { ip = "10.0.0.10", password = PASSWORD } = {}) {
    const res = await request(null, "/api/auth/login", {
      method: "POST",
      json: { email, password },
      headers: { "X-Forwarded-For": ip },
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const sessionCookie = setCookies.find((value) => value.startsWith("fincloud_session="));
    if (sessionCookie) this.cookie = sessionCookie.split(";")[0];
    this.user = res.json?.user ?? null;
    return res;
  }

  req(pathname, options = {}) {
    return request(this, pathname, options);
  }
}

async function request(client, pathname, options = {}) {
  const { method = "GET", json, form, headers = {}, origin = BASE, redirect = "follow" } = options;
  const finalHeaders = { ...headers };
  if (client?.cookie) finalHeaders.Cookie = client.cookie;
  let body;
  if (json !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  if (method !== "GET" && origin !== null) finalHeaders.Origin = origin;
  const res = await fetch(`${BASE}${pathname}`, { method, headers: finalHeaders, body, redirect });
  let parsed = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  return { status: res.status, headers: res.headers, json: parsed, text };
}

function expectStatus(name, res, expected, note) {
  const pass = Array.isArray(expected) ? expected.includes(res.status) : res.status === expected;
  const code = res.json?.error?.code ?? res.json?.error?.message ?? "";
  check(name, pass, `status=${res.status}${code ? ` code=${code}` : ""}${note ? ` · ${note}` : ""}`);
  return res;
}

function expectCode(name, res, expectedStatus, expectedCode) {
  const pass = res.status === expectedStatus && res.json?.error?.code === expectedCode;
  check(name, pass, `status=${res.status} code=${res.json?.error?.code ?? "none"}`);
  return res;
}

async function main() {
  await mkdir(ARTIFACTS, { recursive: true });
  console.log(`FinCloud LMS security regression → ${BASE}`);

  const health = await request(null, "/api/health");
  check("health endpoint responds", health.status === 200, `status=${health.status}`);
  check(
    "store adapter is reported explicitly (no silent fallback)",
    Boolean(health.json?.persistence?.adapter),
    JSON.stringify(health.json?.persistence ?? {}),
  );

  /* ---------------- unauthenticated surface ---------------- */
  const anon = new Client("anon");
  expectStatus("unauthenticated leads API is rejected", await anon.req("/api/leads"), 401);
  expectStatus("unauthenticated access-control API is rejected", await anon.req("/api/access-control"), 401);
  expectStatus("unauthenticated application detail is rejected", await anon.req("/api/applications/app-0003"), 401);
  expectStatus("unauthenticated document upload is rejected", await anon.req("/api/applications/app-0003/documents/doc-3-1/file", { method: "POST", form: new FormData() }), 401);

  const dashboard = await request(null, "/dashboard", { redirect: "manual" });
  check(
    "protected page redirects anonymous visitors to login",
    [302, 303, 307, 308].includes(dashboard.status) && (dashboard.headers.get("location") ?? "").includes("/login"),
    `status=${dashboard.status} location=${dashboard.headers.get("location") ?? "none"}`,
  );

  const csrf = await request(null, "/api/leads", {
    method: "POST",
    json: { name: "CSRF probe" },
    origin: "https://evil.example",
  });
  expectCode("cross-site mutation is blocked by CSRF guard", csrf, 403, "CSRF_BLOCKED");

  /* ---------------- sessions ---------------- */
  const manager = new Client("manager-mumbai");
  const managerLogin = await manager.login("manager.mumbai@fincloud.demo");
  expectStatus("manager signs in", managerLogin, 200);
  const setCookie = (managerLogin.headers.getSetCookie?.() ?? []).join(" ");
  check("session cookie is HttpOnly", /HttpOnly/i.test(setCookie), setCookie ? "flag present" : "missing Set-Cookie");
  check("session cookie is SameSite", /SameSite=(Lax|Strict)/i.test(setCookie), "SameSite flag");
  check("session cookie has an expiry", /Max-Age=\d+/i.test(setCookie) || /Expires=/i.test(setCookie), "expiry flag");

  expectStatus("session endpoint resolves the signed-in user", await manager.req("/api/auth/session"), 200);

  const oldCookie = manager.cookie;
  expectStatus("logout succeeds", await manager.req("/api/auth/logout", { method: "POST", json: {} }), 200);
  expectStatus("session is revoked server-side after logout", await manager.req("/api/leads"), 401);
  const replay = await request({ cookie: oldCookie }, "/api/leads");
  expectStatus("replayed pre-logout cookie is rejected", replay, 401);
  const forged = await request({ cookie: "fincloud_session=forged.payload.signature" }, "/api/leads");
  expectStatus("forged session cookie is rejected", forged, 401);

  /* ---------------- login hardening ---------------- */
  const weakLogin = await request(null, "/api/auth/login", { method: "POST", json: { email: "not-an-email", password: "" } });
  expectStatus("malformed login payload is rejected", weakLogin, 422);

  let sawRateLimit = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const res = await request(null, "/api/auth/login", {
      method: "POST",
      json: { email: "rate-limit-probe@fincloud.demo", password: "wrong-password" },
      headers: { "X-Forwarded-For": "203.0.113.77" },
    });
    if (res.status === 429) {
      sawRateLimit = true;
      check("login rate limiting engages after repeated failures", true, `attempt=${attempt + 1}`);
      break;
    }
  }
  if (!sawRateLimit) check("login rate limiting engages after repeated failures", false, "no 429 within 10 attempts");

  /* ---------------- signed-in actors ---------------- */
  const admin = new Client("admin");
  expectStatus("admin signs in", await admin.login("admin@fincloud.demo", { ip: "10.0.0.11" }), 200);
  const superadmin = new Client("superadmin");
  expectStatus("super admin signs in", await superadmin.login("superadmin@fincloud.demo", { ip: "10.0.0.12" }), 200);
  const pune = new Client("manager-pune");
  expectStatus("Pune branch manager signs in", await pune.login("manager.pune@fincloud.demo", { ip: "10.0.0.13" }), 200);
  const officer = new Client("officer-mumbai");
  expectStatus("Mumbai loan officer signs in", await officer.login("officer.mumbai@fincloud.demo", { ip: "10.0.0.14" }), 200);
  const manager2 = new Client("manager-mumbai-2");
  expectStatus("manager signs in for scope tests", await manager2.login("manager.mumbai@fincloud.demo", { ip: "10.0.0.15" }), 200);

  /* ---------------- permission + scope enforcement ---------------- */
  expectStatus("branch manager cannot open the access-control API", await manager2.req("/api/access-control"), 403);
  expectStatus("loan officer cannot open the access-control API", await officer.req("/api/access-control"), 403);
  expectStatus("loan officer cannot export reports without reports:export", await officer.req("/api/exports/applications?format=csv"), 403);
  expectStatus("branch manager cannot create roles", await manager2.req("/api/access-control/roles", { method: "POST", json: {} }), 403);
  expectStatus("branch manager cannot create grants", await manager2.req("/api/access-control/grants", { method: "POST", json: {} }), 403);
  expectStatus(
    "branch manager cannot PATCH user records",
    await manager2.req("/api/users/usr-006", { method: "PATCH", json: { action: "SET_STATUS", status: "INACTIVE" } }),
    403,
  );

  const adminApps = await admin.req("/api/applications");
  const apps = adminApps.json?.items ?? [];
  const mumbaiApps = apps.filter((app) => app.branchId === "br-mumbai");
  const puneApps = apps.filter((app) => app.branchId === "br-pune");
  check("applications API returns scoped rows for admin", apps.length > 0, `rows=${apps.length}`);

  const puneApp = puneApps[0];
  const mumbaiApp = mumbaiApps.find((app) => app.status === "NEW") ?? mumbaiApps[0];
  expectCode("Mumbai manager cannot read a Pune application (branch scope)", await manager2.req(`/api/applications/${puneApp.id}`), 403, "OUT_OF_SCOPE");
  expectCode("Pune manager cannot read a Mumbai application (branch scope)", await pune.req(`/api/applications/${mumbaiApp.id}`), 403, "OUT_OF_SCOPE");
  expectStatus(
    "branch-scoped export cannot be widened to another branch",
    await pune.req("/api/exports/applications?format=csv&branch=br-mumbai"),
    403,
  );

  /* ---------------- protected identity + escalation ---------------- */
  const access = await admin.req("/api/access-control");
  expectStatus("admin can read the access center", access, 200);
  const users = access.json?.users ?? [];
  const roles = access.json?.roles ?? [];
  const protectedId = access.json?.protectedSuperAdminId;
  const byEmail = (email) => users.find((user) => user.email === email);
  const officerUser = byEmail("officer.mumbai@fincloud.demo");
  const managerUser = byEmail("manager.mumbai@fincloud.demo");
  const adminUser = byEmail("admin@fincloud.demo");
  const adminRole = roles.find((role) => role.code === adminUser?.role);
  check("access center exposes the protected Super Admin identity", Boolean(protectedId), protectedId ?? "missing");

  const reason = "Security regression check with an auditable justification.";
  const baseGrant = {
    subjectId: officerUser.id,
    permission: "reports:export",
    effect: "ALLOW",
    scopeType: "GLOBAL",
    mode: "DIRECT",
    reason,
    expiresAt: null,
  };

  expectCode(
    "admin cannot grant administrative authority permissions",
    await admin.req("/api/access-control/grants", { method: "POST", json: { ...baseGrant, permission: "access:manage" } }),
    403,
    "ADMIN_AUTHORITY_SEPARATION",
  );
  expectCode(
    "admin cannot modify the protected Super Admin via grants",
    await admin.req("/api/access-control/grants", { method: "POST", json: { ...baseGrant, subjectId: protectedId, permission: "leads:view" } }),
    403,
    "PROTECTED_IDENTITY",
  );
  expectCode(
    "admin cannot restrict their own access",
    await admin.req("/api/access-control/grants", {
      method: "POST",
      json: { ...baseGrant, subjectId: adminUser.id, effect: "DENY", permission: "leads:view" },
    }),
    403,
    "SELF_ESCALATION",
  );
  expectCode(
    "admin cannot deactivate the protected Super Admin",
    await admin.req(`/api/users/${protectedId}`, { method: "PATCH", json: { action: "SET_STATUS", status: "INACTIVE" } }),
    403,
    "PROTECTED_IDENTITY",
  );
  expectCode(
    "admin cannot create any role (lacks roles:manage)",
    await admin.req("/api/access-control/roles", {
      method: "POST",
      json: {
        code: `QA_GLOBAL_${Date.now()}`,
        name: "QA Global Probe",
        shortLabel: "QA Global",
        description: "Attempted global role created by a security regression run.",
        rank: Math.min(100, (adminRole?.rank ?? 80) + 1),
        isGlobal: true,
        permissions: ["dashboard:view"],
      },
    }),
    403,
    "FORBIDDEN",
  );

  /* ---------------- grant lifecycle, DENY precedence, temporary access ---------------- */
  const historyBefore = await admin.req("/api/access-control/history");
  expectStatus("permission audit history is readable by admin", historyBefore, 200);
  const beforeIds = new Set((historyBefore.json?.audits ?? []).map((entry) => entry.id));

  const allowGrant = await admin.req("/api/access-control/grants", { method: "POST", json: baseGrant });
  expectStatus("admin grants an allowed permission within their authority", allowGrant, 201);
  const allowGrantId = allowGrant.json?.grant?.id;
  check("grant is recorded with a reason", allowGrant.json?.grant?.reason === reason, allowGrant.json?.grant?.reason ?? "missing");
  expectStatus("granted user can now use the endpoint", await officer.req("/api/exports/applications?format=csv"), 200);

  const historyAfter = await admin.req("/api/access-control/history");
  const afterAudits = historyAfter.json?.audits ?? [];
  check("new grant appends an audit entry", afterAudits.length > beforeIds.size, `before=${beforeIds.size} after=${afterAudits.length}`);
  check(
    "previous audit entries remain intact",
    [...beforeIds].every((id) => afterAudits.some((entry) => entry.id === id)),
    `${beforeIds.size} prior entries`,
  );
  expectStatus("audit history rejects POST mutations", await admin.req("/api/access-control/history", { method: "POST", json: {} }), 405);
  expectStatus("audit history rejects DELETE mutations", await admin.req("/api/access-control/history", { method: "DELETE" }), 405);

  expectStatus(
    "grant revocation succeeds",
    await admin.req(`/api/access-control/grants/${allowGrantId}/revoke`, { method: "POST", json: { reason: "Regression run cleanup after verifying access." } }),
    200,
  );
  expectStatus("revoked grant no longer applies", await officer.req("/api/exports/applications?format=csv"), 403);

  const denyGrant = await admin.req("/api/access-control/grants", {
    method: "POST",
    json: { ...baseGrant, subjectId: managerUser.id, permission: "leads:view", effect: "DENY" },
  });
  expectStatus("admin can issue an explicit DENY grant below their rank", denyGrant, 201);
  const denyGrantId = denyGrant.json?.grant?.id;
  expectStatus("DENY overrides the role ALLOW for leads:view", await manager2.req("/api/leads"), 403);
  await admin.req(`/api/access-control/grants/${denyGrantId}/revoke`, {
    method: "POST",
    json: { reason: "Regression run cleanup after verifying DENY precedence." },
  });
  expectStatus("access is restored after the DENY is revoked", await manager2.req("/api/leads"), 200);

  expectCode(
    "temporary access with a past expiry is rejected",
    await admin.req("/api/access-control/grants", {
      method: "POST",
      json: { ...baseGrant, permission: "reports:view", expiresAt: new Date(Date.now() - 3_600_000).toISOString() },
    }),
    422,
    "INVALID_EXPIRY",
  );

  const tempGrant = await admin.req("/api/access-control/grants", {
    method: "POST",
    json: { ...baseGrant, permission: "reports:view", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
  });
  expectStatus("future-dated temporary access is accepted", tempGrant, 201);
  if (tempGrant.json?.grant?.id) {
    await admin.req(`/api/access-control/grants/${tempGrant.json.grant.id}/revoke`, {
      method: "POST",
      json: { reason: "Regression run cleanup of temporary access grant." },
    });
  }

  /* ---------------- document storage + IDOR ---------------- */
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
  const candidateDocs = [];
  const lockedApp = mumbaiApps.find((app) => app.status === "CREDIT_APPROVED" || app.status === "SANCTIONED" || app.status === "DISBURSED");
  for (const app of mumbaiApps) {
    if (!["NEW", "IN_PROCESS", "SENT_BACK"].includes(app.status)) continue;
    const detail = await manager2.req(`/api/applications/${app.id}`);
    if (detail.status !== 200) continue;
    for (const doc of detail.json?.application?.documents ?? []) {
      candidateDocs.push({ appId: app.id, docId: doc.id, fileId: doc.fileId, status: doc.status });
    }
  }
  const freeDocs = candidateDocs.filter((doc) => !doc.fileId && doc.status !== "VERIFIED");
  check("workable applications expose uploadable documents", freeDocs.length >= 2, `candidates=${freeDocs.length}`);

  if (freeDocs.length >= 1) {
    const target = freeDocs[0];
    const upload = await uploadDocument(manager2, target.appId, target.docId, pdf, "../../QA<script>.pdf", "application/pdf");
    expectStatus("authorized PDF upload succeeds", upload, 201);
    check(
      "uploaded filename is sanitized",
      upload.json?.item?.originalName === "QA_script_.pdf",
      upload.json?.item?.originalName ?? "missing",
    );
    check("upload response exposes a private file id", Boolean(upload.json?.item?.fileId), upload.json?.item?.fileId ?? "missing");

    const download = await fetch(`${BASE}/api/applications/${target.appId}/documents/${target.docId}/file`, {
      headers: { Cookie: manager2.cookie },
    });
    const bytes = Buffer.from(await download.arrayBuffer());
    check("authorized download returns the stored bytes", download.status === 200 && bytes.equals(pdf), `status=${download.status} bytes=${bytes.length}`);
    check(
      "download response is private and not sniffed",
      (download.headers.get("cache-control") ?? "").includes("no-store") && download.headers.get("x-content-type-options") === "nosniff",
      `cache-control=${download.headers.get("cache-control")} nosniff=${download.headers.get("x-content-type-options")}`,
    );

    const idor = await fetch(`${BASE}/api/applications/${target.appId}/documents/${target.docId}/file`, {
      headers: { Cookie: pune.cookie },
    });
    check("cross-branch document download is denied", [403, 404].includes(idor.status), `status=${idor.status}`);

    const anonFile = await fetch(`${BASE}/api/applications/${target.appId}/documents/${target.docId}/file`);
    check("unauthenticated document download is denied", anonFile.status === 401, `status=${anonFile.status}`);
  }

  if (freeDocs.length >= 2) {
    const target = freeDocs[1];
    const rejected = await uploadDocument(manager2, target.appId, target.docId, Buffer.from("not a real file"), "fake.pdf", "application/pdf");
    expectCode("content sniffing rejects a disguised file", rejected, 415, "UNSUPPORTED_FILE");
  }

  if (freeDocs.length >= 3) {
    const target = freeDocs[2];
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0x25);
    const res = await uploadDocument(manager2, target.appId, target.docId, oversized, "huge.pdf", "application/pdf");
    expectCode("oversized uploads are rejected", res, 413, "FILE_TOO_LARGE");
  }

  const verifiedDoc = candidateDocs.find((doc) => doc.status === "VERIFIED" && !doc.fileId);
  if (verifiedDoc) {
    const res = await uploadDocument(manager2, verifiedDoc.appId, verifiedDoc.docId, pdf, "verified.pdf", "application/pdf");
    check("verified documents cannot be replaced", res.status === 409, `status=${res.status} code=${res.json?.error?.code ?? "none"}`);
  }

  if (lockedApp) {
    const detail = await admin.req(`/api/applications/${lockedApp.id}`);
    const docs = detail.json?.application?.documents ?? [];
    const doc = docs.find((item) => !item.fileId);
    if (doc) {
      const res = await uploadDocument(manager2, lockedApp.id, doc.id, pdf, "locked.pdf", "application/pdf");
      expectCode("post-decision applications are locked for uploads", res, 409, "LOCKED_APPLICATION");
    }
  }

  /* ---------------- summary ---------------- */
  const passed = checks.filter((item) => item.pass).length;
  const failed = checks.length - passed;
  await writeFile(
    path.join(ARTIFACTS, "results.json"),
    JSON.stringify({ baseUrl: BASE, ranAt: new Date().toISOString(), passed, failed, checks }, null, 2),
  );
  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed}/${checks.length} security checks passed`);
  console.log(`Report: ${path.relative(process.cwd(), path.join(ARTIFACTS, "results.json"))}`);
  if (failed > 0) process.exitCode = 1;
}

async function uploadDocument(client, appId, docId, bytes, filename, declaredMime) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], filename, { type: declaredMime }));
  return client.req(`/api/applications/${appId}/documents/${docId}/file`, { method: "POST", form });
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.message}`);
  process.exitCode = 1;
});
