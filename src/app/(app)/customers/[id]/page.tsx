import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  FileText,
  ListTodo,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { ApiError } from "@/server/access";
import { getCustomerDetail } from "@/server/customers";
import { can } from "@/lib/rbac";
import {
  BUCKET_LABELS,
  EMPLOYMENT_LABELS,
  GENDER_LABELS,
  PRODUCT_LABELS,
  TASK_CATEGORY_LABELS,
  humanize,
  statusMeta,
} from "@/lib/labels";
import {
  formatDate,
  formatDateTime,
  formatINR,
  formatPercent,
  formatRelative,
} from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { EmptyState, InlineNote, PermissionDenied } from "@/components/ui/states";
import { LinkTabs } from "@/components/ui/tabs";
import { StatCard } from "@/components/ui/stat-card";

export const metadata = { title: "Customer 360" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "contact", label: "Contact" },
  { key: "employment", label: "Employment" },
  { key: "applications", label: "Applications" },
  { key: "documents", label: "Documents" },
  { key: "verification", label: "Verification" },
  { key: "sanctions", label: "Sanctions" },
  { key: "disbursements", label: "Disbursements" },
  { key: "repayments", label: "Repayments" },
  { key: "collections", label: "Collections" },
  { key: "remarks", label: "Remarks" },
  { key: "timeline", label: "Timeline" },
] as const;

const RISK_META = {
  HEALTHY: { label: "Healthy", tone: "success" },
  WATCH: { label: "Watchlist", tone: "warning" },
  STRESS: { label: "Stress", tone: "danger" },
} as const;

const VERIFICATION_FIELDS: { key: "identity" | "address" | "employment" | "income"; label: string }[] = [
  { key: "identity", label: "Identity" },
  { key: "address", label: "Address" },
  { key: "employment", label: "Employment" },
  { key: "income", label: "Income" },
];

function DataPoint({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/40 px-3 py-2">
      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium text-ink-900 tabular">{value}</dd>
    </div>
  );
}

function EmptyCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <EmptyState title={title} description={description} />
    </Card>
  );
}

