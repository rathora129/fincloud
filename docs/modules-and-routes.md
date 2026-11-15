# Modules, routes & API map

## 1. Module inventory

| Module | Route | Purpose | Permissions | Server module |
| --- | --- | --- | --- | --- |
| Dashboard | `/dashboard` | Portfolio KPIs, trends, branch/product mix, role-aware panels | `dashboard:view` | `server/dashboard.ts` |
| Leads | `/leads`, `/leads/[id]` | Capture, assign, follow-up, qualify, convert | `leads:view`, `leads:manage`, `leads:assign` | `server/leads.ts` |
| Applications | `/applications`, `/applications/[id]` | Intake, documents, verification, submit, recommend | `applications:view`, `applications:manage` | `server/applications.ts` |
| Customer 360 | `/customers`, `/customers/[id]` | Twelve-tab relationship aggregation | `customers:view` | `server/customers.ts` |
| Credit Review | `/credit`, `/credit/[id]` | Decision desk (approve/reject/send-back) | `credit:view`, `credit:decide` | `server/credit.ts` |
| Sanctions | `/sanctions`, `/sanctions/[id]` | Acceptance, processing, approval, rejection | `sanctions:view`, `sanctions:decide` | `server/sanctions.ts` |
| Disbursements | `/disbursements`, `/disbursements/[id]` | Maker/checker payout flow, loan creation | `disbursements:view`, `disbursements:process`, `disbursements:approve` | `server/disbursements.ts` |
| Collections | `/collections`, `/collections/[id]` | Bucket queues, contacts, PTP, recovery, repayments | `collections:view`, `collections:manage` | `server/collections.ts` |
| Tasks | `/tasks` | Seven-category operational board | `tasks:view`, `tasks:manage` | `server/tasks.ts` |
| Authorizations | `/authorizations` | Payment/LMS/agency approvals | `authorizations:view`, `authorizations:approve` | `server/authorizations.ts` |
| Reports & MIS | `/reports` | Server-computed reports, print, CSV/XLS | `reports:view`, `reports:export` | `server/reports.ts` |
| Users & Roles | `/users` | User administration and role assignment | `users:view`, `users:manage` | `server/users.ts` |
| Access Control | `/access-control` | Roles, user grants, delegation, record access, audit history | `access:view`, `access:manage`, `access:delegate`, `roles:manage` | `server/access-control.ts`, `server/permissions.ts` |
| Audit Logs | `/audit-logs` | Append-only activity trail | `audit:view` | `server/audit.ts` |
| Support Operations | `/operations` | eSign, blacklist, grievances | `operations:view`, `operations:manage` | `server/operations.ts` |
| My Profile | `/profile` | Own record, session, access matrix, demo preferences | session only | `server/session.ts` |
| Sign in | `/login` | Credential entry, demo role picker | public | `app/api/auth/*` |

## 2. Page routes

All workspace routes are guarded by `src/proxy.ts` for cookie presence and by a per-page permission check.

| Path | Rendering | Notes |
| --- | --- | --- |
| `/login` | Server + client form | Redirects to `?next=` after sign-in |
| `/dashboard` | Server, role-aware | KPI strip, charts, queues |
| `/leads` | Server + client table/filters | Tabs: all, new, repeat, pre-approved, processing |
| `/leads/[id]` | Server + client actions | Pipeline stepper, follow-ups, convert modal |
| `/applications` | Server + client table/filters | Tabs: all, new, auto, in-process, recommended, send-back |
| `/applications/[id]` | Server + client actions | Documents, verification, submit, recommend, resubmit |
| `/customers` | Server + client table/filters | Tabs: all, KYC verified/pending/rejected, active loans |
| `/customers/[id]` | Server, `?tab=` driven | overview, contact, employment, applications, documents, verification, sanctions, disbursements, repayments, collections, remarks, timeline |
| `/credit` · `/credit/[id]` | Server + decision panel | Decision requires `credit:decide` |
| `/sanctions` · `/sanctions/[id]` | Server + action panel | Role-gated decisions |
| `/disbursements` · `/disbursements/[id]` | Server + action panel | Process vs approve split |
| `/collections` · `/collections/[id]` | Server + action panel | Contact, PTP, status moves, resolve, record repayment |
| `/tasks` | Server + client board | Category columns, transitions, create/edit |
| `/authorizations` | Server + client drawer | Approve/reject pending requests |
| `/reports` | Server + client controls | Report selection, filters, print, export links |
| `/users` | Server + client modals | Create/edit, activate/deactivate, role assignment |
| `/access-control` | Server + client tabs | User access, role matrix, grants & delegation, access history, compare |
| `/audit-logs` | Server + client table | Filters and detail modal |
| `/operations` | Server + client tabs | eSign, blacklist, grievances |
| `/profile` | Server | Own access matrix and demo preferences |

