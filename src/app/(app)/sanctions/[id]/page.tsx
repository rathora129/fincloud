import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  CalendarClock,
  FileText,
  Percent,
  Timer,
  UserRound,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope } from "@/server/access";
import { getSanctionDetail } from "@/server/sanctions";
import { can } from "@/lib/rbac";
import { PRODUCT_LABELS, STATUS_META } from "@/lib/labels";
import { formatDate, formatDateTime, formatINR, formatRelative } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, Avatar } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, InlineNote, PermissionDenied } from "@/components/ui/states";
import { SanctionActions } from "./sanction-actions";

export const metadata = { title: "Sanction" };

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100/70 py-2.5 last:border-0">
      <dt className="text-[11.5px] text-ink-500">{label}</dt>
      <dd className="text-[12.5px] font-medium text-ink-900">{value}</dd>
    </div>
  );
}

export default async function SanctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "sanctions:view")) return <PermissionDenied className="mt-2" />;

  const { id } = await params;
  const scope = buildScope(user);
  const detail = getSanctionDetail(scope, id);
  if (!detail) notFound();

  const { sanction, application, customer } = detail;
  const canDecide = can(user, "sanctions:decide");

  const termsTab = (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Sanction terms" description="Indicative terms recorded in the demo workflow" />
        <CardBody className="gap-y-0">
          <dl>
            <Row label="Approved amount" value={formatINR(sanction.approvedAmount)} />
            <Row label="Interest rate" value={`${sanction.interestRate}% p.a.`} />
            <Row label="Tenure" value={`${sanction.tenureMonths} months`} />
            <Row label="Processing fee" value={formatINR(sanction.processingFee)} />
            <Row label="Disbursement mode" value={sanction.disbursementMode} />
            <Row label="Indicative EMI" value={formatINR(detail.emiAmount)} />
            <Row label="Total payable (approx.)" value={formatINR(detail.totalPayable + sanction.processingFee)} />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Decision trail" description="Request, decision and current state" />
        <CardBody>
          <dl>
            <Row label="Sanction ref" value={sanction.ref} />
            <Row label="Requested on" value={formatDate(sanction.requestedAt)} />
            <Row
              label="Status"
              value={<StatusBadge status={sanction.status} label={STATUS_META[sanction.status]?.label ?? sanction.status} />}
            />
            <Row label="Approver" value={detail.approverName ?? "Pending"} />
            <Row label="Decided on" value={sanction.decidedAt ? formatDateTime(sanction.decidedAt) : "Pending"} />
            <Row label="Branch" value={detail.branchName} />
            <Row label="Raised by" value={detail.requestedByName ?? "Branch team"} />
          </dl>
          <div className="mt-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Remarks</p>
            <p className="text-[11.5px] leading-relaxed text-ink-700">{sanction.remarks || "No remarks recorded."}</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );

  const linkedTab = (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Linked application"
          description={application ? `${application.ref} · ${PRODUCT_LABELS[application.product] ?? application.product}` : "Not available"}
          action={
            application ? (
              <Link href={`/applications/${application.id}`} className="text-[11px] font-medium text-brand-700 hover:text-brand-800">
                Open application
              </Link>
            ) : undefined
          }
        />
        <CardBody>
          {application ? (
            <dl>
              <Row label="Application ref" value={application.ref} />
              <Row label="Product" value={PRODUCT_LABELS[application.product] ?? application.product} />
              <Row label="Requested amount" value={formatINR(application.requestedAmount)} />
              <Row label="Application status" value={<StatusBadge status={application.status} />} />
              <Row label="Credit decision" value={application.creditDecision?.decision.replaceAll("_", " ") ?? "—"} />
              <Row
                label="Credit approved amount"
                value={
                  application.creditDecision?.approvedAmount
                    ? formatINR(application.creditDecision.approvedAmount)
                    : "—"
                }
              />
            </dl>
          ) : (
            <EmptyState title="Application not found" description="The linked application is outside your branch scope." />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Customer"
          description={customer ? customer.ref : "Not available"}
          action={
            customer ? (
              <Link href={`/customers/${customer.id}`} className="text-[11px] font-medium text-brand-700 hover:text-brand-800">
                Open 360
              </Link>
            ) : undefined
          }
        />
        <CardBody>
          {customer ? (
            <>
              <div className="mb-3 flex items-center gap-3">
                <Avatar name={customer.name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{customer.name}</p>
                  <p className="text-[11px] text-ink-500">
                    {customer.city}, {customer.state} · {customer.phone}
                  </p>
                </div>
              </div>
              <dl>
                <Row label="Customer ref" value={customer.ref} />
                <Row label="KYC status" value={<StatusBadge status={customer.kycStatus} dot={false} />} />
                <Row label="Monthly income" value={formatINR(customer.monthlyIncome)} />
                <Row label="Pan" value={customer.panMasked} />
              </dl>
            </>
          ) : (
            <EmptyState title="Customer not found" description="The linked customer is outside your branch scope." />
          )}
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Downstream disbursement" description="Payout is handled as a separate DEMO workflow" />
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          {detail.disbursementId ? (
            <>
              <div>
                <p className="text-[12px] font-medium text-ink-900">Disbursement record available</p>
                <p className="text-[11px] text-ink-500">
                  Current state: {STATUS_META[detail.disbursementStatus ?? ""]?.label ?? detail.disbursementStatus}
                </p>
              </div>
              <Link
                href={`/disbursements/${detail.disbursementId}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[12px] font-medium text-white transition hover:bg-brand-700"
              >
                Open disbursement <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          ) : (
            <>
              <div>
                <p className="text-[12px] font-medium text-ink-900">No disbursement record yet</p>
                <p className="text-[11px] text-ink-500">
                  A payout request is created by the disbursement desk once the sanction is approved.
                </p>
              </div>
              <Link
                href="/disbursements"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[12px] font-medium text-ink-700 transition hover:border-ink-300"
              >
                Disbursement queue
              </Link>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );

  const timelineTab = (
    <Card>
      <CardHeader title="Sanction timeline" description="Request, acceptance and approval events" />
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
        eyebrow="Sanction offer"
        title={sanction.ref}
        description={`${customer?.name ?? "Customer"} · ${formatINR(sanction.approvedAmount)} at ${sanction.interestRate}% p.a. over ${sanction.tenureMonths} months`}
        breadcrumbs={[
          { label: "Risk & fulfilment" },
          { label: "Sanctions", href: "/sanctions" },
          { label: sanction.ref },
        ]}
        actions={
          <>
            <StatusBadge status={sanction.status} />
            <Link
              href="/sanctions"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11.5px] font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sanctions
            </Link>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sanction indicators">
        {[
          {
            label: "Approved amount",
            value: formatINR(sanction.approvedAmount),
            hint: `${sanction.tenureMonths} months`,
            icon: Banknote,
          },
          {
            label: "Indicative EMI",
            value: formatINR(detail.emiAmount),
            hint: `${sanction.interestRate}% p.a.`,
            icon: Percent,
          },
          {
            label: "Processing fee",
            value: formatINR(sanction.processingFee),
            hint: "One-time, illustrative",
            icon: Timer,
          },
          {
            label: "Requested",
            value: formatDate(sanction.requestedAt),
            hint: formatRelative(sanction.requestedAt),
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
              { key: "terms", label: "Terms", content: termsTab },
              { key: "linked", label: "Linked records", content: linkedTab },
              { key: "timeline", label: "Timeline", count: detail.timeline.length, content: timelineTab },
            ]}
            defaultTab="terms"
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Sanction actions"
              description={
                sanction.status === "PENDING_ACCEPTANCE"
                  ? "Acceptance → processing → approval"
                  : sanction.status === "PROCESSING"
                    ? "Approval pending"
                    : "No action available"
              }
            />
            <CardBody>
              <SanctionActions
                sanctionId={sanction.id}
                sanctionRef={sanction.ref}
                status={sanction.status}
                approvedAmount={sanction.approvedAmount}
                canDecide={canDecide}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Linked records" />
            <CardBody className="space-y-1">
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
              <Link
                href="/disbursements"
                className="flex items-center justify-between rounded-lg px-2 py-2 text-[12px] text-ink-700 transition hover:bg-ink-50"
              >
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck className="h-3.5 w-3.5 text-ink-400" /> Disbursements
                </span>
                <span className="text-[10.5px] text-ink-400">Queue</span>
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent activity" description="Latest sanction events" />
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
        DEMO mode: sanction approval is a workflow record only. No e-signature, stamp duty or money movement is
        executed. All amounts in INR.
      </InlineNote>
    </div>
  );
}
