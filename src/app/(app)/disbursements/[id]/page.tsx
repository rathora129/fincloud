import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Landmark,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope } from "@/server/access";
import { getDisbursementDetail } from "@/server/disbursements";
import { can } from "@/lib/rbac";
import { PRODUCT_LABELS, STATUS_META } from "@/lib/labels";
import { formatDate, formatDateTime, formatINR, formatRelative } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, Avatar } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, InlineNote, PermissionDenied } from "@/components/ui/states";
import { DisbursementActions } from "./disbursement-actions";

export const metadata = { title: "Disbursement" };

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100/70 py-2.5 last:border-0">
      <dt className="text-[11.5px] text-ink-500">{label}</dt>
      <dd className="text-[12.5px] font-medium text-ink-900">{value}</dd>
    </div>
  );
}

export default async function DisbursementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "disbursements:view")) return <PermissionDenied className="mt-2" />;

  const { id } = await params;
  const scope = buildScope(user);
  const detail = getDisbursementDetail(scope, id);
  if (!detail) notFound();

  const { disbursement, sanction, application, customer, loanAccount, schedule } = detail;

  const overviewTab = (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Payout request" description="Maker-checker workflow record" />
        <CardBody>
          <dl>
            <Row label="Disbursement ref" value={disbursement.ref} />
            <Row label="Amount" value={formatINR(disbursement.amount)} />
            <Row label="Mode" value={disbursement.mode} />
            <Row label="Status" value={<StatusBadge status={disbursement.status} />} />
            <Row label="Requested on" value={formatDate(disbursement.requestedAt)} />
            <Row
              label="Processed on"
              value={disbursement.processedAt ? formatDateTime(disbursement.processedAt) : "Not processed"}
            />
            <Row label="Processed by" value={detail.processedByName ?? "—"} />
            <Row
              label="Bank reference"
              value={<span className="font-mono text-[11.5px]">{disbursement.bankRef ?? "Not generated"}</span>}
            />
            <Row label="Branch" value={detail.branchName} />
          </dl>
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-800">
              <ShieldAlert className="h-3 w-3" /> DEMO notice
            </p>
            <p className="text-[11.5px] leading-relaxed text-amber-900">
              DEMO mode: no real bank transfer was executed. Bank references are synthetic identifiers generated for
              demonstration only.
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Sanction terms"
            description={sanction ? `${sanction.ref} · ${sanction.interestRate}% p.a.` : "Sanction not available"}
            action={
              sanction ? (
                <Link href={`/sanctions/${sanction.id}`} className="text-[11px] font-medium text-brand-700 hover:text-brand-800">
                  Open sanction
                </Link>
              ) : undefined
            }
          />
          <CardBody>
            {sanction ? (
              <dl>
                <Row label="Sanctioned amount" value={formatINR(sanction.approvedAmount)} />
                <Row label="Interest rate" value={`${sanction.interestRate}% p.a.`} />
                <Row label="Tenure" value={`${sanction.tenureMonths} months`} />
                <Row label="Processing fee" value={formatINR(sanction.processingFee)} />
                <Row label="Indicative EMI" value={formatINR(detail.emiAmount)} />
                <Row label="Sanction status" value={<StatusBadge status={sanction.status} />} />
              </dl>
            ) : (
              <EmptyState title="No sanction linked" description="This payout request has no sanction record in scope." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Customer & application"
            description={application ? `${application.ref} · ${PRODUCT_LABELS[application.product] ?? application.product}` : "Application not available"}
          />
          <CardBody className="space-y-3">
            {customer ? (
              <div className="flex items-center gap-3">
                <Avatar name={customer.name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{customer.name}</p>
                  <p className="truncate text-[11px] text-ink-500">
                    {customer.ref} · {customer.city} · {customer.phone}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {customer ? (
                <Link
                  href={`/customers/${customer.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 text-[11.5px] font-medium text-ink-700 transition hover:border-ink-300"
                >
                  <UserRound className="h-3.5 w-3.5" /> Customer 360
                </Link>
              ) : null}
              {application ? (
                <Link
                  href={`/applications/${application.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 text-[11.5px] font-medium text-ink-700 transition hover:border-ink-300"
                >
                  <FileText className="h-3.5 w-3.5" /> Application
                </Link>
              ) : null}
            </div>
            {application ? (
              <dl>
                <Row label="Application status" value={<StatusBadge status={application.status} />} />
                <Row label="Requested amount" value={formatINR(application.requestedAmount)} />
                <Row label="Tenure" value={`${application.tenureMonths} months`} />
              </dl>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );

  const scheduleTab = loanAccount ? (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Loan account"
          description={`${loanAccount.ref} · created on completion (DEMO)`}
          action={<StatusBadge status={loanAccount.status} />}
        />
        <CardBody className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: "Principal", value: formatINR(loanAccount.principal) },
            { label: "EMI", value: formatINR(loanAccount.emiAmount) },
            { label: "Outstanding", value: formatINR(loanAccount.outstanding) },
            { label: "Next due", value: formatDate(loanAccount.nextDueDate) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-ink-100 bg-white p-3">
              <p className="text-[10px] uppercase tracking-[0.05em] text-ink-400">{item.label}</p>
              <p className="mt-1 text-[14px] font-semibold tabular text-ink-950">{item.value}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Repayment schedule" description={`${schedule.length} illustrative EMI entries, all pending`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/70 text-[10px] uppercase tracking-[0.06em] text-ink-500">
                <th className="px-4 py-2.5 font-semibold">Due date</th>
                <th className="px-4 py-2.5 font-semibold">EMI</th>
                <th className="px-4 py-2.5 font-semibold">Principal</th>
                <th className="px-4 py-2.5 font-semibold">Interest</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((repayment) => (
                <tr key={repayment.id} className="border-b border-ink-100/70 last:border-0">
                  <td className="px-4 py-2.5 text-ink-700">{formatDate(repayment.dueDate)}</td>
                  <td className="px-4 py-2.5 tabular font-medium text-ink-900">{formatINR(repayment.amount)}</td>
                  <td className="px-4 py-2.5 tabular text-ink-600">{formatINR(repayment.principalComponent)}</td>
                  <td className="px-4 py-2.5 tabular text-ink-600">{formatINR(repayment.interestComponent)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={repayment.status} dot={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <InlineNote>
        The schedule uses standard amortisation with illustrative rounding. It is not a binding repayment plan and no
        auto-debit (NACH) mandate exists in DEMO mode.
      </InlineNote>
    </div>
  ) : (
    <Card>
      <CardBody>
        <EmptyState
          title="No loan account yet"
          description="A synthetic loan account and repayment schedule are generated only when the disbursement is marked completed (DEMO)."
        />
      </CardBody>
    </Card>
  );

  const timelineTab = (
    <Card>
      <CardHeader title="Processing timeline" description="Every maker-checker step is audit-logged" />
      <CardBody>
        {detail.timeline.length === 0 ? (
          <EmptyState title="No activity recorded" />
        ) : (
          <ol className="relative space-y-4 border-l border-ink-100 pl-4">
            {detail.timeline.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute -left-[1.34rem] top-1 h-2 w-2 rounded-full bg-brand-400 ring-4 ring-white" />
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <p className="text-[12px] font-medium text-ink-900">{entry.summary}</p>
                  <span className="text-[10px] text-ink-400">{formatDateTime(entry.at)}</span>
                </div>
                <p className="mt-0.5 text-[10.5px] text-ink-400">
                  {entry.type.replaceAll("_", " ").toLowerCase()} · {entry.actorName}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Disbursement"
        title={disbursement.ref}
        description={`${customer?.name ?? "Customer"} · ${formatINR(disbursement.amount)} via ${disbursement.mode} · ${detail.branchName}`}
        breadcrumbs={[
          { label: "Risk & fulfilment" },
          { label: "Disbursements", href: "/disbursements" },
          { label: disbursement.ref },
        ]}
        actions={
          <>
            <StatusBadge status={disbursement.status} />
            <Link
              href="/disbursements"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11.5px] font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to queue
            </Link>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Disbursement indicators">
        {[
          {
            label: "Payout amount",
            value: formatINR(disbursement.amount),
            hint: `Mode ${disbursement.mode}`,
            icon: CircleDollarSign,
          },
          {
            label: "Bank reference",
            value: disbursement.bankRef ?? "Not generated",
            hint: disbursement.bankRef ? "Synthetic DEMO identifier" : "Generated on completion",
            icon: Landmark,
          },
          {
            label: "Indicative EMI",
            value: detail.emiAmount ? formatINR(detail.emiAmount) : "—",
            hint: sanction ? `${sanction.tenureMonths} months at ${sanction.interestRate}%` : "No sanction terms",
            icon: ClipboardList,
          },
          {
            label: "Requested",
            value: formatDate(disbursement.requestedAt),
            hint: formatRelative(disbursement.requestedAt),
            icon: CalendarClock,
          },
        ].map((item) => (
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            hint={item.hint}
            icon={<item.icon className="h-4 w-4" />}
          />
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <Tabs
            tabs={[
              { key: "overview", label: "Overview", content: overviewTab },
              {
                key: "schedule",
                label: "Repayment schedule",
                count: loanAccount ? schedule.length : undefined,
                content: scheduleTab,
              },
              { key: "timeline", label: "Timeline", count: detail.timeline.length, content: timelineTab },
            ]}
            defaultTab="overview"
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Processing actions"
              description={`Current state: ${STATUS_META[disbursement.status]?.label ?? disbursement.status}`}
            />
            <CardBody>
              <DisbursementActions
                disbursementId={disbursement.id}
                disbursementRef={disbursement.ref}
                status={disbursement.status}
                amount={disbursement.amount}
                canProcess={can(user, "disbursements:process")}
                canApprove={can(user, "disbursements:approve")}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Linked records" />
            <CardBody className="space-y-1">
              {sanction ? (
                <Link
                  href={`/sanctions/${sanction.id}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-[12px] text-ink-700 transition hover:bg-ink-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <Banknote className="h-3.5 w-3.5 text-ink-400" /> Sanction
                  </span>
                  <span className="text-[10.5px] text-ink-400">{sanction.ref}</span>
                </Link>
              ) : null}
              {application ? (
                <Link
                  href={`/applications/${application.id}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-[12px] text-ink-700 transition hover:bg-ink-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-ink-400" /> Application
                  </span>
                  <span className="text-[10.5px] text-ink-400">{application.ref}</span>
                </Link>
              ) : null}
              {customer ? (
                <Link
                  href={`/customers/${customer.id}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-[12px] text-ink-700 transition hover:bg-ink-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="h-3.5 w-3.5 text-ink-400" /> Customer 360
                  </span>
                  <span className="text-[10.5px] text-ink-400">{customer.ref}</span>
                </Link>
              ) : null}
              {loanAccount ? (
                <Link
                  href="/collections"
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-[12px] text-ink-700 transition hover:bg-ink-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <ClipboardList className="h-3.5 w-3.5 text-ink-400" /> Servicing & collections
                  </span>
                  <span className="text-[10.5px] text-ink-400">{loanAccount.ref}</span>
                </Link>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent activity" description="Latest processing events" />
            <CardBody className="space-y-3">
              {detail.timeline.slice(0, 4).map((entry) => (
                <div key={entry.id} className="flex gap-2.5">
                  <Avatar name={entry.actorName} color={entry.actorColor} size="xs" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2-safe text-[11.5px] leading-snug text-ink-700">{entry.summary}</p>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {entry.actorName} · {formatRelative(entry.at)}
                    </p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </aside>
      </div>

      <InlineNote tone="warning">
        DEMO mode: no real bank transfer was executed. Processing, recommendation and completion only update synthetic
        workflow records and generate an illustrative EMI schedule. All amounts in INR.
      </InlineNote>
    </div>
  );
}