## 3. API endpoints

Every handler uses `requireSession`, Zod validation, `errorResponse` envelopes and `runtime = "nodejs"`.

| Method & path | Permission | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | public (rate-limited) | Verify scrypt hash, set HttpOnly session cookie |
| `POST /api/auth/logout` | session | Clear cookie, audit the event |
| `GET /api/auth/session` | session | Current user, role, permissions |
| `GET /api/health` | public | Liveness + storage adapter summary (`503` when misconfigured) |
| `GET /api/leads` | `leads:view` | Scoped list + tab counts + options |
| `POST /api/leads` | `leads:manage` | Create a lead |
| `GET /api/leads/[id]` | `leads:view` | Detail with follow-ups and activity |
| `PATCH /api/leads/[id]` | `leads:manage` / `leads:assign` | `UPDATE`, `ASSIGN`, `STATUS`, `FOLLOW_UP`, `CONVERT` |
| `GET /api/applications` | `applications:view` | Scoped list + counts + options |
| `POST /api/applications` | `applications:manage` | Create for an existing or inline customer |
| `GET /api/applications/[id]` | `applications:view` | Detail + linked records |
| `PATCH /api/applications/[id]` | `applications:manage` | `UPDATE`, `SUBMIT`, `DOCUMENT`, `VERIFICATION`, `RECOMMEND`, `RESUBMIT` |
| `POST /api/applications/[id]/documents/[documentId]/file` | `applications:manage` | Upload a PDF/PNG/JPEG (≤5 MB, sniffed, UUID name, sha256) |
| `GET /api/applications/[id]/documents/[documentId]/file` | `applications:view` | Authorised streaming download (`private, no-store`, `nosniff`) |
| `GET /api/customers` | `customers:view` | Scoped customer list + tab counts |
| `GET /api/customers/[id]` | `customers:view` | Full Customer 360 aggregate |
| `POST /api/credit/[id]/decision` | `credit:decide` | `APPROVE`, `REJECT`, `SEND_BACK` |
| `PATCH /api/sanctions/[id]` | `sanctions:decide` | `ACCEPT`, `APPROVE`, `REJECT` |
| `POST /api/sanctions` | `sanctions:decide` | Raise a sanction from a credit-approved application (amount ≤ credit decision) |
| `PATCH /api/disbursements/[id]` | `disbursements:process` / `disbursements:approve` | `PROCESS`, `RECOMMEND`, `AUTHORIZE`, `COMPLETE`, `REJECT` |
| `POST /api/disbursements` | `disbursements:process` | Raise a disbursement from an approved sanction (amount ≤ sanction) |
| `PATCH /api/collections/[id]` | `collections:manage` | `LOG_CONTACT`, `SET_PTP`, `MOVE_STATUS`, `RESOLVE` |
| `POST /api/repayments/[id]` | `collections:manage` | Record a DEMO repayment against an instalment |
| `POST /api/tasks` | `tasks:manage` | Create a task |
| `PATCH /api/tasks/[id]` | `tasks:manage` | Update status, assignment, priority, due date |
| `POST /api/authorizations` | `authorizations:view` | Raise an authorization request |
| `PATCH /api/authorizations/[id]` | `authorizations:approve` | Approve or reject |
| `POST /api/users` | `users:manage` | Create a user (demo password hashed) |
| `PATCH /api/users/[id]` | `users:manage` | `UPDATE` or `SET_STATUS` |
| `GET /api/access-control` | `access:view` | Access center snapshot (users, roles, grants, audits, permissions, branches) |
| `GET /api/access-control/users/[id]` | `access:view` | User access detail or context-aware effective-permission preview |
| `PATCH /api/access-control/users/[id]` | `access:manage` | Branch set, department, record access, reason |
| `POST /api/access-control/grants` | `access:manage` | Create scoped allow/deny grant (direct/delegated, optional expiry) |
| `POST /api/access-control/grants/[id]/revoke` | `access:manage` | Revoke a grant with reason |
| `POST /api/access-control/roles` | `roles:manage` | Create a custom role |
| `PATCH /api/access-control/roles/[code]` | `roles:manage` | Update role metadata and permission set |
| `GET /api/access-control/history` | `access:view` | Read-only permission audit feed |
| `GET /api/access-control/compare?left=&right=` | `access:view` | Effective-permission comparison |
| `GET /api/exports/[report]` | `reports:export` | CSV or SpreadsheetML `.xls` export |
| `POST /api/blacklist` | `operations:manage` | Add a blacklist entry |
| `PATCH /api/grievances/[id]` | `operations:manage` | Update grievance status/priority |
| `GET` / `PATCH /api/notifications` | session | Own notifications, mark read |
| `GET /api/search` | session + per-group permissions | Global search (leads, applications, customers, loans, tasks) |

