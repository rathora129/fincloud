import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  CircleDot,
  FileText,
  ListTodo,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { ApiError } from "@/server/access";
import { getApplicationDetail, getApplicationsWorkspace } from "@/server/applications";
import { can } from "@/lib/rbac";
import { EMPLOYMENT_LABELS, PRODUCT_LABELS, STATUS_META, humanize } from "@/lib/labels";
import { formatDate, formatDateTime, formatINR, formatRelative } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { EmptyState, PermissionDenied } from "@/components/ui/states";
import { ApplicationActions, DocumentChecklist, LockedNote, VerificationPanel } from "./application-actions";

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "applications:view")) return <PermissionDenied />;

  const { id } = await params;
  let data;
  try {
    data = getApplicationDetail(user, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError && error.status === 403) return <PermissionDenied />;
    throw error;
  }

  const { options } = getApplicationsWorkspace(user, {});
  const { application, customer } = data;
  const canManage = can(user, "applications:manage");
  const required = application.documents.filter((doc) => doc.required);
  const verified = required.filter((doc) => doc.status === "VERIFIED").length;
  const locked = !["NEW", "IN_PROCESS", "SENT_BACK"].includes(application.status);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`Application · ${application.ref}`}
        title={customer.name}
        description={`${PRODUCT_LABELS[application.product]} · ${formatINR(application.requestedAmount)} · ${application.tenureMonths} months at ${application.interestRate}% p.a.`}
        breadcrumbs={[{ label: "Origination" }, { label: "Applications", href: "/applications" }, { label: application.ref }]}
        actions={
          <>
            <StatusBadge status={application.status} className="hidden sm:inline-flex" />
            <ApplicationActions
              application={application}
              owners={options.owners}
              creditOfficers={options.creditOfficers}
              canManage={canManage}
            />
          </>
        }
      />

      {application.status === "SENT_BACK" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Sent back by credit</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
              {application.sentBackReason ?? application.creditDecision?.remarks ?? "Additional information is required."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Loan summary" description="Requested terms and assignment" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail label="Product" value={PRODUCT_LABELS[application.product] ?? application.product} icon={<FileText className="h-3.5 w-3.5" />} />
                <Detail label="Requested amount" value={formatINR(application.requestedAmount)} icon={<Wallet className="h-3.5 w-3.5" />} />
                <Detail label="Interest rate" value={`${application.interestRate}% p.a.`} />
                <Detail label="Tenure" value={`${application.tenureMonths} months`} />
                <Detail label="Branch" value={data.branchName} icon={<Building2 className="h-3.5 w-3.5" />} />
                <Detail label="Owner" value={data.ownerName} />
                <Detail label="Credit officer" value={data.creditOfficerName ?? "Not assigned"} />
                <Detail label="Lead source" value={data.leadRef ?? "Direct application"} />
                <Detail label="Created" value={formatDateTime(application.createdAt)} />
                <Detail label="Submitted" value={application.submittedAt ? formatDateTime(application.submittedAt) : "Not submitted"} />
              </dl>
              <div className="mt-5 rounded-xl bg-ink-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">Purpose</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-700">{application.purpose}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Customer & employment"
              description="Synthetic DEMO customer profile"
              action={
                <Link
                  href={`/customers/${customer.id}`}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50"
                >
                  <UserRound className="h-3.5 w-3.5" /> Open Customer 360
                </Link>
              }
            />
            <CardBody>
              <div className="mb-4 flex items-center gap-3">
                <Avatar name={customer.name} size="lg" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">{customer.name}</p>
                  <p className="text-[11px] text-ink-400 tabular">
                    {customer.ref} · KYC <StatusBadge status={customer.kycStatus} dot={false} />
                  </p>
                </div>
              </div>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail label="Phone" value={customer.phone} icon={<Phone className="h-3.5 w-3.5" />} />
                <Detail label="Email" value={customer.email} icon={<Mail className="h-3.5 w-3.5" />} />
                <Detail label="City" value={`${customer.city}, ${customer.state}`} icon={<MapPin className="h-3.5 w-3.5" />} />
                <Detail label="Employment" value={EMPLOYMENT_LABELS[customer.employmentType] ?? customer.employmentType} />
                <Detail label="Employer" value={customer.employer} />
                <Detail label="Monthly income" value={formatINR(customer.monthlyIncome)} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Document checklist"
              description="Mandatory documents must be uploaded before submission and verified before recommending to credit"
              action={
                <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-600 tabular">
                  {verified}/{required.length} verified
                </span>
              }
            />
            <DocumentChecklist
              applicationId={application.id}
              documents={application.documents}
              canManage={canManage}
              locked={locked}
            />
            {locked ? (
              <div className="border-t border-ink-100 px-5 py-3">
                <LockedNote />
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Verification" description="Manual verification recorded in this DEMO workspace" />
            <CardBody>
              <VerificationPanel
                applicationId={application.id}
                verification={application.verification}
                canManage={canManage}
                locked={locked}
              />
              <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
                No bureau, field or employer APIs are connected. Statuses are recorded manually for demonstration.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Credit decision" description="Decision history from the credit desk" />
            <CardBody>
              {application.creditDecision ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={
                        application.creditDecision.decision === "APPROVE"
                          ? "Approved"
                          : application.creditDecision.decision === "REJECT"
                            ? "Rejected"
                            : "Sent back"
                      }
                      tone={
                        application.creditDecision.decision === "APPROVE"
                          ? "success"
                          : application.creditDecision.decision === "REJECT"
                            ? "danger"
                            : "warning"
                      }
                    />
                    {application.creditDecision.approvedAmount ? (
                      <span className="text-sm text-ink-700">Approved {formatINR(application.creditDecision.approvedAmount)}</span>
                    ) : null}
                  </div>
                  <p className="text-sm leading-relaxed text-ink-700">{application.creditDecision.remarks}</p>
                  <p className="text-[11px] text-ink-400">
                    {data.decisionByName ?? "Credit"} · {formatDateTime(application.creditDecision.decidedAt)}
                  </p>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-ink-500">
                  <CalendarClock className="h-4 w-4" />
                  {application.status === "RECOMMENDED"
                    ? "Recommended to credit — decision pending."
                    : "No credit decision recorded yet."}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity trail" description="Every stage change is retained for audit review" />
            <ul className="px-5 py-4">
              {data.activities.map((activity) => (
                <li key={activity.id} className="relative flex gap-3 pb-4 last:pb-0">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-100" />
                  <div className="min-w-0">
                    <p className="text-sm text-ink-800">{activity.summary}</p>
                    <p className="mt-0.5 text-[11px] text-ink-400">
                      {activity.actorName} · {formatDateTime(activity.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="File status" description="Processing snapshot" />
            <CardBody className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-600">Current stage</span>
                <StatusBadge status={application.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-600">Risk band</span>
                <span className="text-sm text-ink-800">{application.riskBand ? humanize(application.riskBand) : "Not assessed"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-600">Intake</span>
                <span className="text-sm text-ink-800">{application.isAuto ? "Auto application" : "Manual"}</span>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-500">
                  <span>Document verification</span>
                  <span className="tabular">
                    {verified}/{required.length}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${required.length ? (verified / required.length) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl bg-ink-50/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">Owner</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Avatar name={data.ownerName} color={data.ownerColor} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-ink-800">{data.ownerName}</p>
                    <p className="text-[11px] text-ink-500">{data.branchName}</p>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Linked records" description="Downstream lifecycle" />
            <CardBody className="space-y-3">
              <LinkedRow
                icon={<BadgeCheck className="h-4 w-4 text-brand-600" />}
                label="Sanction"
                value={data.sanction ? `${data.sanction.ref} · ${formatINR(data.sanction.approvedAmount)}` : null}
                status={data.sanction?.status}
              />
              <LinkedRow
                icon={<Banknote className="h-4 w-4 text-brand-600" />}
                label="Disbursement"
                value={data.disbursement ? `${data.disbursement.ref} · ${formatINR(data.disbursement.amount)}` : null}
                status={data.disbursement?.status}
              />
              <LinkedRow
                icon={<Wallet className="h-4 w-4 text-brand-600" />}
                label="Loan account"
                value={data.loanAccount ? `${data.loanAccount.ref} · EMI ${formatINR(data.loanAccount.emiAmount)}` : null}
                status={data.loanAccount?.status}
              />
              {!data.sanction && !data.disbursement && !data.loanAccount ? (
                <p className="text-xs leading-relaxed text-ink-500">
                  Sanction, disbursement and loan-servicing records appear here as the application advances.
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Related tasks" description="Operational follow-through" />
            <CardBody>
              {data.tasks.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-ink-500">
                  <ListTodo className="h-4 w-4" /> No tasks linked to this application.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {data.tasks.map((task) => (
                    <li key={task.id} className="rounded-xl border border-ink-100 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-ink-800">{task.title}</p>
                          <p className="mt-0.5 text-[11px] text-ink-400">
                            {task.ref} · due {formatDate(task.dueDate)}
                          </p>
                        </div>
                        <StatusBadge status={task.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-3 text-[11px] leading-relaxed text-ink-400">
            <CircleDot className="mb-1 inline h-3 w-3" /> DEMO file — synthetic customer and document metadata. No real
            credit bureau, e-sign, KYC or payment integrations are invoked.
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 flex items-center gap-1.5 text-sm text-ink-800">{value}</dd>
    </div>
  );
}

function LinkedRow({
  icon,
  label,
  value,
  status,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  status?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-ink-100 px-3 py-2.5">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink-800">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-500">{value ?? "Not created yet"}</p>
      </div>
      {status ? <StatusBadge status={status} dot={false} /> : null}
    </div>
  );
}
