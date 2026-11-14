import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CalendarClock,
  FileCheck2,
  FileText,
  IdCard,
  Info,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope } from "@/server/access";
import { getCreditApplication } from "@/server/credit";
import { can } from "@/lib/rbac";
import { EMPLOYMENT_LABELS, PRODUCT_LABELS, STATUS_META } from "@/lib/labels";
import { formatDate, formatDateTime, formatINR, formatINRCompact, formatRelative } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, Avatar } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { PermissionDenied, InlineNote, EmptyState } from "@/components/ui/states";
import { CreditDecisionPanel } from "./decision-panel";

export const metadata = { title: "Credit application" };

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100/70 py-2 last:border-0">
      <dt className="text-[11.5px] text-ink-500">{label}</dt>
      <dd className="text-[12.5px] font-medium text-ink-900">{value}</dd>
    </div>
  );
}

export default async function CreditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "credit:view")) return <PermissionDenied className="mt-2" />;

  const { id } = await params;
  const scope = buildScope(user);
  const detail = getCreditApplication(scope, id);
  if (!detail) notFound();

  const { application, customer, timeline } = detail;
  const decision = application.creditDecision;
  const canDecide = can(user, "credit:decide") && application.status === "RECOMMENDED";

  const verificationEntries = [
    { key: "identity", label: "Identity" },
    { key: "address", label: "Address" },
    { key: "employment", label: "Employment" },
    { key: "income", label: "Income" },
  ] as const;

  const overview = (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Application summary"
          description={`Submitted ${formatDate(application.submittedAt)} · ${detail.branchName}`}
          action={<StatusBadge status={application.status} />}
        />
        <CardBody className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
          <dl>
            <DetailRow label="Application ref" value={application.ref} />
            <DetailRow label="Product" value={PRODUCT_LABELS[application.product] ?? application.product} />
            <DetailRow label="Requested amount" value={formatINR(application.requestedAmount)} />
            <DetailRow label="Tenure" value={`${application.tenureMonths} months`} />
            <DetailRow label="Indicative rate" value={`${application.interestRate}% p.a.`} />
          </dl>
          <dl>
            <DetailRow label="Purpose" value={application.purpose} />
            <DetailRow label="Owner" value={detail.ownerName} />
            <DetailRow label="Credit officer" value={detail.creditOfficerName ?? "Not assigned"} />
            <DetailRow
              label="Risk band"
              value={<StatusBadge status={application.riskBand ?? "PENDING"} label={application.riskBand ?? "Not set"} dot={false} />}
            />
            <DetailRow
              label="Source"
              value={
                application.isAuto ? (
                  <span className="inline-flex items-center gap-1 text-brand-700">
                    <Sparkles className="h-3.5 w-3.5" /> Auto-sourced
                  </span>
                ) : (
                  "Branch sourced"
                )
              }
            />
          </dl>
        </CardBody>
      </Card>

      {application.sentBackReason ? (
        <InlineNote tone="warning">
          <span className="font-semibold">Sent back:</span> {application.sentBackReason}. The branch must address this
          before re-submitting to credit.
        </InlineNote>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Customer"
            description={customer.ref}
            action={
              <Link href={`/customers/${customer.id}`} className="text-[11px] font-medium text-brand-700 hover:text-brand-800">
                Open 360
              </Link>
            }
          />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar name={customer.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{customer.name}</p>
                <p className="text-[11px] text-ink-500">
                  {EMPLOYMENT_LABELS[customer.employmentType] ?? customer.employmentType} · {customer.employer}
                </p>
              </div>
              <StatusBadge status={customer.kycStatus} label={`KYC ${customer.kycStatus.toLowerCase()}`} />
            </div>
            <dl className="space-y-1.5 text-[11.5px] text-ink-600">
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-ink-400" /> {customer.phone}
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-ink-400" /> <span className="truncate">{customer.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-ink-400" /> {customer.addressLine}, {customer.city} ·{" "}
                {customer.pincode}
              </div>
              <div className="flex items-center gap-2">
                <IdCard className="h-3.5 w-3.5 text-ink-400" /> PAN {customer.panMasked} · Aadhaar{" "}
                {customer.aadhaarMasked}
              </div>
            </dl>
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-[11px] text-ink-500">
              Customer since {formatDate(customer.relationshipSince)} · KYC {customer.kycStatus.toLowerCase()} · all
              identifiers are masked synthetic data.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Affordability" description="Illustrative amortisation at the indicative rate" />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-ink-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.05em] text-ink-400">Monthly income</p>
                <p className="mt-1 text-[15px] font-semibold tabular text-ink-950">{formatINR(customer.monthlyIncome)}</p>
              </div>
              <div className="rounded-xl border border-ink-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.05em] text-ink-400">Indicative EMI</p>
                <p className="mt-1 text-[15px] font-semibold tabular text-ink-950">{formatINR(detail.estimatedEmi)}</p>
              </div>
              <div className="rounded-xl border border-ink-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.05em] text-ink-400">FOIR (EMI / income)</p>
                <p className={`mt-1 text-[15px] font-semibold tabular ${detail.foir > 50 ? "text-rose-600" : "text-brand-700"}`}>
                  {detail.foir}%
                </p>
              </div>
              <div className="rounded-xl border border-ink-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.05em] text-ink-400">Total interest</p>
                <p className="mt-1 text-[15px] font-semibold tabular text-ink-950">
                  {formatINRCompact(detail.estimatedEmi * application.tenureMonths - application.requestedAmount)}
                </p>
              </div>
            </div>
            <InlineNote>
              FOIR is computed from the requested amount and indicative rate only. It excludes other bureau obligations —
              no live bureau data is connected in this DEMO.
            </InlineNote>
          </CardBody>
        </Card>
      </div>
    </div>
  );

  const documentsTab = (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Document checklist"
          description={`${detail.verifiedDocuments} of ${application.documents.length} verified${detail.rejectedDocuments ? ` · ${detail.rejectedDocuments} rejected` : ""}`}
        />
        <CardBody className="space-y-2">
          {application.documents.length === 0 ? (
            <EmptyState title="No documents received" description="The branch has not uploaded any documents yet." />
          ) : (
            application.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-ink-400" />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-ink-800">{doc.name}</p>
                    <p className="truncate text-[10.5px] text-ink-400">
                      {doc.fileName ?? "No file"} ·{" "}
                      {doc.uploadedAt ? `uploaded ${formatRelative(doc.uploadedAt)}` : "not uploaded"}
                    </p>
                  </div>
                </div>
                <StatusBadge status={doc.status} dot={false} />
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Verification checks" description="Synthetic verification results" />
        <CardBody className="grid grid-cols-2 gap-2.5">
          {verificationEntries.map((entry) => (
            <div key={entry.key} className="rounded-xl border border-ink-100 bg-white p-3">
              <p className="text-[10px] uppercase tracking-[0.05em] text-ink-400">{entry.label}</p>
              <div className="mt-1.5">
                <StatusBadge status={application.verification[entry.key]} />
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );

  const timelineTab = (
    <Card>
      <CardHeader title="Application timeline" description="Audit-backed events for this application" />
      <CardBody>
        {timeline.length === 0 ? (
          <EmptyState title="No activity recorded" />
        ) : (
          <ol className="relative space-y-4 border-l border-ink-100 pl-4">
            {timeline.map((entry) => (
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
        eyebrow="Credit review"
        title={application.ref}
        description={`${customer.name} · ${PRODUCT_LABELS[application.product] ?? application.product} · ${formatINR(application.requestedAmount)} requested over ${application.tenureMonths} months`}
        breadcrumbs={[
          { label: "Risk & fulfilment" },
          { label: "Credit Review", href: "/credit" },
          { label: application.ref },
        ]}
        actions={
          <>
            <StatusBadge status={application.status} />
            <Link
              href="/credit"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11.5px] font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to queue
            </Link>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Application indicators">
        {[
          {
            label: "Requested amount",
            value: formatINR(application.requestedAmount),
            hint: `${application.tenureMonths} months · ${application.interestRate}% p.a.`,
            icon: Wallet,
          },
          {
            label: "Indicative EMI",
            value: formatINR(detail.estimatedEmi),
            hint: `FOIR ${detail.foir}% of income`,
            icon: FileCheck2,
          },
          {
            label: "Risk band",
            value: application.riskBand ?? "Not set",
            hint: application.riskBand ? "Credit risk classification" : "Set during the decision",
            icon: ShieldCheck,
          },
          {
            label: "Submitted",
            value: application.submittedAt ? formatDate(application.submittedAt) : "Not submitted",
            hint: application.submittedAt ? formatRelative(application.submittedAt) : "Draft application",
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
        <div className="min-w-0 space-y-4">
          <Tabs
            tabs={[
              { key: "overview", label: "Overview", content: overview },
              { key: "documents", label: "Documents & verification", content: documentsTab },
              { key: "timeline", label: "Timeline", count: timeline.length, content: timelineTab },
            ]}
            defaultTab="overview"
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Credit decision"
              description={
                application.status === "RECOMMENDED"
                  ? "Record the credit outcome for this application"
                  : "Decisions are locked once recorded"
              }
            />
            <CardBody className="space-y-4">
              {decision ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge
                      status={
                        decision.decision === "APPROVE"
                          ? "CREDIT_APPROVED"
                          : decision.decision === "REJECT"
                            ? "CREDIT_REJECTED"
                            : "SENT_BACK"
                      }
                      label={decision.decision === "APPROVE" ? "Approved" : decision.decision === "REJECT" ? "Rejected" : "Sent back"}
                    />
                    <span className="text-[10.5px] text-ink-400">{formatDateTime(decision.decidedAt)}</span>
                  </div>
                  <dl className="space-y-1">
                    {decision.approvedAmount !== null ? (
                      <DetailRow label="Approved amount" value={formatINR(decision.approvedAmount)} />
                    ) : null}
                    <DetailRow label="Decided by" value={detail.decidedByName ?? "Credit team"} />
                    <DetailRow
                      label="Risk band"
                      value={<StatusBadge status={application.riskBand ?? "PENDING"} label={application.riskBand ?? "—"} dot={false} />}
                    />
                  </dl>
                  <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3">
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">
                      <Info className="h-3 w-3" /> Remarks
                    </p>
                    <p className="text-[11.5px] leading-relaxed text-ink-700">{decision.remarks || "No remarks recorded."}</p>
                  </div>
                  {application.status === "CREDIT_APPROVED" || detail.sanction ? (
                    detail.sanction ? (
                      <Link
                        href={`/sanctions/${detail.sanction.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2 text-[11.5px] font-medium text-ink-700 transition hover:border-brand-200 hover:text-brand-800"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5 text-brand-700" /> Sanction {detail.sanction.ref}
                        </span>
                        <StatusBadge status={detail.sanction.status} dot={false} />
                      </Link>
                    ) : (
                      <div className="space-y-1.5">
                        <Link
                          href="/sanctions"
                          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[12px] font-medium text-white transition hover:bg-brand-700"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Go to sanctions desk
                        </Link>
                        <p className="text-[10px] text-ink-400">
                          No sanction record exists yet for this application. Sanctions are raised by the sanctions
                          desk in DEMO mode.
                        </p>
                      </div>
                    )
                  ) : null}
                </div>
              ) : canDecide ? (
                <CreditDecisionPanel
                  applicationId={application.id}
                  requestedAmount={application.requestedAmount}
                  suggestedRiskBand={application.riskBand}
                  canDecide={canDecide}
                />
              ) : (
                <div className="space-y-3">
                  {application.status === "RECOMMENDED" && !can(user, "credit:decide") ? (
                    <InlineNote tone="warning">
                      Your role can view credit files but does not include <span className="font-semibold">credit:decide</span>.
                      A credit officer or branch manager must record this decision.
                    </InlineNote>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-ink-100 bg-ink-50/60 px-3 py-2.5 text-[11.5px] text-ink-600">
                      <Info className="h-4 w-4 shrink-0 text-ink-400" />
                      Decision is only available while the application is pending credit review (Recommended).
                    </div>
                  )}
                  <p className="text-[10.5px] text-ink-400">
                    Current status: {STATUS_META[application.status]?.label ?? application.status}. Owner:{" "}
                    {detail.ownerName}.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent activity" description="Latest audit events" />
            <CardBody className="space-y-3">
              {timeline.slice(0, 4).map((entry) => (
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

          <Card>
            <CardHeader title="Linked records" />
            <CardBody className="space-y-2">
              <Link
                href={`/applications/${application.id}`}
                className="flex items-center justify-between rounded-lg px-2 py-2 text-[12px] text-ink-700 transition hover:bg-ink-50"
              >
                <span className="inline-flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-ink-400" /> Application file
                </span>
                <span className="text-[10.5px] text-ink-400">{application.ref}</span>
              </Link>
              <Link
                href={`/customers/${customer.id}`}
                className="flex items-center justify-between rounded-lg px-2 py-2 text-[12px] text-ink-700 transition hover:bg-ink-50"
              >
                <span className="inline-flex items-center gap-2">
                  <UserRound className="h-3.5 w-3.5 text-ink-400" /> Customer 360
                </span>
                <span className="text-[10.5px] text-ink-400">{customer.ref}</span>
              </Link>
              {application.leadId ? (
                <Link
                  href={`/leads/${application.leadId}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-[12px] text-ink-700 transition hover:bg-ink-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-ink-400" /> Source lead
                  </span>
                  <span className="text-[10.5px] text-ink-400">View</span>
                </Link>
              ) : null}
            </CardBody>
          </Card>
        </aside>
      </div>

      <InlineNote>
        DEMO record: all customer, income and document data is synthetic. No bureau, verification or e-signature
        integrations are connected. All amounts in INR.
      </InlineNote>
    </div>
  );
}