## 4. Client service map

| Service | Functions | Consumers |
| --- | --- | --- |
| `services/leads.ts` | `fetchLeads`, `fetchLead`, `createLeadRequest`, `leadActionRequest` | Leads table/modals |
| `services/applications.ts` | `fetchApplications`, `fetchApplication`, `createApplicationRequest`, `applicationActionRequest` | Applications table/modals |
| `services/customers.ts` | `fetchCustomers`, `fetchCustomer` | Available for API consumers; pages read server-side |
| `services/credit.ts` | `decideCredit` | Credit decision panel |
| `services/sanctions.ts` | `applySanctionAction` | Sanction actions |
| `services/disbursements.ts` | `applyDisbursementAction` | Disbursement actions |
| `services/collections.ts` | `collectionsService.*` | Collection actions and repayment capture |
| `services/tasks.ts` | `tasksService.*` | Task board |
| `services/authorizations.ts` | `authorizationsService.*` | Authorization drawer |
| `services/users.ts` | `createUser`, `updateUser`, `setUserStatus` | User administration |
| `services/access-control.ts` | `fetchAccessCenter`, `fetchUserAccess`, `previewUserAccess`, `compareAccess`, `createAccessGrant`, `revokeAccessGrant`, `createAccessRole`, `updateAccessRole`, `updateAccessScope`, `fetchPermissionHistory` | Access Control Center |
| `services/operations.ts` | `addBlacklistEntry`, `updateGrievance` | Support operations |
| `services/reports.ts` | `isReportKey`, `reportExportUrl` | Report controls |

List and detail pages are Server Components, so they call `src/server/*` directly rather than through the client service. The services exist for client mutations and for API consumers.

## 5. Data flow per module

| Surface | Read path | Write path |
| --- | --- | --- |
| Leads | `getLeadsWorkspace` → page → client table | modal → `services/leads` → `PATCH /api/leads/[id]` → `server/leads` |
| Applications | `getApplicationsWorkspace` / `getApplicationDetail` | modal → `services/applications` → `PATCH /api/applications/[id]` |
| Customers | `getCustomersWorkspace` / `getCustomerDetail` | read-only aggregation (no customer master mutation) |
| Credit | `server/credit` queue + detail | `POST /api/credit/[id]/decision` |
| Sanctions | `server/sanctions` queue + detail | `PATCH /api/sanctions/[id]` |
| Disbursements | `server/disbursements` queue + detail | `PATCH /api/disbursements/[id]` |
| Collections | `server/collections` overview + detail | `PATCH /api/collections/[id]`, `POST /api/repayments/[id]` |
| Tasks | `server/tasks` overview | `POST /api/tasks`, `PATCH /api/tasks/[id]` |
| Authorizations | `server/authorizations` queue | `POST /api/authorizations`, `PATCH /api/authorizations/[id]` |
| Reports | `server/reports` computes from URL filters | `GET /api/exports/[report]` |
| Users | `server/users` scoped list | `POST /api/users`, `PATCH /api/users/[id]` |
| Access Control | `server/access-control` center + user detail + preview | `POST/PATCH /api/access-control/*`, audited through `logPermissionChange` |
| Audit | `server/audit` scoped query | append-only writes from every mutation |
| Operations | `server/operations` panels | `POST /api/blacklist`, `PATCH /api/grievances/[id]` |

## 6. Missing integrations (awaiting backend)

These are deliberately not simulated with fake responses:

- **Binary document upload/storage/download.** The checklist records synthetic file names and status transitions only.
- **eSign provider** (Aadhaar eSign / DSC) callbacks and signed artefacts. Status is DEMO-only.
- **Credit bureau and fraud APIs.** Risk bands and verification states are synthetic.
- **Payment gateway, NACH mandate and bank disbursement files.** Payouts end at a DEMO bank reference; no money moves.
- **WhatsApp / SMS / email delivery.** Follow-ups are internal notes; no messages are sent.
- **Customer master editing and free-text notes.** Customer 360 is an aggregation; remarks come from credit/sanction/disbursement/collection/grievance records.
- **Grievance resolution notes** persist in the audit summary rather than a dedicated store field.
- **Password recovery, SSO, MFA.** Out of scope for the demo; server-side session revocation is implemented.
- **Server-side pagination for very large audit/user sets** and asynchronous export jobs. Current pagination is client-side over scoped results.

Completed: sanctions are raised from credit-approved applications (`POST /api/sanctions`) and disbursements from approved sanctions (`POST /api/disbursements`); both are permission- and record-checked.
