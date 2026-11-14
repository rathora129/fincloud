# Authentication & authorization

## 1. Sign-in flow

```mermaid
sequenceDiagram
  participant U as User
  participant L as /login
  participant API as POST /api/auth/login
  participant S as Demo store
  U->>L: email + password
  L->>API: JSON credentials (Axios)
  API->>API: rate-limit check (8/min per IP+email)
  API->>S: find user by email
  API->>API: scrypt(password, "fincloud-demo-salt") vs stored hash (constant-time)
  API->>S: reject INACTIVE users
  API->>S: stamp lastLoginAt, append LOGIN audit
  API-->>L: Set-Cookie fincloud_session=<signed token>; HttpOnly
  L->>U: redirect to ?next= (default /dashboard)
```

- Passwords are hashed with `scrypt` (64-byte digest) at seed time. Plaintext is never stored.
- The demo password is **`Fincloud@2026`** for every seeded user; the login screen lists role profiles and fills credentials on click.
- Failed attempts return a generic `INVALID_CREDENTIALS` message; inactive users receive `ACCOUNT_INACTIVE` (403).
- A simple in-memory limiter blocks more than 8 attempts per minute per IP + email (429).

## 2. Session cookie

| Attribute | Value |
| --- | --- |
| Name | `fincloud_session` |
| Value | `base64url(payload).HMAC-SHA256(payload)` |
| Payload | `{ uid, exp }` — expiry is 8 hours from issue |
| `HttpOnly` | Yes — JavaScript cannot read the token |
| `SameSite` | `Lax` |
| `Secure` | Yes in production (`NODE_ENV=production`) |
| `Path` | `/` |
| `Max-Age` | `28800` |

Verification (`src/server/session.ts`) recomputes the HMAC, compares signatures in constant time, checks expiry, then resolves the user from the store and confirms `status === "ACTIVE"`. Effective permissions are re-derived from the store's role definitions plus active grants on every request, so a role or grant change takes effect on the next request without a new token.

No authentication material is written to `localStorage` or `sessionStorage`. Redux holds the session user in memory only; the source of truth is the cookie plus the server-side lookup.

## 3. Sign-out

`POST /api/auth/logout` appends a `LOGOUT` audit entry (when a session exists) and clears the cookie with `Max-Age=0`, `HttpOnly`, `SameSite=Lax` and `Secure` in production. The header profile menu calls it, then navigates to `/login`.

## 4. Three layers of protection

1. **Proxy guard** (`src/proxy.ts`) — redirects workspace requests without a cookie to `/login?next=…`. This is a UX shortcut, not an authorization decision.
2. **Page guard** — each Server Component calls `getSessionUser()` and `can(user, "<module>:view")`. Missing permission renders `<PermissionDenied />`.
3. **API guard** — every Route Handler calls `requireSession()`, asserts the required permission (`assertPermission`), validates input with Zod, and the domain module applies `assertBranchScope()` before touching a record.

Read endpoints enforce view permissions too (`leads:view`, `applications:view`, `customers:view`), and global search filters result groups by the caller's permissions.

## 5. Roles, grants and permissions

Authorization is a hybrid model: **role permissions**, **direct user grants** (allow/deny, scoped, temporary, delegable) and **record-level access**. The full model, evaluation order, delegation rules and API contracts are documented in [access-control.md](access-control.md).

Permission codes live in `src/lib/rbac.ts`; the UI and servers share the same definitions. Role definitions are seeded there but resolved from the store, so custom roles and edited permission sets apply immediately. Pages never branch on a role name — they request permission codes.

| Role | Rank | Permissions (summary) |
| --- | --- | --- |
| **Super Admin** | 100 | All 31 permissions (protected identity) |
| **Admin** | 90 | All operational permissions + `access:view`, `access:manage`, `access:delegate`, `users:view`, `users:manage` |
| **Branch Manager** | 60 | Branch pipeline, sanctions, disbursements approval, collections, tasks, authorizations, users view, reports/export, audit |
| **Team Leader** | 55 | Sourcing pod: leads, applications, tasks, view-only credit-adjacent modules |
| **Credit Manager** | 55 | Credit decisions, sanctions, reports/export |
| **Collection Manager** | 55 | Collections management, authorizations approval, reports/export |
| **Senior Loan Officer** | 40 | Leads/applications with assignment, tasks |
| **Loan Officer** | 35 | Leads/applications, tasks, view-only downstream |
| **Credit Officer** | 35 | Credit view/decide, tasks |
| **Accounts Officer** | 35 | Disbursement processing, reports/export |
| **Collection Officer** | 30 | Collections, tasks |
| **MIS Executive** | 30 | Reporting and exports |
| **Junior Loan Officer** | 25 | Application filing under supervision |
| **Custom roles** | configurable | Created at `/access-control` with any permission subset |

Notable separations:

- Only credit roles can record credit decisions (`credit:decide`).
- Disbursement **processing** (`disbursements:process`) and **approval** (`disbursements:approve`) are separate; the API picks the permission from the action.
- Only approver roles can decide authorizations (`authorizations:approve`).
- Administrative authority (`access:manage`, `access:delegate`, `roles:manage`, `users:manage`) can only be delegated by the protected Super Admin.
- Customer 360 is readable by every operational role (`customers:view`) but write operations do not exist on the customer master.

The full permission list:

```
dashboard:view
leads:view, leads:manage, leads:assign
applications:view, applications:manage
credit:view, credit:decide
sanctions:view, sanctions:decide
disbursements:view, disbursements:process, disbursements:approve
collections:view, collections:manage
tasks:view, tasks:manage
authorizations:view, authorizations:approve
customers:view
users:view, users:manage
reports:view, reports:export
audit:view
operations:view, operations:manage
access:view, access:manage, access:delegate
roles:manage
```

## 6. Branch scope and record access

`buildScope(user)` returns:

- Global roles (`SUPER_ADMIN`, `ADMIN`) → `{ branchIds: null, isGlobal: true }`.
- All other roles → the user's `branchIds` set (one or more branches) with `isGlobal: false`.

Rules:

- List queries filter each record by `inScope(scope, record.branchId)`.
- Detail reads and mutations call `assertBranchScope(scope, record.branchId)`; out-of-scope records return `403 OUT_OF_SCOPE`.
- Filter options (branches, owners, credit officers) are also scoped, so a branch user never sees another branch in a dropdown.
- New records inherit the actor's branch unless the actor is global.
- `recordAccess: "ASSIGNED"` narrows a user to records they own or are assigned to; `RECORD`/`BRANCH`/`DEPARTMENT` `ALLOW` grants can widen that, and `DENY` always wins.
- Record visibility is enforced for lists, details, mutations, dashboards, shell badges, search, reports and CSV exports.

Verified behavior: a Pune Branch Manager sees only Pune customers in the list and gets `403` for a Mumbai customer page and API; a Junior Loan Officer with `ASSIGNED` access and a single record grant sees only that application, and a global `DENY` immediately removes it.

## 7. Client error handling

- `src/lib/api.ts` maps failures to `ApiClientError { status, code, message }`.
- A `401` on any non-login page redirects to `/login?expired=1&next=…`; the token is never handled in client code.
- `403` is surfaced as an inline permission state or toast while the server remains authoritative.
- Validation failures (`422`) carry field-level messages used by RHF forms.

## 8. Explicit non-goals

- No real password reset (no mail transport), SSO, MFA or server-side session revocation list.
- The demo secret and salt are fixed values for reproducibility; production deployments must supply secrets through environment/secret storage.
- The proxy guard only checks cookie presence; it must never be treated as the authorization boundary.
