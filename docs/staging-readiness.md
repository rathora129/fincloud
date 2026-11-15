# Staging readiness

Status: **prepared, not deployed.** No hosting provider has been configured and no deploy has been run. Deployment requires explicit approval (see §7).

## 1. Runtime contract

| Variable | Development | Staging (isolated demo) | Production |
| --- | --- | --- | --- |
| `FINCLOUD_SESSION_SECRET` | optional (demo secret) | **required**, ≥32 chars | **required**, ≥32 chars |
| `FINCLOUD_STORE_ADAPTER` | optional (`memory`) | `memory` | `postgres` (not implemented yet) |
| `FINCLOUD_ALLOW_EPHEMERAL_STORE` | optional | `true` | must be unset |
| `NODE_ENV` | `development` | `production` | `production` |

Behaviour is fail-closed (`src/server/env.ts`):

- Production without a strong secret → process refuses to start.
- Production without `FINCLOUD_STORE_ADAPTER` → refuses to start (no silent in-memory fallback).
- `memory` in production without `FINCLOUD_ALLOW_EPHEMERAL_STORE=true` → refuses to start.
- `postgres` → refuses to start until the proposed schema is approved and the adapter is implemented.

Generate the secret on the host (do not paste it into chat or commit it):

```bash
openssl rand -base64 48
```

Template: [`.env.example`](../.env.example). Real values belong in the hosting platform's secret store.

## 2. Preflight (run before any deploy)

```bash
npm ci
npm run typecheck
npm run build
npm start            # production server on :3000
node scripts/security-regression.mjs http://localhost:3000
node scripts/browser-smoke.mjs http://localhost:3000
```

Both suites write machine-readable reports to `.artifacts/security/results.json` and `.artifacts/browser/results.json`, exit non-zero on failure, and accept `FINCLOUD_BASE_URL` or a positional URL. The browser suite drives a real headless Chrome via CDP (no Playwright/Puppeteer dependency) and requires Chrome installed on the host.

Expected results at the audited commit: **68/68 security checks**, **42/42 browser checks**.

## 3. Staging configuration (proposed)

- One Node process (`next start`) behind HTTPS. The session cookie is `Secure` in production, so staging must be served over HTTPS; plain HTTP on a remote host will silently drop the cookie and break sign-in.
- Dedicated staging hostname and a dedicated deployment, separate from any client production environment.
- Variables set as platform secrets: `FINCLOUD_SESSION_SECRET`, `FINCLOUD_STORE_ADAPTER=memory`, `FINCLOUD_ALLOW_EPHEMERAL_STORE=true`, `NODE_ENV=production`.
- No `.env` file committed; `.env*.local` and `.data` are ignored by git.

## 4. Data isolation

- The seed is fully synthetic (`src/server/seed.ts`): fictional customers, documents, bank references. No production customer data is loaded.
- The store is in-memory per process; staging data resets on every restart/redeploy. This is intentional for the demo and is acknowledged by `FINCLOUD_ALLOW_EPHEMERAL_STORE=true`.
- Bundled synthetic uploads live under `.data/documents` (mode 0700, files 0600). On an ephemeral filesystem they disappear with the instance; on a shared filesystem the directory must be instance-local and never shared with production.
- Do not point staging at a production database. There is no database driver in the project.

## 5. Post-deploy verification (when approved)

1. `GET /api/health` → `200` and `{"status":"ok","persistence":{"adapter":"memory","ephemeral":true,"environment":"production"}}`. A `503` means misconfiguration.
2. Sign in as a demo user over HTTPS; confirm `Set-Cookie` has `HttpOnly`, `Secure`, `SameSite=Lax`, and no token appears in `document.cookie`.
3. Confirm the DEMO banner and demo profile picker are visible; confirm `/dashboard` redirects when signed out.
4. Run both regression suites against the staging URL.
5. Confirm no secrets are exposed: no `NEXT_PUBLIC_` secret, no `/api/*` response containing env values, health response names the adapter only.

## 6. Known staging limitations

- Single instance only: sessions, rate-limit counters, grants and data are process-local. Multiple replicas would diverge.
- Restart/redeploy resets all accounts, access changes and business records to the seed.
- Login rate limiting is in-memory per instance (8 attempts/minute per IP+email).
- Uploaded files are stored on local disk with no antivirus scanning; content-type is sniffed and size-capped at 5 MB.
- No email/SMS/WhatsApp transport, no eSign, no bureau or payment integrations. UI labels these as awaiting integration.

## 7. Deployment gate

Deployment is **not approved and not performed**. Before deploying, the owner must approve:

- the target host and hostname,
- the staging configuration in §3,
- the secret injection method,
- confirmation that staging is isolated from client production data and infrastructure.

No paid resources, no production database, and no client production environment are used by this milestone.
