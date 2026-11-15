# Database persistence strategy (proposal — approval required)

## 1. Current state (verified)

- The application has **no database configuration**: no ORM/driver dependency, no `prisma/`, `drizzle/`, `migrations/`, no `DATABASE_URL`, and no committed `.env` file.
- All state lives in `globalThis.__fincloudLmsStore`, rebuilt from `src/server/seed.ts` on every process start (`src/server/store.ts`).
- Consequences today: accounts, roles, grants, permission audits, leads, applications, sanctions, disbursements, loans, repayments, collections, tasks, documents metadata and audit history reset on restart or redeploy.

No schema exists to inspect. Nothing in this document has been applied.

## 2. Fail-closed behavior (implemented now)

`src/server/env.ts` reads `FINCLOUD_STORE_ADAPTER` and is enforced from `getStore()`:

| Environment | Configuration | Result |
| --- | --- | --- |
| development / test | unset | in-memory seed (unchanged) |
| production | unset | **refuses to start** — no silent in-memory fallback |
| production | `postgres` | **refuses to start** until the adapter is implemented (schema approval required) |
| production | `memory` + `FINCLOUD_ALLOW_EPHEMERAL_STORE=true` | explicit, isolated demo/staging only |
| production | `memory` without the acknowledgement flag | **refuses to start** |
| build phase | any | in-memory build is allowed so `next build` can collect pages |

`GET /api/health` reports the active adapter (`memory`/`postgres`) and whether storage is ephemeral, without exposing secrets.

## 3. Recommended architecture

- **PostgreSQL** as the system of record (managed instance; separate databases for staging and production).
- A **repository layer** (`src/server/repositories/*`) exposing async functions per aggregate. Domain modules keep their business rules and permission checks; only data access changes.
- **SQL migrations** applied by a migration runner (e.g. `node-pg-migrate` or Drizzle Kit) as part of a controlled release step — never by app startup in production.
- **Transactions** for multi-entity mutations: credit decision + application status + audit; disbursement completion + loan account + repayment schedule; repayment + loan balance + collection case + audit.
- **Seeding** is a separate, idempotent development/staging command. Demo seed data must never be loaded into a database containing real records.
- **Sessions, grants and audits** are persisted exactly like business data; the protected Super Admin identity is configured by deployment configuration, not by a migration.

### Why not "hydrate the in-memory store from DB at boot"

It would look like a small change, but it breaks correctness: multiple instances would overwrite each other's writes, expiry and revocation would drift, and audit immutability could not be guaranteed. The demo store should remain a development adapter only.

## 4. Environment variables (names only)

```
DATABASE_URL=                 # server-only secret, never NEXT_PUBLIC_*
FINCLOUD_STORE_ADAPTER=postgres
FINCLOUD_SESSION_SECRET=      # >= 32 chars, generated per environment
FINCLOUD_DOCUMENT_ROOT=       # staging demo only; production uses object storage
PGSSLMODE=require
```

Secrets belong in the hosting provider's secret store. Do not commit them, print them, or expose them to the browser.

## 5. Proposed schema

The access-control tables (`roles`, `permissions`, `role_permissions`, `user_branch_scopes`, `access_grants`, `permission_audits`) are specified in [access-control.md](access-control.md) §9. This section adds the operational tables and integration fields.

