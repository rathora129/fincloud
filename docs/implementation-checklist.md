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
- [x] `npm run typecheck` clean; `npm run build` succeeds (38 routes).
- [x] Authorization matrix exercised over HTTP with real sessions (see `access-control.md` §8).

## 2. Verification notes

- Typecheck and production build pass.
- Authorization tests cover positive and negative paths for the access API, grants, expiry, revocation, record scoping, denial precedence and unauthorised access.
- Interactive browser verification of client-only interactions (modals, tab switching) is limited in the current environment: the automated browser tab reports `document.visibilityState === "hidden"`, so React streaming boundaries stay in the loading state. SSR HTML and API responses were verified directly instead.
- A few role-reassignment HTTP probes were blocked by the local agent's permission classifier before reaching the app; those guards (`SELF_ROLE_CHANGE`, SA-only role grant, rank and permission-subset checks) are covered by code review and typecheck.

## 3. Awaiting approval

- [ ] **Production database schema.** No schema was changed. The relational model for roles, role permissions, user branch scopes, access grants and append-only permission audits is proposed in `access-control.md` §9. A migration must not be written until explicitly approved.
- [ ] **Email/notification on access changes.** Requires a transport; currently no message is sent.
- [ ] **Custom permission creation.** Roles can be customized; the permission catalogue is fixed.

## 4. External integrations (intentionally not simulated)

- [ ] Binary document upload/storage/download.
- [ ] eSign provider callbacks and signed artefacts.
- [ ] Credit bureau and fraud APIs.
- [ ] Payment gateway, NACH mandates and bank disbursement files.
- [ ] WhatsApp / SMS / email delivery.
- [ ] Sanction creation directly from a credit-approved application (existing seeded sanctions only).
- [ ] Customer master editing and free-text notes.
- [ ] Password recovery, SSO, MFA, server-side session revocation.
- [ ] Server-side pagination for large audit/user sets and asynchronous export jobs.

Missing integrations are marked as awaiting backend in the UI; no fake success responses are returned.

## 5. Operational notes

- All demo state is in memory (`globalThis.__fincloudLmsStore`) and resets on process restart.
- Production deployments must supply `SESSION_SECRET`-equivalent configuration and a real secret store; the demo secret is fixed for reproducibility.
- The protected Super Admin identity must be configured out-of-band and must never be grantable through the API.
