import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  FileText,
  ListTodo,
  Mail,
  MapPin,
  Phone,
  Wallet,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { ApiError } from "@/server/access";
import { getLeadDetail, getLeadsWorkspace } from "@/server/leads";
import { can } from "@/lib/rbac";
import { LEAD_TYPE_LABELS, PRODUCT_LABELS, SOURCE_LABELS, STATUS_META, humanize } from "@/lib/labels";
import { formatDate, formatDateTime, formatINR, formatRelative } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PermissionDenied } from "@/components/ui/states";
import { LeadActions, LeadStatusControl } from "./lead-actions";

const PIPELINE = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED"] as const;

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "leads:view")) return <PermissionDenied />;

  const { id } = await params;
  let data;
  try {
    data = getLeadDetail(user, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError && error.status === 403) return <PermissionDenied />;
    throw error;
  }

  const { options } = getLeadsWorkspace(user, {});
  const { lead } = data;
  const canManage = can(user, "leads:manage");
  const canAssign = can(user, "leads:assign");
  const canConvert = canManage && can(user, "applications:manage");
  const pipelineIndex = PIPELINE.indexOf(lead.status as (typeof PIPELINE)[number]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`Lead · ${lead.ref}`}
        title={lead.customerName}
        description={`${lead.loanPurpose} · ${lead.city} · Captured ${formatDate(lead.createdAt)}`}
        breadcrumbs={[{ label: "Origination" }, { label: "Leads", href: "/leads" }, { label: lead.ref }]}
        actions={
          <>
            <StatusBadge status={lead.status} className="hidden sm:inline-flex" />
            <LeadActions
              lead={lead}
              owners={options.owners}
              canManage={canManage}
              canAssign={canAssign}
              canConvert={canConvert}
            />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Lead profile" description="Contact details and enquiry context" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={lead.phone} mono />
                <Detail icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={lead.email} />
                <Detail icon={<MapPin className="h-3.5 w-3.5" />} label="City" value={lead.city} />
                <Detail icon={<Wallet className="h-3.5 w-3.5" />} label="Monthly income" value={formatINR(lead.monthlyIncome)} />
                <Detail label="Lead type" value={LEAD_TYPE_LABELS[lead.type] ?? lead.type} />
                <Detail label="Source" value={SOURCE_LABELS[lead.source] ?? lead.source} />
                <Detail label="Branch" value={data.branchName} icon={<Building2 className="h-3.5 w-3.5" />} />
                <Detail label="Owner" value={data.ownerName} />
                <Detail label="Created" value={formatDateTime(lead.createdAt)} />
                <Detail label="Last updated" value={formatRelative(lead.updatedAt)} />
                <Detail
                  label="Next follow-up"
                  value={lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : "Not scheduled"}
                  icon={<CalendarClock className="h-3.5 w-3.5" />}
                />
                <Detail label="Linked application" value={data.application?.ref ?? "Not converted"} />
              </dl>
              <div className="mt-5 rounded-xl bg-ink-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">Notes</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {lead.notes || "No notes captured for this lead."}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Follow-up history"
              description={`${data.followUps.length} follow-up${data.followUps.length === 1 ? "" : "s"} recorded`}
              action={
                lead.nextFollowUpAt ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
                    <CalendarClock className="h-3 w-3" /> Next {formatDate(lead.nextFollowUpAt)}
                  </span>
                ) : null
              }
            />
            {data.followUps.length === 0 ? (
              <EmptyState
                title="No follow-ups yet"
                description="Connect with the customer and log the first interaction to build the engagement trail."
                className="border-0"
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.followUps.map((followUp) => (
                  <li key={followUp.id} className="flex gap-3 px-5 py-4">
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                      <Phone className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink-900">{humanize(followUp.channel)}</p>
                        <StatusBadge
                          label={humanize(followUp.outcome)}
                          tone={
                            followUp.outcome === "INTERESTED"
                              ? "success"
                              : followUp.outcome === "NOT_INTERESTED"
                                ? "danger"
                                : "info"
                          }
                          dot={false}
                        />
                        <span className="text-[11px] text-ink-400">{formatRelative(followUp.at)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-600">{followUp.notes}</p>
                      <p className="mt-1 text-[11px] text-ink-400">
                        Logged by {followUp.actorName}
                        {followUp.nextFollowUpAt ? ` · next follow-up ${formatDate(followUp.nextFollowUpAt)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Activity trail" description="Every change is retained for audit review" />
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
            <CardHeader
              title="Pipeline stage"
              description={lead.status === "LOST" ? "This lead was closed as lost" : "Qualification progress"}
            />
            <CardBody className="space-y-4">
              <div className="space-y-2">
                {PIPELINE.map((step, index) => {
                  const reached = lead.status !== "LOST" && pipelineIndex >= index;
                  return (
                    <div key={step} className="flex items-center gap-2.5">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                          reached ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-400"
                        }`}
                      >
                        {reached ? <Check className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <span className={`text-sm ${reached ? "font-medium text-ink-900" : "text-ink-500"}`}>
                        {STATUS_META[step]?.label ?? step}
                      </span>
                      {lead.status === step ? (
                        <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-700">
                          Current
                        </span>
                      ) : null}
                    </div>
                  );
                })}
                {lead.status === "LOST" ? (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{lead.ref} was marked lost.</p>
                ) : null}
              </div>

              <div className="border-t border-ink-100 pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">Move stage</p>
                <LeadStatusControl leadId={lead.id} status={lead.status} canManage={canManage} />
                {!canManage ? (
                  <p className="text-xs text-ink-500">Your role has read-only access to lead stage changes.</p>
                ) : null}
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
            <CardHeader title="Application" description="Converted loan file" />
            <CardBody>
              {data.application ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{data.application.ref}</p>
                      <p className="text-xs text-ink-500">{PRODUCT_LABELS[data.application.product] ?? data.application.product}</p>
                    </div>
                    <StatusBadge status={data.application.status} />
                  </div>
                  <p className="text-sm text-ink-600">Requested {formatINR(data.application.requestedAmount)}</p>
                  <Link
                    href={`/applications/${data.application.id}`}
                    className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white text-xs font-medium text-ink-800 transition hover:border-ink-300 hover:bg-ink-50"
                  >
                    Open application <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-2 text-sm text-ink-600">
                  <p className="flex items-center gap-2 font-medium text-ink-800">
                    <FileText className="h-4 w-4 text-ink-400" /> Not converted yet
                  </p>
                  <p className="text-xs leading-relaxed">
                    {lead.status === "QUALIFIED"
                      ? "The lead is qualified. Use “Convert to application” to create the loan file."
                      : "Move the lead to Qualified before creating a loan application."}
                  </p>
                  {canConvert ? (
                    <p className="flex items-center gap-1.5 text-xs text-brand-700">
                      <BadgeCheck className="h-3.5 w-3.5" /> You have permission to convert
                    </p>
                  ) : null}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Related tasks" description="Operational follow-through" />
            <CardBody>
              {data.tasks.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-ink-500">
                  <ListTodo className="h-4 w-4" /> No tasks linked to this lead.
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
            <CircleDot className="mb-1 inline h-3 w-3" /> DEMO record — synthetic customer data. No bureau, e-sign or
            payment integrations are triggered from this workspace.
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">
        {icon}
        {label}
      </dt>
      <dd className={`mt-1 text-sm text-ink-800 ${mono ? "tabular" : ""}`}>{value}</dd>
    </div>
  );
}