```sql
-- Identity and organisation
CREATE TABLE branches (
  id          uuid PRIMARY KEY,
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  city        text NOT NULL,
  state       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id              uuid PRIMARY KEY,
  email           citext UNIQUE NOT NULL,
  name            text NOT NULL,
  phone           text NOT NULL,
  password_hash   text NOT NULL,          -- scrypt, per-user salt
  role_id         uuid NOT NULL REFERENCES roles(id),
  designation     text NOT NULL,
  department      text NOT NULL,
  primary_branch_id uuid NOT NULL REFERENCES branches(id),
  record_access   text NOT NULL DEFAULT 'BRANCH' CHECK (record_access IN ('BRANCH','ASSIGNED')),
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  avatar_color    text,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  ip          inet NOT NULL,
  user_agent  text NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

-- Origination
CREATE TABLE customers (
  id             uuid PRIMARY KEY,
  ref            text UNIQUE NOT NULL,
  name           text NOT NULL,
  email          citext,
  phone          text NOT NULL,
  pan_masked     text NOT NULL,
  aadhaar_masked text NOT NULL,
  kyc_status     text NOT NULL,
  employment_type text NOT NULL,
  employer       text,
  monthly_income numeric(14,2) NOT NULL,
  branch_id      uuid NOT NULL REFERENCES branches(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leads (
  id            uuid PRIMARY KEY,
  ref           text UNIQUE NOT NULL,
  customer_name text NOT NULL,
  phone         text NOT NULL,
  email         citext,
  source        text NOT NULL,
  type          text NOT NULL,
  status        text NOT NULL,
  branch_id     uuid NOT NULL REFERENCES branches(id),
  owner_id      uuid NOT NULL REFERENCES users(id),
  converted_application_id uuid,
  next_follow_up_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lead_followups (
  id        uuid PRIMARY KEY,
  lead_id   uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  actor_id  uuid NOT NULL REFERENCES users(id),
  at        timestamptz NOT NULL DEFAULT now(),
  channel   text NOT NULL,
  notes     text NOT NULL
);

CREATE TABLE applications (
  id               uuid PRIMARY KEY,
  ref              text UNIQUE NOT NULL,
  customer_id      uuid NOT NULL REFERENCES customers(id),
  lead_id          uuid REFERENCES leads(id),
  product          text NOT NULL,
  requested_amount numeric(14,2) NOT NULL,
  approved_amount  numeric(14,2),
  tenure_months    integer NOT NULL,
  interest_rate    numeric(6,3) NOT NULL,
  purpose          text NOT NULL,
  status           text NOT NULL,
  branch_id        uuid NOT NULL REFERENCES branches(id),
  owner_id         uuid NOT NULL REFERENCES users(id),
  credit_officer_id uuid REFERENCES users(id),
  risk_band        text,
  sent_back_reason text,
  submitted_at     timestamptz,
  verification     jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE application_documents (
  id             uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  name           text NOT NULL,
  required       boolean NOT NULL DEFAULT false,
  status         text NOT NULL CHECK (status IN ('PENDING','UPLOADED','VERIFIED','REJECTED')),
  file_id        uuid,
  uploaded_at    timestamptz
);

CREATE TABLE document_files (
  id             uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  document_id    uuid NOT NULL REFERENCES application_documents(id),
  branch_id      uuid NOT NULL REFERENCES branches(id),
  original_name  text NOT NULL,
  storage_key    text UNIQUE NOT NULL,   -- generated server-side, never user input
  mime           text NOT NULL,
  size_bytes     integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256         bytea NOT NULL,
  uploaded_by    uuid NOT NULL REFERENCES users(id),
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credit_decisions (
  id              uuid PRIMARY KEY,
  application_id  uuid NOT NULL REFERENCES applications(id),
  decided_by      uuid NOT NULL REFERENCES users(id),
  decided_at      timestamptz NOT NULL DEFAULT now(),
  decision        text NOT NULL CHECK (decision IN ('APPROVE','REJECT','SEND_BACK')),
  approved_amount numeric(14,2),
  risk_band       text,
  remarks         text NOT NULL
);

-- Fulfilment
CREATE TABLE sanctions (
  id               uuid PRIMARY KEY,
  ref              text UNIQUE NOT NULL,
  application_id   uuid NOT NULL REFERENCES applications(id),
  customer_id      uuid NOT NULL REFERENCES customers(id),
  approved_amount  numeric(14,2) NOT NULL,
  interest_rate    numeric(6,3) NOT NULL,
  tenure_months    integer NOT NULL,
  processing_fee   numeric(14,2) NOT NULL,
  disbursement_mode text NOT NULL,
  status           text NOT NULL,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  decided_at       timestamptz,
  approved_by      uuid REFERENCES users(id),
  remarks          text NOT NULL DEFAULT '',
  branch_id        uuid NOT NULL REFERENCES branches(id)
);

CREATE TABLE disbursements (
  id             uuid PRIMARY KEY,
  ref            text UNIQUE NOT NULL,
  sanction_id    uuid NOT NULL REFERENCES sanctions(id),
  application_id uuid NOT NULL REFERENCES applications(id),
  customer_id    uuid NOT NULL REFERENCES customers(id),
  amount         numeric(14,2) NOT NULL,
  mode           text NOT NULL,
  status         text NOT NULL,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz,
  processed_by   uuid REFERENCES users(id),
  bank_ref       text,
  remarks        text NOT NULL DEFAULT '',
  branch_id      uuid NOT NULL REFERENCES branches(id)
);

CREATE TABLE loan_accounts (
  id             uuid PRIMARY KEY,
  ref            text UNIQUE NOT NULL,
  application_id uuid NOT NULL REFERENCES applications(id),
  disbursement_id uuid NOT NULL UNIQUE REFERENCES disbursements(id),
  customer_id    uuid NOT NULL REFERENCES customers(id),
  branch_id      uuid NOT NULL REFERENCES branches(id),
  principal      numeric(14,2) NOT NULL,
  outstanding    numeric(14,2) NOT NULL,
  interest_rate  numeric(6,3) NOT NULL,
  tenure_months  integer NOT NULL,
  emi_amount     numeric(14,2) NOT NULL,
  disbursed_at   timestamptz NOT NULL,
  status         text NOT NULL,
  next_due_date  date,
  dpd            integer NOT NULL DEFAULT 0,
  paid_amount    numeric(14,2) NOT NULL DEFAULT 0,
  penalty_accrued numeric(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE repayments (
  id                uuid PRIMARY KEY,
  ref               text UNIQUE NOT NULL,
  loan_account_id   uuid NOT NULL REFERENCES loan_accounts(id),
  customer_id       uuid NOT NULL REFERENCES customers(id),
  due_date          date NOT NULL,
  paid_date         timestamptz,
  amount            numeric(14,2) NOT NULL,
  principal_component numeric(14,2) NOT NULL,
  interest_component  numeric(14,2) NOT NULL,
  penalty           numeric(14,2) NOT NULL DEFAULT 0,
  status            text NOT NULL,
  mode              text,
  receipt_no        text
);

-- Servicing
CREATE TABLE collection_cases (
  id              uuid PRIMARY KEY,
  ref             text UNIQUE NOT NULL,
  loan_account_id uuid NOT NULL REFERENCES loan_accounts(id),
  customer_id     uuid NOT NULL REFERENCES customers(id),
  branch_id       uuid NOT NULL REFERENCES branches(id),
  bucket          text NOT NULL,
  status          text NOT NULL,
  assigned_to     uuid NOT NULL REFERENCES users(id),
  overdue_amount  numeric(14,2) NOT NULL,
  days_past_due   integer NOT NULL,
  last_contact_at timestamptz,
  next_action_at  timestamptz,
  ptp_amount      numeric(14,2),
  ptp_date        date,
  recovery_stage  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id           uuid PRIMARY KEY,
  ref          text UNIQUE NOT NULL,
  category     text NOT NULL,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  related_type text NOT NULL,
  related_id   uuid,
  assignee_id  uuid NOT NULL REFERENCES users(id),
  branch_id    uuid NOT NULL REFERENCES branches(id),
  priority     text NOT NULL,
  status       text NOT NULL,
  due_at       timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE authorization_requests (
  id            uuid PRIMARY KEY,
  type          text NOT NULL,
  reference     text NOT NULL,
  requested_by  uuid NOT NULL REFERENCES users(id),
  approver_id   uuid REFERENCES users(id),
  status        text NOT NULL,
  amount        numeric(14,2),
  notes         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);

CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid NOT NULL REFERENCES users(id),
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  summary     text NOT NULL,
  ip          inet NOT NULL
);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL,
  href       text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blacklist_entries (
  id         uuid PRIMARY KEY,
  name       text NOT NULL,
  pan_masked text,
  phone      text,
  reason     text NOT NULL,
  source     text NOT NULL,
  added_by   uuid NOT NULL REFERENCES users(id),
  added_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE grievances (
  id          uuid PRIMARY KEY,
  ref         text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers(id),
  category    text NOT NULL,
  subject     text NOT NULL,
  description text NOT NULL,
  priority    text NOT NULL,
  status      text NOT NULL,
  assignee_id uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE esign_requests (
  id             uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id),
  status         text NOT NULL,
  provider       text NOT NULL,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);
```

