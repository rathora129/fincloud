# Production-readiness audit — final report

Date: 2026-11-16
Scope: audit and harden the existing FinCloud LMS demo without rebuilding modules or replacing working functionality.
Environment: local production build and local dev server. **Nothing was deployed. No production data, database, or paid resource was used.**

## 1. Completed in this milestone

| Area | Delivered |
| --- | --- |
| Persistence strategy | Fail-closed adapter selection in `src/server/env.ts`; `GET /api/health` reports adapter + ephemeral flag; proposal documented in `docs/database-persistence.md`. No schema was applied. |
| Auth hardening | HttpOnly/SameSite/Secure cookie, 8h expiry, HMAC signing, server-side session registry with revocation on logout and deactivation, replayed and forged cookies rejected, 8/min login rate limit, CSRF origin guard for mutating requests, generic login errors. |
| Access control | Existing hybrid RBAC + grants retained; **authorization now runs before body validation** on role and grant creation; regression suite proves SA protection, self-escalation block, admin-authority separation, DENY precedence, temporary access, revocation and append-only audit. |
| Workflows | Sanction creation from credit-approved applications and disbursement creation from approved sanctions, both amount-capped and permission-checked; repayment and closure behavior verified. |
| File management | Private local storage (`.data/documents`, 0700/0600), 5 MB cap, magic-byte sniffing, MIME match, sanitized names, UUID filenames, sha256, authorized streaming downloads with `private, no-store` and `nosniff`, record-scope IDOR checks, locked post-decision files. |
| Browser testing | Real headless Chrome via CDP; 42/42 checks. |
| Security testing | 68/68 HTTP checks. |
| Staging preparation | `.env.example`, `docs/staging-readiness.md`, preflight and post-deploy verification, explicit deployment gate. |

## 2. Pending / approval required

| Item | Status | Why it is pending |
| --- | --- | --- |
| PostgreSQL schema and adapter | Proposal only | Requires explicit approval before any migration; no production database exists. |
| Staging deployment | Prepared, not executed | Requires owner approval of host, secret injection and isolation. |
| Password recovery / reset-token lifecycle | Not implemented | Needs an email transport; no fake delivery was created. |
| MFA / SSO | Not implemented | Out of demo scope; reported as a gap. |
| Email/SMS/WhatsApp notifications | Not implemented | External transport required; UI marks awaiting integration. |
| eSign, bureau, payment gateway | Not implemented | Explicitly excluded to avoid simulating financial transactions. |
| Server-side pagination for large sets | Not implemented | Current datasets fit in memory. |

Password recovery is the one item in the requested auth-hardening list that remains open; all other listed controls are implemented and tested.

## 3. Database readiness

- **Current state:** no driver, ORM, migrations or `DATABASE_URL`; all state is `globalThis.__fincloudLmsStore` rebuilt from the seed.
- **No silent fallback:** production refuses to start when the adapter is unset, when it is `memory` without `FINCLOUD_ALLOW_EPHEMERAL_STORE=true`, or when it is `postgres` (adapter not implemented).
- **Proposed model:** documented in `docs/database-persistence.md` — users, roles, role permissions, branch/department scopes, grants (scope, effect, mode, expiry, revocation), append-only permission audits, plus existing business aggregates. Immutable audit and transactional multi-entity writes are specified.
- **Action taken:** documentation and fail-closed guard only. **No schema change and no migration were made.**

## 4. Security findings

Resolved during the audit:

1. `POST /api/access-control/roles` and `/grants` validated the request body before checking authorization, returning `422` to unauthorised callers and leaking schema expectations. Fixed by asserting `roles:manage` / `access:manage` immediately after session resolution. Both routes now return `403` for a branch manager.
2. Access-control documentation claimed binary uploads were unimplemented; private document storage is now implemented and documented.

Verified and unchanged:

