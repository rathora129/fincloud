# Access control (hybrid RBAC + user + record permissions)

FinCloud LMS authorizes every request through one centralized engine. Roles, direct user grants, record scopes, delegation and audit history are data — not hardcoded checks inside pages. The Access Control Center (`/access-control`) is the administrative surface for that data.

## 1. Model

| Layer | Stored as | Granularity | Evaluated by |
| --- | --- | --- | --- |
| Role | `RoleDefinition` — `code`, `name`, `shortLabel`, `description`, `permissions[]`, `rank`, `isSystem`, `isGlobal` | Module/action for a cohort | `evaluatePermission` |
| User grants | `AccessGrant` — `effect` (`ALLOW`/`DENY`), `scopeType` (`GLOBAL`/`BRANCH`/`DEPARTMENT`/`RECORD`), `mode` (`DIRECT`/`DELEGATED`), `reason`, `expiresAt`, revocation fields | One permission for one person, optionally against one record | `evaluatePermission` + `canViewRecord` |
| User scope | `UserRecord.branchIds`, `department`, `recordAccess` (`BRANCH`/`ASSIGNED`) | Branch set and record visibility posture | `buildScope` / `canViewRecord` |
| Protected authority | `store.security.protectedSuperAdminId` | Exact user identity | `isProtectedSuperAdmin` |
| Audit | `PermissionAudit` (append-only) | Every role, scope and grant change | `logPermissionChange` |

Roles are seeded from `DEFAULT_ROLES` in `src/lib/rbac.ts` (13 roles, 31 permissions) but resolved from the store, so custom roles and edited permissions take effect immediately. Pages and APIs ask for permission codes only; they never branch on a role name.

### Permission catalogue

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

`access:manage`, `access:delegate`, `roles:manage` and `users:manage` form the **administrative authority** set. Only the protected Super Admin can delegate these codes to another user (see §5).

## 2. Effective permission evaluation

`evaluatePermission(user, permission, context)` in `src/server/permissions.ts` runs on every server read and mutation:

1. Unknown role → deny (fail closed).
2. Protected Super Admin identity (exact `protectedSuperAdminId`, role `SUPER_ADMIN`, status `ACTIVE`) → allow, source `SUPER_ADMIN`.
3. Collect active grants for the subject (not revoked, not expired) matching the permission and the context (`GLOBAL`, matching `branchId`, matching `department`, or matching `recordType`/`recordId`).
4. Any applicable `DENY` → deny. `DENY` always wins over role and direct `ALLOW` grants, including record-scoped allows.
5. Role permission or applicable `ALLOW` grant → allow, with all contributing sources returned for the UI.
6. Otherwise deny. The evaluation never falls back to "allow by default".

`context` is assembled from the request: branch for lists and branch actions, record type/id for details and record actions. The engine is deterministic and shared by pages, route handlers, exports, dashboard aggregates, search and shell badges.

### Record visibility

`canViewRecord(user, recordType, recordId, viewPermission, branchId, ownerId)` combines:

- Branch/global scope (`inScope`).
- `recordAccess`:
  - `BRANCH` — all records in the authorized branch set.
  - `ASSIGNED` — only records where the user is the owner/assignee, unless a matching `BRANCH`, `DEPARTMENT` or `RECORD` `ALLOW` grant applies.
- Explicit `RECORD` grants and `DENY` overrides.
- The caller must still hold the module's view permission.

This is enforced for customer, lead, application, sanction, loan, disbursement, collection, task and report datasets:

| Surface | Enforcement |
| --- | --- |
| List endpoints and pages | Rows filtered by `canViewRecord` |
| Detail endpoints and pages | Record gate returns `403 FORBIDDEN` when not visible |
| Mutations | `assertRecordPermission` before any state change |
| Reports and CSV exports | Datasets filtered before aggregation/CSV serialization |
| Dashboard, shell badges, global search | Same predicates before counting or returning hits |

Out-of-scope record IDs therefore cannot be reached by guessing IDs (IDOR).

## 3. Grant lifecycle