Activity timelines currently embedded in records (`activities` arrays) become either an `activities` table keyed by entity or JSONB columns; the simplest migration path is a dedicated table with `(entity_type, entity_id, at, actor_id, type, summary)` and an index on `(entity_type, entity_id, at DESC)`.

## 6. Index and integrity checklist

- Unique: `users.email`, all `ref` columns, `document_files.storage_key`, `loan_accounts.disbursement_id`.
- Hot paths: `applications(branch_id, status)`, `applications(owner_id)`, `leads(branch_id, status)`, `repayments(loan_account_id, status)`, `collection_cases(branch_id, status)`, `tasks(assignee_id, status)`, `audit_logs(at DESC)`, active grants and sessions partial indexes.
- Monetary values are `numeric`, never floats; enforce `>= 0` and approved ≤ requested in application logic plus database checks.
- Foreign keys on every relationship above; `ON DELETE` behaviour deliberate (restrict business records, cascade child documents/sessions).
- Audit tables (`audit_logs`, `permission_audits`) are append-only: revoke `UPDATE`/`DELETE` from the app role, add a trigger, and hash-chain `permission_audits`.

## 7. Branch and record security in SQL

Application-level checks remain mandatory. As defense in depth:

- Use a least-privilege database role; no `SUPERUSER`, no DDL at runtime.
- Add row-level security on branch-scoped tables using a session variable set per transaction (`SET LOCAL app.user_id`, `app.branch_ids`).
- RLS must not replace the permission engine; it prevents accidental cross-branch queries, not business-rule escalation.
- Audits and grants should be writable only through the application role's specific insert path.

## 8. Migration plan (requires explicit approval)

1. **Approve schema and hosting target.** Confirm the tables above and the staging/production database providers.
2. Provision two separate databases (staging, production). No customer data in either.
3. Add the driver/migration tooling and `src/server/repositories/*` behind the existing domain modules.
4. Write forward-only migrations; test them on an empty staging database.
5. Back up before any migration; use expand/contract for later changes; never drop columns in the same release as code removal.
6. Seed staging with synthetic demo data only; keep the dev seed path unchanged.
7. Switch `FINCLOUD_STORE_ADAPTER=postgres` in staging, run the regression suite, then request production approval.
8. Decommission the in-memory adapter for production; keep it for local tests.

Until step 1 is approved, no driver is installed, no migration is created, and no database is provisioned.

## 9. Open decisions

- ORM vs SQL-first repositories (recommendation: SQL-first with typed queries to keep audit and transaction semantics explicit).
- Object storage provider for documents in staging/production (local disk is demo-only).
- Retention/partitioning for `audit_logs`, `permission_audits` and `sessions`.
- Whether document bytes live in Postgres (`bytea`) for small demo files or in object storage with metadata in Postgres (recommended: object storage).