function TableShell({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50/70">
            {head.map((column) => (
              <th
                key={column}
                className="px-5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-400"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}

const cellLink = "font-medium text-brand-700 tabular hover:underline underline-offset-2";

export default async function Customer360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "customers:view")) return <PermissionDenied />;

  const { id } = await params;
  let data;
  try {
    data = getCustomerDetail(user, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError && error.status === 403) return <PermissionDenied />;
    throw error;
  }

  const paramsValue = await searchParams;
  const rawTab = Array.isArray(paramsValue.tab) ? paramsValue.tab[0] : paramsValue.tab;
  const activeTab = TABS.some((tab) => tab.key === rawTab) ? (rawTab as (typeof TABS)[number]["key"]) : "overview";

  const {
    customer,
    branchName,
    people,
    applications,
    sanctions,
    disbursements,
    loans,
    repayments,
    collections,
    leads,
    tasks,
    grievances,
    esign,
    documents,
    remarks,
    timeline,
    summary,
  } = data;

  const hrefFor = (tab: string) =>
    tab === "overview" ? `/customers/${customer.id}` : `/customers/${customer.id}?tab=${tab}`;

  const counts: Partial<Record<(typeof TABS)[number]["key"], number>> = {
    applications: applications.length,
    documents: documents.length,
    verification: applications.length,
    sanctions: sanctions.length,
    disbursements: disbursements.length,
    repayments: repayments.length,
    collections: collections.length,
    remarks: remarks.length,
    timeline: timeline.length,
  };

  const age = Math.max(
    0,
    Math.floor((Date.now() - new Date(customer.dob).getTime()) / (365.25 * 86_400_000)),
  );
  const activeLoans = loans.filter((loan) => loan.status === "ACTIVE" || loan.status === "OVERDUE");
  const obligation = activeLoans.reduce((total, loan) => total + loan.emiAmount, 0);
  const foir = customer.monthlyIncome > 0 ? (obligation / customer.monthlyIncome) * 100 : 0;
  const maxDpd = loans.length ? Math.max(...loans.map((loan) => loan.dpd)) : 0;
  const openCollections = collections.filter((collection) => collection.status !== "RESOLVED");
  const openTasks = tasks.filter((task) => ["OPEN", "IN_PROGRESS", "ESCALATED"].includes(task.status));
  const openGrievances = grievances.filter((grievance) => grievance.status !== "RESOLVED");
  const productMix = applications.reduce<Record<string, number>>((acc, application) => {
    acc[application.product] = (acc[application.product] ?? 0) + 1;
    return acc;
  }, {});
  const risk = RISK_META[summary.risk];
  const verifiedDocs = documents.filter((document) => document.status === "VERIFIED").length;
  const outstandingDocs = documents.filter((document) => ["PENDING", "UPLOADED"].includes(document.status)).length;
  const appById = new Map(applications.map((application) => [application.id, application]));
  const loanById = new Map(loans.map((loan) => [loan.id, loan]));
  const latestApplication = applications[0] ?? null;
  const primaryOfficer = latestApplication ? people[latestApplication.ownerId] : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`Customer 360 · ${customer.ref}`}
        title={customer.name}
        description={`${EMPLOYMENT_LABELS[customer.employmentType]} · ${customer.city}, ${customer.state} · Relationship opened ${formatDate(customer.relationshipSince)}`}
        breadcrumbs={[{ label: "Customer 360", href: "/customers" }, { label: customer.ref }]}
        actions={
          <>
            <StatusBadge status={customer.kycStatus} label={`KYC ${customer.kycStatus.toLowerCase()}`} />
            <Link
              href={`/applications?q=${encodeURIComponent(customer.ref)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[12px] font-medium text-ink-700 transition hover:border-ink-300 hover:bg-ink-50"
            >
              <FileText className="h-3.5 w-3.5" /> Applications
            </Link>
          </>
        }
      />

      {customer.kycStatus === "REJECTED" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
          <div>
            <p className="text-sm font-semibold text-rose-900">KYC rejected</p>
            <p className="mt-0.5 text-xs leading-relaxed text-rose-800">
              Identity verification failed for this synthetic profile. New credit should not be extended until the
              relationship is re-verified by the branch operations team.
            </p>
          </div>
        </div>
      ) : customer.kycStatus === "PENDING" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-semibold text-amber-900">KYC verification pending</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
              Identity and address checks are still open for this customer. Document and verification tabs show the
              per-application evidence required for closure.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Outstanding exposure"
          value={formatINR(summary.outstanding)}
          hint={`${summary.activeLoans} active loan${summary.activeLoans === 1 ? "" : "s"}`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Sanctioned lifetime"
          value={formatINR(summary.sanctionedAmount)}
          hint={`${sanctions.length} sanction record${sanctions.length === 1 ? "" : "s"}`}
          icon={<BadgeCheck className="h-4 w-4" />}
          accent="sky"
        />
        <StatCard
          label="Disbursed"
          value={formatINR(summary.disbursedAmount)}
          hint={`${disbursements.length} payout record${disbursements.length === 1 ? "" : "s"}`}
          icon={<Banknote className="h-4 w-4" />}
          accent="ink"
        />
        <StatCard
          label="Collected"
          value={formatINR(summary.collected)}
          hint="EMIs marked paid"
          icon={<CircleDollarSign className="h-4 w-4" />}
        />
        <StatCard
          label="Overdue"
          value={formatINR(summary.overdueAmount)}
          hint={openCollections.length ? `${openCollections.length} open collection case(s)` : "No open cases"}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={summary.overdueAmount > 0 ? "rose" : "ink"}
        />
        <StatCard
          label="Applications"
          value={applications.length}
          hint={`${summary.approvedApplications} approved`}
          icon={<FileText className="h-4 w-4" />}
          accent="amber"
        />
      </div>

      <div className="surface rounded-2xl px-4 pt-1">
        <LinkTabs
          className="border-b-0"
          items={TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
            count: activeTab === tab.key ? -1 : counts[tab.key],
            href: hrefFor(tab.key),
          }))}
        />
      </div>

      {activeTab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader
                title="Identity & relationship"
                description={`${customer.ref} · ${branchName}`}
                action={<StatusBadge status={customer.kycStatus} label={`KYC ${customer.kycStatus.toLowerCase()}`} />}
              />
              <CardBody className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={customer.name} size="lg" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{customer.name}</p>
                      <p className="text-[11.5px] text-ink-500">
                        {EMPLOYMENT_LABELS[customer.employmentType]} · {customer.employer}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-400">
                        Primary officer {primaryOfficer?.name ?? "Unassigned"} · Last activity{" "}
                        {formatRelative(summary.lastActivityAt)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={summary.risk} label={`Risk · ${risk.label}`} tone={risk.tone} />
                </div>
                <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <DataPoint label="Customer reference" value={customer.ref} />
                  <DataPoint label="Date of birth" value={`${formatDate(customer.dob)} · ${age} yrs`} />
                  <DataPoint label="Gender" value={GENDER_LABELS[customer.gender] ?? customer.gender} />
                  <DataPoint label="PAN (masked)" value={customer.panMasked} />
                  <DataPoint label="Aadhaar (masked)" value={customer.aadhaarMasked} />
                  <DataPoint label="Branch" value={branchName} />
                  <DataPoint label="Relationship age" value={`${summary.relationshipDays} days`} />
                  <DataPoint label="Last activity" value={formatDateTime(summary.lastActivityAt)} />
                  <DataPoint label="KYC state" value={statusMeta(customer.kycStatus).label} />
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Relationship snapshot"
                description="Lifetime origination and servicing position across all products"
              />
              <CardBody className="space-y-4">
                <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <DataPoint label="Applications" value={applications.length} />
                  <DataPoint label="Approved files" value={summary.approvedApplications} />
                  <DataPoint label="Sanctioned amount" value={formatINR(summary.sanctionedAmount)} />
                  <DataPoint label="Disbursed amount" value={formatINR(summary.disbursedAmount)} />
                  <DataPoint label="Active loans" value={summary.activeLoans} />
                  <DataPoint label="Collected to date" value={formatINR(summary.collected)} />
                  <DataPoint label="Outstanding" value={formatINR(summary.outstanding)} />
                  <DataPoint label="Overdue amount" value={formatINR(summary.overdueAmount)} />
                  <DataPoint label="Max DPD" value={`${maxDpd} days`} />
                </dl>
                {Object.keys(productMix).length ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(productMix).map(([product, count]) => (
                      <span
                        key={product}
                        className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-600 ring-1 ring-inset ring-ink-100"
                      >
                        {PRODUCT_LABELS[product] ?? product}
                        <span className="rounded-full bg-white px-1.5 text-[10px] tabular text-ink-500">{count}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Open operational tasks"
                description="Tasks linked to this customer's applications, loans or collection cases"
                action={
                  <Link href="/tasks" className="text-[12px] font-medium text-brand-700 hover:underline">
                    Task board
                  </Link>
                }
              />
              {openTasks.length ? (
                <ul className="divide-y divide-ink-100">
                  {openTasks.slice(0, 5).map((task) => (
                    <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink-800">{task.title}</p>
                        <p className="mt-0.5 text-[11px] text-ink-400">
                          {task.ref} · {TASK_CATEGORY_LABELS[task.category] ?? humanize(task.category)} · Due{" "}
                          {formatDate(task.dueDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={task.priority} />
                        <StatusBadge status={task.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-center text-xs text-ink-400">No open tasks for this customer.</p>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Risk & exposure" description="Credit and collection signals at a glance" />
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Relationship risk</span>
                  <StatusBadge status={summary.risk} label={risk.label} tone={risk.tone} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Outstanding</span>
                  <span className="text-[13px] font-semibold text-ink-900 tabular">{formatINR(summary.outstanding)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Overdue</span>
                  <span className="text-[13px] font-semibold text-rose-700 tabular">{formatINR(summary.overdueAmount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Highest DPD</span>
                  <span className="text-[13px] font-medium text-ink-800 tabular">{maxDpd} days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Open collection cases</span>
                  <span className="text-[13px] font-medium text-ink-800 tabular">{openCollections.length}</span>
                </div>
                {openCollections[0] ? (
                  <Link
                    href={`/collections/${openCollections[0].id}`}
                    className="mt-1 block rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2 text-[11.5px] text-ink-600 transition hover:border-ink-200 hover:bg-ink-50"
                  >
                    Next action {formatDate(openCollections[0].nextActionAt)} · open {openCollections[0].ref}
                  </Link>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Sourced leads" description="Leads converted into this customer's files" />
              {leads.length ? (
                <ul className="divide-y divide-ink-100">
                  {leads.slice(0, 4).map((lead) => (
                    <li key={lead.id} className="px-5 py-3">
                      <Link href={`/leads/${lead.id}`} className="text-[12.5px] font-medium text-brand-700 hover:underline">
                        {lead.ref}
                      </Link>
                      <p className="mt-0.5 truncate text-[11px] text-ink-500">
                        {lead.source.replaceAll("_", " ").toLowerCase()} · owner {people[lead.ownerId]?.name ?? "—"}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-center text-xs text-ink-400">No originating lead linked to these files.</p>
              )}
            </Card>

            <Card>
              <CardHeader title="Open grievances" description="Service requests raised by the customer" />
              {openGrievances.length ? (
                <ul className="divide-y divide-ink-100">
                  {openGrievances.slice(0, 4).map((grievance) => (
                    <li key={grievance.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-ink-800">{grievance.ref}</span>
                        <StatusBadge status={grievance.status} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-500">{grievance.description}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-center text-xs text-ink-400">No open grievances.</p>
              )}
            </Card>

            <InlineNote tone="warning">
              DEMO record. This customer, identity reference and all financial entries are synthetic. No real KYC
              documents, bureau data, SMS, email or payments are involved.
            </InlineNote>
          </div>
        </div>
      ) : null}

      {activeTab === "contact" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Contact channels"
              description="Synthetic contact details held on the demo customer master"
            />
            <CardBody className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/40 px-3.5 py-3">
                <Phone className="mt-0.5 h-4 w-4 text-ink-400" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Mobile</p>
                  <p className="mt-0.5 text-[13px] font-medium text-ink-900 tabular">{customer.phone}</p>
                  <p className="text-[11px] text-ink-400">Synthetic number · no calls or SMS are sent</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/40 px-3.5 py-3">
                <Mail className="mt-0.5 h-4 w-4 text-ink-400" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Email</p>
                  <p className="mt-0.5 truncate text-[13px] font-medium text-ink-900">{customer.email}</p>
                  <p className="text-[11px] text-ink-400">Synthetic mailbox · no email is dispatched</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/40 px-3.5 py-3">
                <MapPin className="mt-0.5 h-4 w-4 text-ink-400" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Registered address</p>
                  <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink-900">
                    {customer.addressLine}
                    <br />
                    {customer.city}, {customer.state} {customer.pincode}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Communication preferences" description="DEMO configuration, not persisted" />
            <CardBody className="space-y-3">
              <DataPoint label="Preferred channel" value="Mobile · WhatsApp note only" />
              <DataPoint label="Language" value="English (India)" />
              <DataPoint label="Statement delivery" value="Email · monthly" />
              <DataPoint label="Marketing consent" value="Not captured in DEMO" />
              <InlineNote>
                Real WhatsApp, SMS and email delivery is intentionally disabled. Follow-ups are recorded against the
                lead or collection case as internal notes.
              </InlineNote>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {activeTab === "employment" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Employment profile" description="Declared occupation and income for credit assessment" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-2.5">
                <DataPoint label="Employment type" value={EMPLOYMENT_LABELS[customer.employmentType]} />
                <DataPoint label="Employer" value={customer.employer} />
                <DataPoint label="Monthly income" value={`${formatINR(customer.monthlyIncome)}/mo`} />
                <DataPoint label="Annualised income" value={formatINR(customer.monthlyIncome * 12)} />
                <DataPoint label="Branch" value={branchName} />
                <DataPoint label="KYC state" value={statusMeta(customer.kycStatus).label} />
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Obligation capacity" description="Active EMI load against declared income" />
            <CardBody className="space-y-4">
              <dl className="grid grid-cols-2 gap-2.5">
                <DataPoint label="Active loans" value={activeLoans.length} />
                <DataPoint label="Monthly EMI obligation" value={formatINR(obligation)} />
                <DataPoint label="Fixed obligation ratio" value={formatPercent(foir)} />
                <DataPoint label="Outstanding" value={formatINR(summary.outstanding)} />
              </dl>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-ink-500">
                  <span>FOIR utilisation</span>
                  <span className="tabular">{formatPercent(Math.min(100, foir))}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={`h-full rounded-full ${foir > 55 ? "bg-rose-500" : foir > 40 ? "bg-amber-500" : "bg-brand-500"}`}
                    style={{ width: `${Math.min(100, foir)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-ink-400">
                  Indicative only. Policy thresholds and underwriting rules are evaluated in the credit module.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {activeTab === "applications" ? (
        applications.length ? (
          <Card className="overflow-hidden">
            <CardHeader
              title="Loan applications"
              description={`${applications.length} file${applications.length === 1 ? "" : "s"} across the customer lifecycle`}
              action={
                <Link
                  href={`/applications?q=${encodeURIComponent(customer.ref)}`}
                  className="text-[12px] font-medium text-brand-700 hover:underline"
                >
                  Open in applications
                </Link>
              }
            />
            <TableShell head={["Application", "Product", "Requested", "Status", "Owner", "Credit officer", "Created"]}>
              {applications.map((application) => (
                <tr key={application.id} className="transition hover:bg-ink-50/60">
                  <td className="px-5 py-3">
                    <Link href={`/applications/${application.id}`} className={cellLink}>
                      {application.ref}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-ink-400">{application.isAuto ? "Auto-created" : "Manual"}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-ink-700">{PRODUCT_LABELS[application.product] ?? application.product}</p>
                    <p className="mt-0.5 text-[11px] text-ink-400">
                      {application.tenureMonths} mo · {application.interestRate}%
                    </p>
                  </td>
                  <td className="px-5 py-3 font-medium text-ink-800 tabular">{formatINR(application.requestedAmount)}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={application.status} />
                  </td>
                  <td className="px-5 py-3 text-ink-700">{people[application.ownerId]?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-700">
                    {application.creditOfficerId ? people[application.creditOfficerId]?.name ?? "—" : "Not assigned"}
                  </td>
                  <td className="px-5 py-3 text-ink-500 tabular">{formatDate(application.createdAt)}</td>
                </tr>
              ))}
            </TableShell>
          </Card>
        ) : (
          <EmptyCard
            title="No applications yet"
            description="This customer has no loan files. Convert a lead or create an application from the origination module."
          />
        )
      ) : null}

      {activeTab === "documents" ? (
        documents.length ? (
          <Card className="overflow-hidden">
            <CardHeader
              title="Document vault"
              description={`${documents.length} document checks · ${verifiedDocs} verified · ${outstandingDocs} pending`}
            />
            <TableShell head={["Application", "Document", "Required", "Status", "Uploaded"]}>
              {documents.map((document) => (
                <tr key={`${document.applicationId}-${document.id}`} className="transition hover:bg-ink-50/60">
                  <td className="px-5 py-3">
                    <Link href={`/applications/${document.applicationId}`} className={cellLink}>
                      {document.applicationRef}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-ink-400">{PRODUCT_LABELS[document.product] ?? document.product}</p>
                  </td>
                  <td className="px-5 py-3 text-ink-700">{document.name}</td>
                  <td className="px-5 py-3">
                    <span className={document.required ? "text-ink-700" : "text-ink-400"}>
                      {document.required ? "Required" : "Optional"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={document.status} />
                  </td>
                  <td className="px-5 py-3 text-ink-500 tabular">
                    {document.uploadedAt ? formatDateTime(document.uploadedAt) : "Not uploaded"}
                  </td>
                </tr>
              ))}
            </TableShell>
          </Card>
        ) : (
          <EmptyCard
            title="No documents on file"
            description="Documents appear here once an application checklist has been raised for this customer."
          />
        )
      ) : null}

      {activeTab === "verification" ? (
        applications.length ? (
          <div className="space-y-3">
            {applications.map((application) => {
              const request = esign.find((item) => item.applicationId === application.id);
              return (
                <Card key={application.id}>
                  <CardHeader
                    title={
                      <Link href={`/applications/${application.id}`} className="text-brand-700 hover:underline">
                        {application.ref}
                      </Link>
                    }
                    description={`${PRODUCT_LABELS[application.product] ?? application.product} · ${formatINR(application.requestedAmount)}`}
                    action={<StatusBadge status={application.status} />}
                  />
                  <CardBody className="space-y-4">
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {VERIFICATION_FIELDS.map((field) => (
                        <div key={field.key} className="rounded-lg border border-ink-100 bg-ink-50/40 px-3 py-2">
                          <p className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">
                            {field.label}
                          </p>
                          <div className="mt-1">
                            <StatusBadge status={application.verification[field.key]} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-ink-500">
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-ink-400" />
                        KYC profile {statusMeta(customer.kycStatus).label.toLowerCase()}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-ink-400" />
                        eSign {request ? request.status.replaceAll("_", " ").toLowerCase() : "not initiated"}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyCard
            title="No verification records"
            description="Identity, address, employment and income checks are captured against each application."
          />
        )
      ) : null}

      {activeTab === "sanctions" ? (
        sanctions.length ? (
          <Card className="overflow-hidden">
            <CardHeader title="Sanction offers" description="Approved terms issued to this customer" />
            <TableShell head={["Sanction", "Application", "Approved amount", "Terms", "Status", "Requested", "Decided"]}>
              {sanctions.map((sanction) => (
                <tr key={sanction.id} className="transition hover:bg-ink-50/60">
                  <td className="px-5 py-3">
                    <Link href={`/sanctions/${sanction.id}`} className={cellLink}>
                      {sanction.ref}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/applications/${sanction.applicationId}`} className={cellLink}>
                      {appById.get(sanction.applicationId)?.ref ?? "Application"}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-medium text-ink-800 tabular">{formatINR(sanction.approvedAmount)}</td>
                  <td className="px-5 py-3 text-ink-600">
                    {sanction.tenureMonths} mo · {sanction.interestRate}% · fee {formatINR(sanction.processingFee)}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={sanction.status} />
                  </td>
                  <td className="px-5 py-3 text-ink-500 tabular">{formatDate(sanction.requestedAt)}</td>
                  <td className="px-5 py-3 text-ink-500 tabular">
                    {sanction.decidedAt ? formatDate(sanction.decidedAt) : "Pending"}
                  </td>
                </tr>
              ))}
            </TableShell>
          </Card>
        ) : (
          <EmptyCard
            title="No sanction offers"
            description="Sanction records are raised after a credit-approved application. Nothing has been issued to this customer yet."
          />
        )
      ) : null}

      {activeTab === "disbursements" ? (
        disbursements.length ? (
          <Card className="overflow-hidden">
            <CardHeader
              title="Disbursements"
              description="DEMO payout records. No real bank transfer is initiated by this system."
            />
            <TableShell head={["Disbursement", "Application", "Amount", "Mode", "Status", "Requested", "Processed"]}>
              {disbursements.map((disbursement) => (
                <tr key={disbursement.id} className="transition hover:bg-ink-50/60">
                  <td className="px-5 py-3">
                    <Link href={`/disbursements/${disbursement.id}`} className={cellLink}>
                      {disbursement.ref}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-ink-400">{disbursement.bankRef ?? "No DEMO bank reference"}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/applications/${disbursement.applicationId}`} className={cellLink}>
                      {appById.get(disbursement.applicationId)?.ref ?? "Application"}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-medium text-ink-800 tabular">{formatINR(disbursement.amount)}</td>
                  <td className="px-5 py-3 text-ink-600">{disbursement.mode}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={disbursement.status} />
                  </td>
                  <td className="px-5 py-3 text-ink-500 tabular">{formatDate(disbursement.requestedAt)}</td>
                  <td className="px-5 py-3 text-ink-500 tabular">
                    {disbursement.processedAt ? formatDate(disbursement.processedAt) : "Not processed"}
                  </td>
                </tr>
              ))}
            </TableShell>
          </Card>
        ) : (
          <EmptyCard
            title="No disbursements"
            description="Completed sanctions feed the disbursement desk. No payout has been recorded for this customer."
          />
        )
      ) : null}

      {activeTab === "repayments" ? (
        repayments.length ? (
          <Card className="overflow-hidden">
            <CardHeader
              title="Repayment schedule"
              description={`${repayments.length} instalment${repayments.length === 1 ? "" : "s"} across ${loans.length} loan account${loans.length === 1 ? "" : "s"}`}
            />
            <TableShell head={["Instalment", "Loan account", "Due date", "Amount", "Status", "Paid", "Mode", "Receipt"]}>
              {repayments.map((repayment) => (
                <tr key={repayment.id} className="transition hover:bg-ink-50/60">
                  <td className="px-5 py-3 font-medium text-ink-800 tabular">{repayment.ref}</td>
                  <td className="px-5 py-3 text-ink-600 tabular">
                    {loanById.get(repayment.loanAccountId)?.ref ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-ink-600 tabular">{formatDate(repayment.dueDate)}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink-800 tabular">{formatINR(repayment.amount)}</p>
                    {repayment.penalty > 0 ? (
                      <p className="mt-0.5 text-[11px] text-rose-600">+ {formatINR(repayment.penalty)} penalty</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={repayment.status} />
                  </td>
                  <td className="px-5 py-3 text-ink-500 tabular">
                    {repayment.paidDate ? formatDate(repayment.paidDate) : "—"}
                  </td>
                  <td className="px-5 py-3 text-ink-500">{repayment.mode ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-500 tabular">{repayment.receiptNo ?? "—"}</td>
                </tr>
              ))}
            </TableShell>
          </Card>
        ) : (
          <EmptyCard
            title="No repayment schedule"
            description="Instalments are generated when a disbursement is completed and a loan account is opened."
          />
        )
      ) : null}

      {activeTab === "collections" ? (
        collections.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {collections.map((collection) => {
              const loan = loanById.get(collection.loanAccountId);
              return (
                <Card key={collection.id}>
                  <CardHeader
                    title={
                      <Link href={`/collections/${collection.id}`} className="text-brand-700 hover:underline">
                        {collection.ref}
                      </Link>
                    }
                    description={`${BUCKET_LABELS[collection.bucket]} · Loan ${loan?.ref ?? "—"}`}
                    action={<StatusBadge status={collection.status} />}
                  />
                  <CardBody className="space-y-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Overdue</p>
                        <p className="text-lg font-semibold text-rose-700 tabular">{formatINR(collection.overdueAmount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">DPD</p>
                        <p className="text-lg font-semibold text-ink-900 tabular">{collection.daysPastDue}</p>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-2">
                      <DataPoint label="Assigned to" value={people[collection.assignedTo]?.name ?? "—"} />
                      <DataPoint
                        label="PTP"
                        value={
                          collection.ptpAmount
                            ? `${formatINR(collection.ptpAmount)} · ${formatDate(collection.ptpDate)}`
                            : "None recorded"
                        }
                      />
                      <DataPoint label="Last contact" value={formatDate(collection.lastContactAt)} />
                      <DataPoint label="Next action" value={formatDate(collection.nextActionAt)} />
                    </dl>
                    <Link
                      href={`/collections/${collection.id}`}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline"
                    >
                      Open case <CalendarClock className="h-3.5 w-3.5" />
                    </Link>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyCard
            title="No collection cases"
            description="This customer has no overdue accounts in the recovery pipeline."
          />
        )
      ) : null}

      {activeTab === "remarks" ? (
        remarks.length ? (
          <Card>
            <CardHeader
              title="Internal remarks"
              description="Credit, sanction, disbursement, collection and support notes recorded against this relationship"
            />
            <ul className="divide-y divide-ink-100">
              {remarks.map((remark) => (
                <li key={remark.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-600">
                      {remark.source}
                    </span>
                    <span className="text-[11px] font-medium text-ink-500 tabular">{remark.ref}</span>
                    <span className="text-[11px] text-ink-400">
                      {remark.author} · {formatDateTime(remark.at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-700">{remark.text}</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyCard
            title="No remarks recorded"
            description="Internal remarks from credit decisions, sanctions, payouts, collections and grievances will appear here."
          />
        )
      ) : null}

      {activeTab === "timeline" ? (
        timeline.length ? (
          <Card>
            <CardHeader
              title="Relationship timeline"
              description={`${timeline.length} event${timeline.length === 1 ? "" : "s"} consolidated from every lifecycle module`}
              action={
                <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-400">
                  <Activity className="h-3.5 w-3.5" /> Newest first
                </span>
              }
            />
            <ol className="relative px-5 py-4">
              <span aria-hidden className="absolute bottom-4 left-[1.85rem] top-4 w-px bg-ink-100" />
              {timeline.slice(0, 60).map((event) => (
                <li key={event.id} className="relative flex gap-3 py-2.5 pl-7">
                  <span className="absolute left-[0.55rem] top-4 h-2 w-2 rounded-full bg-brand-500 ring-4 ring-white" />
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">
                      {humanize(event.type)}
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-800">{event.summary}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-400">
                      {event.href ? (
                        <Link href={event.href} className="font-medium text-brand-700 hover:underline">
                          {event.source}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink-500">{event.source}</span>
                      )}
                      <span>·</span>
                      <span>{event.actor}</span>
                      <span>·</span>
                      <span className="tabular">{formatDateTime(event.at)}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {timeline.length > 60 ? (
              <p className="border-t border-ink-100 px-5 py-3 text-center text-[11px] text-ink-400">
                Showing the 60 most recent events of {timeline.length}.
              </p>
            ) : null}
          </Card>
        ) : (
          <EmptyCard title="No activity yet" description="Lifecycle events will appear here as the relationship progresses." />
        )
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-[11px] text-ink-400">
        <span>
          Customer 360 · read-only aggregation · server-side branch scope enforced ·{" "}
          {outstandingDocs > 0 ? `${outstandingDocs} documents awaiting action` : "documents up to date"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ListTodo className="h-3.5 w-3.5" /> {openTasks.length} open task(s)
        </span>
      </div>
    </div>
  );
}