- Anonymous API calls return `401`; protected pages redirect to `/login`.
- Cross-site mutations are blocked (`CSRF_BLOCKED`); cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production, and absent from `document.cookie`.
- Logout revokes the server-side session; replaying the old cookie fails. Forged signatures fail.
- Login rate limiting returns `429` after repeated failures.
- Branch scope blocks cross-branch reads, exports and document downloads (`OUT_OF_SCOPE`).
- Protected Super Admin cannot be modified, deactivated or targeted by grants (`PROTECTED_IDENTITY`); self-restriction is blocked (`SELF_ESCALATION`); administrative authority permissions cannot be delegated by a non-SA admin (`ADMIN_AUTHORITY_SEPARATION`).
- DENY overrides role ALLOW; revocation restores access; past expiry is rejected.
- Permission audit is append-only: new entries are added, prior IDs remain, `POST`/`DELETE` are rejected with `405`.
- Upload rejects disguised content (`415`), oversize (`413`) and replacement of verified files (`409`).

Accepted limitations:

- CSRF protection relies on `Origin` verification plus `SameSite=Lax` rather than per-request tokens; adequate for this same-origin JSON API, but token-based CSRF would be considered for a multi-origin deployment.
- Rate limiting and sessions are process-local; multiple replicas would not share state.
- No antivirus scan on uploads.
- No password recovery, MFA or SSO yet.

## 5. Browser verification (real interaction)

Suite: `scripts/browser-smoke.mjs` — headless system Chrome over CDP, real mouse clicks, real keystrokes, screenshots in `.artifacts/browser/`.

**42/42 passed**, including:

- invalid-email inline validation; manager sign-in through the real form;
- cookie flags and absence of the token in `document.cookie`;
- Chart.js canvas rendering and permission-scoped sidebar;
- table search filtering and row navigation to the loan file;
- mobile 390×844 layout with off-canvas sidebar that opens and closes;
- sanction modal opening, amount validation and clean cancel; disbursement guard when no approved sanction exists;
- Access Control Center tabs, permission checkbox toggling, custom role creation, role permission edit, grant modal record-scope fields, user-comparison diff and access history;
- secure logout clearing the cookie; no uncaught exceptions and no 5xx responses.

SSR output was not treated as proof: every assertion above was made after driving the hydrated UI.

## 6. HTTP security verification

Suite: `scripts/security-regression.mjs` — real sessions over HTTP against the running server.

**68/68 passed.** Covers auth, cookie flags, CSRF, session revocation, forged cookies, rate limiting, RBAC, branch scope, protected identity, escalation, admin-authority separation, grant lifecycle, DENY precedence, temporary access, audit immutability and document IDOR.

## 7. Workflow verification

- Lead → application conversion and assignment paths are unchanged; their permission and state gates were verified by code inspection and the earlier milestone tests.
- Credit approve/send-back unchanged; sanction creation is limited to credit-approved applications and to the approved amount (HTTP-verified; the browser suite opens the modal and validates the amount field).
- Disbursement creation is limited to approved sanctions and capped by the sanctioned amount; the browser suite confirms the UI is guarded when no approved sanction is pending.
- Repayment recording and zero-balance closure logic are unchanged from the previously verified milestone.
- Collection and recovery transitions remain permission-gated.
- No external financial transaction is simulated; all references are synthetic and labelled DEMO.

## 8. Deployment status

**Not deployed.** No hosting provider, DNS, secret or environment was configured. Staging configuration and the approval gate are in `docs/staging-readiness.md`. Deployment requires explicit approval of target, configuration, secret injection and data isolation.

## 9. Known issues

1. **In-memory store resets on restart** — intentional for the demo; blocks production until the PostgreSQL adapter is approved and implemented.
2. **Single instance only** — sessions, rate limits, grants and data are process-local.
3. **Turbopack HMR reload loop** — during development, a stale dev-server watcher caused repeated `HMR hash mismatch` reloads and prevented hydration. Restarting `npm run dev` resolved it; it is a local tooling issue, not an application defect. Tests should run against a freshly started dev server or a production build.
4. **Password recovery / MFA absent** — see §2.
5. **Uploads are local-disk** — on ephemeral hosting they disappear with the instance; no object storage or antivirus.
6. **No server-side pagination** — large real datasets would need it before production.

## Reproduce

```bash
npm run typecheck && npm run build
npm start
node scripts/security-regression.mjs http://localhost:3000
node scripts/browser-smoke.mjs http://localhost:3000
```
