# FinCloud LMS — Loan Management System (DEMO)

A premium, production-oriented **loan management system demonstration** built for FINCLOUD. It covers the full retail lending lifecycle — Lead → Application → Credit → Sanction → Disbursement → Repayment → Collection → Recovery → Closure — with a role-aware enterprise shell and a synthetic in-memory dataset.

> **DEMO environment.** All customers, applications, transactions and identity references are synthetic. There are no real transfers, no real KYC documents, no real WhatsApp/SMS/email delivery and no credit-bureau integrations. Do not load production data into this build.

---

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16.4 (App Router, `proxy.ts` guard, Server Components) |
| UI | React 19.3, TypeScript 5.9 (strict), Tailwind CSS 4, Lucide, Framer Motion |
| Data fetching | Server Components + Route Handlers; Axios singleton + typed feature services on the client |
| State | Redux Toolkit (session, UI, notifications) |
| Forms | React Hook Form + Zod 4 |
| Tables / charts | TanStack Table v8, Chart.js 4 via react-chartjs-2 |
| Persistence | Deterministic in-memory demo store (seeded, resets on process restart) |
| Auth | HMAC-signed HttpOnly session cookie (8h), scrypt password hashing |

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm start          # serve the production build
```

### Demo accounts

All demo users share the password **`Fincloud@2026`**. The login screen also lists these profiles and fills them on click.

| Role | Email | Scope |
| --- | --- | --- |
| Super Admin | `superadmin@fincloud.demo` | All branches |
| Admin | `admin@fincloud.demo` | All branches |
| Branch Manager | `manager.mumbai@fincloud.demo` | Mumbai branch |
| Loan Officer | `officer.mumbai@fincloud.demo` | Mumbai branch |
| Credit Officer | `credit.mumbai@fincloud.demo` | Mumbai branch |
| Collection Officer | `collections.mumbai@fincloud.demo` | Mumbai branch |

Roles are enforced server-side; the UI only reflects what the API allows.

## Modules

- **Dashboard** — portfolio KPIs, application/disbursement trends, branch and product performance, role-aware sections.
- **Leads** — new/repeat/pre-approved queues, assignment, follow-ups, stage transitions, conversion into an application.
- **Applications** — intake (manual or auto-created), document checklist, verification gate, submission, credit recommendation, send-back/resubmit.
- **Credit Review** — decision desk with approve/reject/send-back, approved amount, risk band and remarks.
- **Sanctions** — acceptance, processing, approval and rejection of sanction offers.
- **Disbursements** — maker/checker payout flow with DEMO bank references and automatic loan + EMI schedule generation.
- **Collections** — bucket queues, contact logging, PTP capture, recovery/legal movement, repayments and resolution.
- **Customer 360** — a twelve-tab relationship view: overview, contact, employment, applications, documents, verification, sanctions, disbursements, repayments, collections, remarks and consolidated timeline.
- **Tasks** — seven operational categories across a board with transitions and escalation.
- **Authorizations** — payment/LMS/agency approval queue.
- **Reports & MIS** — server-computed reports with print layout, CSV and SpreadsheetML (`.xls`) exports.
- **Users & Roles**, **Audit Logs**, **Support Operations** (eSign/blacklist/grievances), **My Profile**.

## Repository map

```
src/
  app/
    (app)/            authenticated workspace (one folder per module)
    api/              Route Handlers (zod-validated, RBAC + branch scope)
    login/            unauthenticated sign-in
  components/
    layout/           sidebar, header, global search, app shell
    ui/               reusable UI kit (tables, modals, badges, states…)
  lib/                domain types, RBAC, labels, formatting, validation
  server/             server-only domain modules over the demo store
  services/           typed client API wrappers
  store/              Redux Toolkit slices
  proxy.ts            cookie-presence route guard (Next 16 proxy convention)
public/assets/brand/  official FinCloud logo (local copy, unmodified)
```

## Documentation

- [Architecture](docs/architecture.md) — layers, request lifecycle, data model, demo store.
- [Modules, routes & API map](docs/modules-and-routes.md) — pages, endpoints, services and integration gaps.
- [Auth & RBAC](docs/auth-and-rbac.md) — session flow, cookie hardening, roles, permissions, branch scope.
- [Business workflows](docs/workflows.md) — state machines and gates for every lifecycle stage.
- [Implementation checklist](docs/implementation-checklist.md) — what is complete, what awaits backend integration, and how it was verified.

## Branding

The official FinCloud mark is stored at `public/assets/brand/fincloud-logo.png` and rendered locally (never hotlinked), with `src/app/icon.png` as the favicon. The asset is not stretched, recoloured or recreated. The application keeps the navy / white / grey / green identity.

## Demo limitations

- The store is **in-memory**: mutations survive until the Node process restarts, then the deterministic seed is rebuilt.
- Document uploads record synthetic file names only; no binary is stored.
- eSign, bureau checks, SMS/WhatsApp/email, bank transfers and payment gateways are explicitly disabled and labelled DEMO.
- Customer-level internal notes are derived from lifecycle remarks; there is no free-text note authoring yet.
- Real password recovery, SSO and MFA are out of scope for the demo.