- **Create** — `POST /api/access-control/grants` validates permission membership, reason length (≥10), future expiry, scope shape, record existence and branch resolution. Equivalent active grants are rejected with `409 DUPLICATE_GRANT`.
- **Expire** — temporary grants stop contributing the moment `expiresAt` passes; no job is required.
- **Revoke** — `POST /api/access-control/grants/[id]/revoke` stores revoker, timestamp and reason; the grant immediately stops contributing.
- **Restrictions** — `DENY` grants can only be direct (never delegated). A user cannot restrict an account at or above their rank.
- **Status** — `ACTIVE`, `EXPIRED`, `REVOKED` are derived for the UI; expiry and revocation always win.

## 4. Delegation rules

Creating a grant requires `access:manage`. Additional rules:

| Rule | Error |
| --- | --- |
| Cannot modify the protected Super Admin identity | `403 PROTECTED_IDENTITY` |
| Cannot change your own access | `403 SELF_ESCALATION` |
| Target must be a strict subordinate (rank `<` actor), except protected SA | `403 RANK_EXCEEDED` |
| Target must be visible in the actor's branch scope | `403 OUT_OF_SCOPE` |
| Grant scope must lie within actor authority (GLOBAL needs a global role or protected SA) | `403 OUT_OF_SCOPE` |
| `ALLOW` requires holding the permission (SA exempt) | `403 DELEGATION_EXCEEDED` |
| `DENY` cannot target rank ≥ actor | `403 RANK_EXCEEDED` |
| Delegated mode requires `access:delegate` | `403 FORBIDDEN` |
| Delegated grants need an expiry, bounded by the actor's earliest expiry for that permission | `422 EXPIRY_REQUIRED` / `422 EXPIRY_EXCEEDED` |
| Delegation cycles (grantor reachable from recipient for the same permission) are rejected | `409 DELEGATION_CYCLE` |
| Administrative authority codes are delegable only by the protected SA | `403 ADMIN_AUTHORITY_SEPARATION` |
| Duplicate active grant | `409 DUPLICATE_GRANT` |

Cycle detection walks the active `ALLOW` delegation graph for the requested permission; because a target must be a strict subordinate, cycles are additionally unreachable through the API. The guard remains as defense-in-depth for imported or migrated data.

## 5. Role administration

- `POST /api/access-control/roles` and `PATCH /api/access-control/roles/[code]` require `roles:manage` (protected SA by default).
- The `SUPER_ADMIN` role can only be changed by the protected Super Admin and must retain `roles:manage`; otherwise `422 PROTECTED_IDENTITY`.
- Rank is explicit per role and drives every comparison above.
- New users and role reassignment live in `POST /api/users` / `PATCH /api/users/[id]` and enforce: self role change blocked (`SELF_ROLE_CHANGE`), SA role only by protected SA, no role above actor rank, and no role containing permissions the actor does not hold.

## 6. Audit trail

`logPermissionChange` appends to `store.permissionAudits` (capped in memory) for every role create/update, user creation, scope change, grant create/revoke and restriction. Each entry records:

`actorId`, `actorRole`, target type/id/label (e.g. `Pooja Sethi · credit:view · GLOBAL`), action, `before[]`, `after[]`, reason, source IP, `expiresAt`, timestamp.

The audit feed is read-only over HTTP: only `GET /api/access-control/history` exists. No update or delete route is exposed, and the UI renders history with no mutation controls.

## 7. Access Control Center

Route `/access-control`, permission `access:view`. Tabs:

1. **User access** — searchable directory, effective permission groups with sources, explicit restrictions, individual and delegated grants, scope editor (branches, department, record access), effective-permission preview with branch/record context, per-user history.
2. **Roles & matrix** — role cards, module × action matrix, create/edit role dialogs (rank, global flag, permissions).
3. **Grants & delegation** — all grants with subject, scope, mode, expiry and status; create and revoke dialogs.
4. **Access history** — filterable permission audit feed.
5. **Compare** — side-by-side effective permissions for two users.

The page gates on `access:view`; management controls render only with `access:manage`, role editing with `roles:manage`, delegated creation with `access:delegate`. Server-side checks remain authoritative regardless of what the UI shows.

### API contracts

