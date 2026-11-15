# Implementation checklist

Status as of 2026-11-15. Items marked **approval required** have deliberately not been applied.

## 1. Delivered

- [x] Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 design tokens, Redux Toolkit, RHF + Zod, TanStack Table, Chart.js, Framer Motion, Lucide.
- [x] Official logo served locally from `public/assets/brand/fincloud-logo.png` (never hotlinked or altered); favicon at `src/app/icon.png`.
- [x] Full lifecycle modules: Leads → Applications → Credit → Sanctions → Disbursements → Repayments → Collections → Recovery → Closure.
- [x] Customer 360 twelve-tab aggregation.
- [x] Reports/MIS with server-side filters, print view, CSV and SpreadsheetML exports.
- [x] Enterprise shell: collapsible sidebar, permission-aware navigation, global search, notifications, profile menu, consistent loading/empty/error/permission states.
- [x] DEMO labelling at integration boundaries; synthetic data only; no external calls.
- [x] Authentication: scrypt password hashes, HttpOnly HMAC-signed session cookie, 8h expiry, SameSite=Lax, Secure in production, in-memory login rate limit.
- [x] Hybrid access control: configurable roles, direct user grants, temporary/expiring grants, explicit denials, branch/department/record scopes, delegation with expiry caps, protected Super Admin identity.
- [x] Central permission engine with fail-closed evaluation and DENY precedence.
- [x] Record-level enforcement across lists, details, mutations, dashboards, shell badges, search, reports and CSV exports.
- [x] Access Control Center at `/access-control`: user access, roles & matrix, grants & delegation, access history, user comparison, effective-permission preview.
- [x] Permission audit trail: actor, target, before/after, reason, IP, expiry; read-only over HTTP.
- [x] Privilege-escalation protections: self-change block, protected identity lock, rank hierarchy, permission-subset checks, admin-authority separation, delegation cycle detection.
- [x] `npm run typecheck` clean; `npm run build` succeeds.
- [x] Authorization matrix exercised over HTTP with real sessions (see `access-control.md` §8).

## 2. Verification notes

- `npm run typecheck` and `npm run build` pass.
- `scripts/security-regression.mjs` — **68/68** HTTP checks: anonymous rejection, CSRF origin block, cookie flags, server-side session revocation, forged-session rejection, login rate limiting, RBAC 403s, branch scoping, protected Super Admin, self-escalation and admin-authority separation, grant lifecycle (ALLOW → revoke → DENY → expiry), append-only audit, and document upload/download IDOR. Report: `.artifacts/security/results.json`.
- `scripts/browser-smoke.mjs` — **42/42** real-browser checks in headless Chrome via CDP: form validation, sign-in, HttpOnly cookie unattached to `document.cookie`, canvas charts, sidebar permissions, table search and row navigation, modals and form validation, grant modal record-scope fields, user comparison diff, access history, mobile off-canvas navigation, secure logout. Report: `.artifacts/browser/results.json`.
- Authorization now runs **before** body validation on `POST /api/access-control/roles` and `/grants`, so unauthorised callers receive `403` rather than schema feedback.

## 3. Awaiting approval

- [ ] **Production database schema.** No schema was changed. The relational model for roles, role permissions, user branch scopes, access grants and append-only permission audits is proposed in `docs/database-persistence.md`. A migration must not be written until explicitly approved.
- [ ] **Staging deployment.** Configuration and preflight are documented in `docs/staging-readiness.md`; nothing has been deployed.
- [ ] **Email/notification on access changes.** Requires a transport; currently no message is sent.
- [ ] **Custom permission creation.** Roles can be customized; the permission catalogue is fixed.

## 4. External integrations (intentionally not simulated)

- [ ] eSign provider callbacks and signed artefacts.
- [ ] Credit bureau and fraud APIs.
- [ ] Payment gateway, NACH mandates and bank disbursement files.
- [ ] WhatsApp / SMS / email delivery.
- [ ] Customer master editing and free-text notes.
- [ ] Password recovery, SSO, MFA.
- [ ] Server-side pagination for large audit/user sets and asynchronous export jobs.

Completed in the production-readiness milestone (not external integrations):
- [x] Sanction creation from a credit-approved application (`POST /api/sanctions`, `sanctions:decide`, amount capped by the credit decision).
- [x] Disbursement creation from an approved sanction (`POST /api/disbursements`, `disbursements:process`, amount capped by the sanction).
- [x] Application status follows the loan to `CLOSED` when the outstanding balance reaches zero.
- [x] Server-side session registry with revocation on logout and on user deactivation.
- [x] Fail-closed storage adapter selection with no silent in-memory fallback in production.
- [x] CSRF origin enforcement for mutating requests and Secure cookies in production.
- [x] Private binary document storage with content sniffing, size limits, sanitized names, checksums and authorised streaming downloads.
- [x] Real-browser and HTTP security regression suites.

Missing integrations are marked as awaiting backend in the UI; no fake success responses are returned.

## 5. Operational notes

- All demo state is in memory (`globalThis.__fincloudLmsStore`) and resets on process restart.
- Production refuses to start without `FINCLOUD_SESSION_SECRET` (≥32 chars) and an explicit `FINCLOUD_STORE_ADAPTER`; see `database-persistence.md`.
- The protected Super Admin identity must be configured out-of-band and must never be grantable through the API.
