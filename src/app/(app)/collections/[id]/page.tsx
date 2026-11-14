import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Landmark, ShieldCheck, UserRound } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope } from "@/server/access";
import { getCollectionDetail } from "@/server/collections";
import { can } from "@/lib/rbac";
import { BUCKET_LABELS, EMPLOYMENT_LABELS, humanize } from "@/lib/labels";
import { formatDate, formatDateTime, formatINR, maskPhone } from "@/lib/utils";
import type { CollectionStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PermissionDenied } from "@/components/ui/states";
import { CollectionCaseActions } from "./case-actions";

export const metadata = { title: "Collection case" };

const RECOVERY_STEPS: { key: CollectionStatus; label: string }[] = [
  { key: "PRE_COLLECTION", label: "Pre-collection" },
  { key: "PENDING", label: "Pending" },
  { key: "RECOVERY", label: "Recovery" },
  { key: "LEGAL", label: "Legal" },
];

function DataPoint({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/40 px-3 py-2">
      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">{label}</dt>
      <dd className={`mt-0.5 text-[13px] font-medium tabular ${tone ?? "text-ink-900"}`}>{value}</dd>
    </div>
  );
}

export default async function CollectionCasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "collections:view")) {
    return <PermissionDenied className="mt-2" />;
  }

  const { id } = await params;
  const scope = buildScope(user);
  const detail = getCollectionDetail(scope, id);
  if (!detail) notFound();

  const { collectionCase, customer, loan, officer, branchName, repayments, oldestOverdue, activities } = detail;
  const canManage = can(user, "collections:manage");
  const overdue = repayments.filter((repayment) => repayment.status === "OVERDUE");
  const overdueAmount = overdue.reduce((total, repayment) => total + repayment.amount + repayment.penalty, 0);
  const currentIndex =
    collectionCase.status === "RESOLVED"
      ? RECOVERY_STEPS.length
      : RECOVERY_STEPS.findIndex((step) => step.key === collectionCase.status);
  const nextActionPast =
    collectionCase.nextActionAt !== null &&
    collectionCase.status !== "RESOLVED" &&
    new Date(collectionCase.nextActionAt).getTime() < Date.now();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${BUCKET_LABELS[collectionCase.bucket]} · ${branchName}`}
        title={customer?.name ?? "Collection case"}
        description={`Case ${collectionCase.ref} · Loan ${loan?.ref ?? "—"} · Assigned to ${officer?.name ?? "Unassigned"}`}
        breadcrumbs={[{ label: "Collections", href: "/collections" }, { label: collectionCase.ref }]}
        actions={
          <>
            <StatusBadge status={collectionCase.status} className="h-8 px-3" />
            <Link
              href="/collections"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[12px] font-medium text-ink-700 transition hover:border-ink-300 hover:bg-ink-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to queue
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="Customer & loan account"
              description={customer ? `${customer.ref} · ${customer.city}, ${customer.state}` : "Customer record unavailable"}
              action={customer ? <StatusBadge status={customer.kycStatus} label={`KYC ${customer.kycStatus.toLowerCase()}`} /> : undefined}
            />
            <CardBody className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Avatar name={customer?.name ?? "Customer"} size="lg" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">{customer?.name ?? "—"}</p>
                    <p className="text-[11.5px] text-ink-500">
                      {customer ? `${EMPLOYMENT_LABELS[customer.employmentType]} · ${customer.employer}` : "—"}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-500">
                      <span>{customer ? maskPhone(customer.phone) : "—"}</span>
                      <span className="truncate">{customer?.email ?? "—"}</span>
                      <span>Income {formatINR(customer?.monthlyIncome ?? 0)}/mo</span>
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-ink-100 bg-ink-50/50 px-3 py-2 text-right">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">Outstanding</p>
                  <p className="text-base font-semibold tabular text-ink-950">{formatINR(loan?.outstanding ?? 0)}</p>
                  <p className="text-[10px] text-ink-500">{loan?.status ?? "—"} · DPD {loan?.dpd ?? 0}</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <DataPoint label="Principal" value={formatINR(loan?.principal ?? 0)} />
                <DataPoint label="EMI" value={formatINR(loan?.emiAmount ?? 0)} />
                <DataPoint
                  label="Interest rate"
                  value={loan ? `${loan.interestRate.toFixed(2)}% p.a.` : "—"}
                />
                <DataPoint label="Tenure" value={loan ? `${loan.tenureMonths} months` : "—"} />
                <DataPoint label="Paid so far" value={formatINR(loan?.paidAmount ?? 0)} />
                <DataPoint
                  label="Penalty accrued"
                  value={formatINR(loan?.penaltyAccrued ?? 0)}
                  tone={(loan?.penaltyAccrued ?? 0) > 0 ? "text-rose-600" : undefined}
                />
                <DataPoint label="Disbursed" value={formatDate(loan?.disbursedAt ?? null)} />
                <DataPoint label="Next due" value={formatDate(loan?.nextDueDate ?? null)} />
                <DataPoint
                  label="Overdue instalments"
                  value={overdue.length}
                  tone={overdue.length > 0 ? "text-rose-600" : "text-brand-700"}
                />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Repayment schedule"
              description={`${repayments.length} instalments · ${overdue.length} overdue`}
              action={
                <span className="rounded-md bg-rose-50 px-2 py-1 text-[10px] font-semibold tabular text-rose-700">
                  {formatINR(overdueAmount)} overdue
                </span>
              }
            />
            {repayments.length === 0 ? (
              <EmptyState title="No repayment schedule" description="This loan account has no instalments recorded." />
            ) : (
              <div className="max-h-[27rem] overflow-auto">
                <table className="w-full min-w-[720px] text-left text-[12px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-ink-100 bg-ink-50 text-[10px] uppercase tracking-[0.06em] text-ink-500">
                      <th className="bg-ink-50 px-4 py-2.5 font-semibold">Due date</th>
                      <th className="bg-ink-50 px-4 py-2.5 text-right font-semibold">EMI</th>
                      <th className="bg-ink-50 px-4 py-2.5 text-right font-semibold">Principal</th>
                      <th className="bg-ink-50 px-4 py-2.5 text-right font-semibold">Interest</th>
                      <th className="bg-ink-50 px-4 py-2.5 text-right font-semibold">Penalty</th>
                      <th className="bg-ink-50 px-4 py-2.5 font-semibold">Status</th>
                      <th className="bg-ink-50 px-4 py-2.5 font-semibold">Settlement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repayments.map((repayment) => {
                      const isOldest =
                        oldestOverdue !== null && repayment.id === oldestOverdue.id;
                      return (
                        <tr
                          key={repayment.id}
                          className={`border-b border-ink-100/70 last:border-0 ${
                            repayment.status === "OVERDUE" ? "bg-rose-50/40" : ""
                          }`}
                        >
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <span className="flex items-center gap-2 font-medium text-ink-800">
                              {formatDate(repayment.dueDate)}
                              {isOldest ? (
                                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-700">
                                  Oldest due
                                </span>
                              ) : null}
                            </span>
                            <span className="font-mono text-[9.5px] text-ink-400">{repayment.ref}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular text-ink-800">
                            {formatINR(repayment.amount)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular text-ink-500">
                            {formatINR(repayment.principalComponent)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular text-ink-500">
                            {formatINR(repayment.interestComponent)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular text-ink-500">
                            {repayment.penalty > 0 ? formatINR(repayment.penalty) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <StatusBadge status={repayment.status} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[10.5px] text-ink-500">
                            {repayment.status === "PAID" ? (
                              <>
                                <p className="font-medium text-ink-700">{formatDate(repayment.paidDate)}</p>
                                <p>
                                  {repayment.mode ?? "—"} · {repayment.receiptNo ?? "—"}
                                </p>
                              </>
                            ) : (
                              <span className="text-ink-400">Awaiting settlement</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-ink-100 px-4 py-2.5 text-[10.5px] text-ink-500">
              Recording a repayment settles the oldest overdue instalment. Penalty amounts are retained on the schedule.
            </div>
          </Card>

          <Card>
            <CardHeader title="Collection activity" description={`${activities.length} recorded actions`} />
            <CardBody className="space-y-4">
              {activities.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-400">No activity recorded for this case yet.</p>
              ) : (
                activities.map((activity, index) => (
                  <div key={activity.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <Avatar name={activity.actorName} color={activity.actorColor} size="xs" />
                      {index < activities.length - 1 ? <span className="mt-1 w-px flex-1 bg-ink-100" /> : null}
                    </div>
                    <div className={`min-w-0 ${index < activities.length - 1 ? "pb-1" : ""}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-brand-700">
                        {humanize(activity.type)}
                      </p>
                      <p className="mt-0.5 text-[12px] leading-snug text-ink-700">{activity.summary}</p>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        {activity.actorName} · {formatDateTime(activity.at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader title="Case summary" description={collectionCase.recoveryStage} />
            <CardBody className="space-y-3 text-[12px]">
              <div className="flex items-center gap-2.5">
                <Avatar name={officer?.name ?? "Unassigned"} color={officer?.avatarColor} size="sm" />
                <div>
                  <p className="text-[12px] font-medium text-ink-900">{officer?.name ?? "Unassigned"}</p>
                  <p className="text-[10px] text-ink-400">{officer?.designation ?? "Collection officer"}</p>
                </div>
              </div>
              <dl className="space-y-2 border-t border-ink-100 pt-3">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[10.5px] uppercase tracking-[0.05em] text-ink-400">Last contact</dt>
                  <dd className="text-right text-[11.5px] font-medium text-ink-700">
                    {collectionCase.lastContactAt ? formatDateTime(collectionCase.lastContactAt) : "Not contacted"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[10.5px] uppercase tracking-[0.05em] text-ink-400">Next action</dt>
                  <dd
                    className={`text-right text-[11.5px] font-medium ${
                      nextActionPast ? "text-rose-600" : "text-ink-700"
                    }`}
                  >
                    {collectionCase.nextActionAt ? formatDate(collectionCase.nextActionAt) : "Not scheduled"}
                    {nextActionPast ? " · overdue" : ""}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[10.5px] uppercase tracking-[0.05em] text-ink-400">Overdue amount</dt>
                  <dd className="tabular text-right text-[11.5px] font-semibold text-ink-900">
                    {formatINR(collectionCase.overdueAmount)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[10.5px] uppercase tracking-[0.05em] text-ink-400">Bucket</dt>
                  <dd className="text-right text-[11.5px] font-medium text-ink-700">
                    {BUCKET_LABELS[collectionCase.bucket]}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[10.5px] uppercase tracking-[0.05em] text-ink-400">Case opened</dt>
                  <dd className="text-right text-[11.5px] font-medium text-ink-700">
                    {formatDate(collectionCase.createdAt)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[10.5px] uppercase tracking-[0.05em] text-ink-400">Branch</dt>
                  <dd className="text-right text-[11.5px] font-medium text-ink-700">{branchName}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <CollectionCaseActions
            caseId={collectionCase.id}
            caseRef={collectionCase.ref}
            status={collectionCase.status}
            canManage={canManage}
            allowedStatuses={detail.allowedStatuses}
            overdueAmount={collectionCase.overdueAmount}
            ptpAmount={collectionCase.ptpAmount}
            ptpDate={collectionCase.ptpDate}
            oldestOverdue={
              oldestOverdue
                ? {
                    id: oldestOverdue.id,
                    ref: oldestOverdue.ref,
                    dueDate: oldestOverdue.dueDate,
                    amount: oldestOverdue.amount,
                    penalty: oldestOverdue.penalty,
                  }
                : null
            }
          />

          <Card>
            <CardHeader title="Recovery path" description="Workflow stages for this case" />
            <CardBody className="space-y-0">
              {RECOVERY_STEPS.map((step, index) => {
                const reached = index <= currentIndex;
                const isCurrent = index === currentIndex;
                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ${
                          isCurrent
                            ? "bg-brand-600 text-white"
                            : reached
                              ? "bg-brand-100 text-brand-700"
                              : "bg-ink-100 text-ink-400"
                        }`}
                      >
                        {index + 1}
                      </span>
                      {index < RECOVERY_STEPS.length - 1 || collectionCase.status === "RESOLVED" ? (
                        <span
                          className={`my-1 w-px flex-1 ${reached ? "bg-brand-200" : "bg-ink-100"}`}
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    <div className={`pb-3 ${isCurrent ? "" : "opacity-80"}`}>
                      <p
                        className={`text-[12px] font-medium ${
                          isCurrent ? "text-brand-700" : reached ? "text-ink-800" : "text-ink-500"
                        }`}
                      >
                        {step.label}
                      </p>
                      {index === 0 ? <p className="text-[10px] text-ink-400">Upcoming due reminders</p> : null}
                      {index === 1 ? <p className="text-[10px] text-ink-400">Soft follow-up and PTP</p> : null}
                      {index === 2 ? <p className="text-[10px] text-ink-400">Field recovery effort</p> : null}
                      {index === 3 ? <p className="text-[10px] text-ink-400">Legal notice and counsel</p> : null}
                    </div>
                  </div>
                );
              })}
              {collectionCase.status === "RESOLVED" ? (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[9px] font-semibold text-white">
                      ✓
                    </span>
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-brand-700">Resolved</p>
                    <p className="text-[10px] text-ink-400">Collection workflow closed</p>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <div className="flex items-start gap-2 rounded-xl border border-ink-100 bg-white/60 px-3.5 py-3 text-[10px] leading-relaxed text-ink-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
            <p>
              {canManage
                ? "Actions are limited to your branch scope and written to the audit trail."
                : "You have read-only access to collection cases. Ask a branch manager for collections:manage."}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-ink-100 bg-white/60 px-3.5 py-2.5 text-[10.5px] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5" /> {branchName}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" /> {officer?.name ?? "Unassigned"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