| Method & path | Permission | Purpose |
| --- | --- | --- |
| `GET /api/access-control` | `access:view` | Center snapshot: users, roles, grants, audits, permissions, branches, departments, protected identity |
| `GET /api/access-control/users/[id]` | `access:view` | User access detail; with `branchId` / `department` / `recordType`+`recordId` returns an effective-permission preview |
| `PATCH /api/access-control/users/[id]` | `access:manage` | Branch set, department, `recordAccess`, reason |
| `POST /api/access-control/grants` | `access:manage` | Create `ALLOW`/`DENY`, scoped, direct/delegated, optional expiry |
| `POST /api/access-control/grants/[id]/revoke` | `access:manage` | Revoke with reason |
| `POST /api/access-control/roles` | `roles:manage` | Create custom role |
| `PATCH /api/access-control/roles/[code]` | `roles:manage` | Update role fields and permissions |
| `GET /api/access-control/history` | `access:view` | Permission audit feed |
| `GET /api/access-control/compare?left=&right=` | `access:view` | Effective permission comparison |

## 8. Verified authorization matrix

Exercised against the running app with real session cookies:

| Scenario | Expected | Observed |
| --- | --- | --- |
| SA opens center | 200 | 200 |
| Admin opens center | 200 | 200 |
| Branch Manager opens center | 403 | 403 `FORBIDDEN` |
| Loan Officer opens center | 403 | 403 |
| Admin creates role (no `roles:manage`) | 403 | 403 |
| Admin attempts to grant `access:manage` | 403 | 403 `ADMIN_AUTHORITY_SEPARATION` |
| Admin modifies protected SA | 403 | 403 `PROTECTED_IDENTITY` |
| SA self-grant | 403 | 403 `PROTECTED_IDENTITY` |
| SA creates custom role / updates it | 201 / 200 | 201 / 200 |
| SA updates user scope (branches, department, `ASSIGNED`) | 200 | 200 |
| Temporary grant active, then expired | allow, then deny | matches |
| Record grant on `app-0008` | only that record visible | list = `app-0008`; other records 403 |
| `DENY` on `applications:view` | overrides role + record allow | `allowed:false`, record 403 |
| Revoke `DENY` | access restored | record 200 |
| Ishaan (team leader) self-grant | 403 | 403 `SELF_ESCALATION` |
| Ishaan delegates `roles:manage` | 403 | 403 `ADMIN_AUTHORITY_SEPARATION` |
| Ishaan delegates a permission he lacks | 403 | 403 `DELEGATION_EXCEEDED` |
| Ishaan delegates without expiry / beyond his expiry | 422 | `EXPIRY_REQUIRED` / `EXPIRY_EXCEEDED` |
| Ishaan restricts a manager | 403 | 403 `OUT_OF_SCOPE` (then `RANK_EXCEEDED` in-branch) |
| Ishaan delegates within his window | 201 | 201 |
| Invalid permission / short reason / past expiry / missing record / bad branch / duplicate | 422/422/422/422/422/409 | matches |
| Unauthenticated grant request | 401 | 401 |
| SA strips `roles:manage` from `SUPER_ADMIN` | 422 | 422 `PROTECTED_IDENTITY` |

Role-reassignment probes (`PATCH /api/users/[id]`) were blocked by the local agent's permission classifier during automated testing, so those guards (`SELF_ROLE_CHANGE`, SA-only role grant, rank and permission-subset checks in `src/server/users.ts`) are covered by code review and typecheck rather than an executed HTTP test.

## 9. Production data model — proposed, awaiting approval

**No schema was changed.** The demo stores all of this in the in-memory `globalThis` store. The following relational model is proposed for a production database and requires explicit approval before any migration is written.

```sql
-- Reference catalogue (seeded, rarely changed)
CREATE TABLE permissions (
  code            text PRIMARY KEY,
  module          text NOT NULL,
  label           text NOT NULL,
  is_admin_authority boolean NOT NULL DEFAULT false
);

CREATE TABLE roles (
  id          uuid PRIMARY KEY,
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  short_label text NOT NULL,
  description text NOT NULL,
  rank        integer NOT NULL CHECK (rank BETWEEN 1 AND 100),
  is_system   boolean NOT NULL DEFAULT false,
  is_global   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id         uuid REFERENCES roles(id) ON DELETE CASCADE,
  permission_code text REFERENCES permissions(code),
  PRIMARY KEY (role_id, permission_code)
);

-- Extends the existing users table
ALTER TABLE users ADD COLUMN role_id uuid REFERENCES roles(id);
ALTER TABLE users ADD COLUMN department text;
ALTER TABLE users ADD COLUMN record_access text
  CHECK (record_access IN ('BRANCH','ASSIGNED')) DEFAULT 'BRANCH';

CREATE TABLE user_branch_scopes (
  user_id   uuid REFERENCES users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE access_grants (
  id             uuid PRIMARY KEY,
  subject_id     uuid REFERENCES users(id),
  permission_code text REFERENCES permissions(code),
  effect         text NOT NULL CHECK (effect IN ('ALLOW','DENY')),
  scope_type     text NOT NULL CHECK (scope_type IN ('GLOBAL','BRANCH','DEPARTMENT','RECORD')),
  branch_id      uuid NULL REFERENCES branches(id),
  department     text NULL,
  record_type    text NULL,
  record_id      text NULL,
  mode           text NOT NULL CHECK (mode IN ('DIRECT','DELEGATED')),
  reason         text NOT NULL CHECK (char_length(reason) >= 10),
  granted_by     uuid REFERENCES users(id),
  granted_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NULL,
  revoked_by     uuid NULL REFERENCES users(id),
  revoked_at     timestamptz NULL,
  revoked_reason text NULL,
  CHECK (expires_at IS NULL OR expires_at > granted_at),
  CHECK (
    (scope_type = 'GLOBAL' AND branch_id IS NULL AND department IS NULL AND record_id IS NULL) OR
    (scope_type = 'BRANCH' AND branch_id IS NOT NULL AND record_id IS NULL) OR
    (scope_type = 'DEPARTMENT' AND department IS NOT NULL AND record_id IS NULL) OR
    (scope_type = 'RECORD' AND record_type IS NOT NULL AND record_id IS NOT NULL)
  )
);

CREATE INDEX grants_subject_perm_idx
  ON access_grants (subject_id, permission_code) WHERE revoked_at IS NULL;
CREATE INDEX grants_record_idx ON access_grants (record_type, record_id);
CREATE INDEX grants_expiry_idx ON access_grants (expires_at);

-- Append-only audit. No UPDATE/DELETE grants for the application role.
CREATE TABLE permission_audits (
  id          uuid PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid NOT NULL REFERENCES users(id),
  actor_role  text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('USER','ROLE','GRANT')),
  target_id   text NOT NULL,
  target_label text NOT NULL,
  action      text NOT NULL,
  before_state jsonb NOT NULL DEFAULT '[]',
  after_state  jsonb NOT NULL DEFAULT '[]',
  reason      text NOT NULL,
  ip          inet NOT NULL,
  expires_at  timestamptz NULL,
  prev_hash   bytea NULL,
  hash        bytea NOT NULL
);
```

Operational notes for the production implementation:

- Revoke `UPDATE`/`DELETE` on `permission_audits`; enforce append-only with a trigger and hash chain (`prev_hash` → `hash`).
- Evaluate expiry in SQL (`expires_at IS NULL OR expires_at > now()`) so expired grants never load.
- Keep `DENY` precedence in the evaluator, not in per-module queries.
- Uniqueness: partial unique index on active grants for `(subject_id, permission_code, effect, scope_type, branch_id, department, record_type, record_id)` to back the duplicate check.
- The protected Super Admin identity must be configured out-of-band (deployment secret/seed), never grantable through the API.

## 10. Limits of the demo

- All access data lives in memory and resets on process restart; changes are not persisted.
- The permission catalogue is static; custom **permissions** are out of scope (custom **roles** are supported).
- No email/notification is sent on access changes.
- Exports are synchronous CSV; there is no async job queue.

See [auth-and-rbac.md](auth-and-rbac.md) for authentication and session details, and [modules-and-routes.md](modules-and-routes.md) for the route inventory.
