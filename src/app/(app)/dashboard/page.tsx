import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  HandCoins,
  ListTodo,
  TrendingUp,
  UsersRound,
  XCircle,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope, inScope } from "@/server/access";
import { getDashboardData, type DashboardFilters as DashboardFilterValues } from "@/server/dashboard";
import { getStore } from "@/server/store";
import { can } from "@/lib/rbac";
import { PRODUCT_LABELS, STATUS_META } from "@/lib/labels";
import {
  formatDate,
  formatINR,
  formatINRCompact,
  formatNumber,
  formatPercent,
  formatRelative,
} from "@/lib/utils";
import type { LoanProduct } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, Avatar } from "@/components/ui/badge";
import { PermissionDenied } from "@/components/ui/states";
import { AreaTrend, DonutChart, FunnelChart, GroupedBars } from "@/components/ui/charts";
import { DashboardFilters } from "./filters";

export const metadata = { title: "Dashboard" };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "dashboard:view")) {
    return <PermissionDenied className="mt-2" />;
  }

  const params = await searchParams;
  const value = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const filters: DashboardFilterValues = {
    branchId: value("branch"),
    ownerId: value("employee"),
    product: (value("product") as LoanProduct | undefined) ?? "",
    status: value("status"),
    from: value("from"),
    to: value("to"),
  };

  const scope = buildScope(user);
  const store = getStore();
  const data = getDashboardData(scope, filters);

  const branches = store.branches
    .filter((branch) => inScope(scope, branch.id))
    .map((branch) => ({ id: branch.id, name: branch.name }));
  const employees = store.users
    .filter(
      (employee) =>
        employee.status === "ACTIVE" &&
        inScope(scope, employee.branchId) &&
        (!filters.branchId || employee.branchId === filters.branchId) &&
        ["LOAN_OFFICER", "CREDIT_OFFICER", "COLLECTION_OFFICER", "BRANCH_MANAGER"].includes(employee.role),
    )
    .map((employee) => ({ id: employee.id, name: employee.name, role: employee.role }));
  const userById = new Map(store.users.map((u) => [u.id, u]));

  const activeFilterCount = Object.values({
    branch: filters.branchId,
    employee: filters.ownerId,
    product: filters.product,
    status: filters.status,
    from: filters.from,
    to: filters.to,
  }).filter(Boolean).length;

  const conversion = data.leadFunnel.find((s) => s.stage === "CONVERTED")?.value ?? 0;
  const totalLeadsInFunnel = data.leadFunnel.reduce((acc, s) => acc + s.value, 0);
  const branchScopeLabel = scope.isGlobal ? "all branches" : user.branchName;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Executive overview"
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={`Pipeline, portfolio and team performance across ${branchScopeLabel}. All figures are computed from the current synthetic DEMO dataset and respect your role scope.`}
        actions={
          <>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11px] font-medium text-ink-500">
              <Clock3 className="h-3.5 w-3.5" />
              {filters.from || filters.to ? `${filters.from ? formatDate(filters.from) : "Start"} – ${filters.to ? formatDate(filters.to) : "Today"}` : "Last 180 days"}
            </span>
            {can(user, "reports:view") ? (
              <Link
                href="/reports"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-950 px-3.5 text-[12px] font-medium text-white transition hover:bg-ink-900"
              >
                MIS & reports <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </>
        }
      />

      <DashboardFilters
        branches={branches}
        employees={employees}
        values={{
          branch: filters.branchId,
          employee: filters.ownerId,
          product: filters.product,
          status: filters.status,
          from: filters.from,
          to: filters.to,
        }}
        activeCount={activeFilterCount}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key performance indicators">
        <StatCard
          label="Total Leads"
          value={formatNumber(data.kpis.totalLeads)}
          hint={`${formatNumber(data.kpis.newLeads)} in last 30 days`}
          icon={<UsersRound className="h-4 w-4" />}
          href="/leads"
          trend={{ value: `${formatNumber(data.kpis.newLeads)} new`, direction: "up" }}
        />
        <StatCard
          label="New Applications"
          value={formatNumber(data.kpis.newApplications)}
          hint="Awaiting processing"
          icon={<FileText className="h-4 w-4" />}
          href="/applications"
          accent="sky"
        />
        <StatCard
          label="In-process Applications"
          value={formatNumber(data.kpis.inProcessApplications)}
          hint="Across verification stages"
          icon={<TrendingUp className="h-4 w-4" />}
          href="/applications?status=IN_PROCESS"
          accent="amber"
        />
        <StatCard
          label="Pending Credit Decisions"
          value={formatNumber(data.kpis.pendingCredit)}
          hint="Recommended to credit"
          icon={<ListTodo className="h-4 w-4" />}
          href="/credit"
          accent="amber"
        />
        <StatCard
          label="Approved Loans"
          value={formatNumber(data.kpis.approvedLoans)}
          hint="Credit approvals in window"
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Rejected Loans"
          value={formatNumber(data.kpis.rejectedLoans)}
          hint="Credit rejections in window"
          icon={<XCircle className="h-4 w-4" />}
          accent="rose"
        />
        <StatCard
          label="Total Disbursements"
          value={formatINRCompact(data.kpis.totalDisbursed)}
          hint="Completed (DEMO) payouts"
          icon={<Banknote className="h-4 w-4" />}
          href="/disbursements"
          accent="brand"
        />
        <StatCard
          label="Collection Performance"
          value={formatPercent(data.kpis.collectionRate)}
          hint={`${formatINRCompact(data.kpis.overdueAmount)} overdue outstanding`}
          icon={<HandCoins className="h-4 w-4" />}
          href="/collections"
          accent={data.kpis.collectionRate >= 85 ? "brand" : "amber"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Loan application overview"
            description="Applications submitted per month in the selected window"
            action={
              <span className="rounded-md bg-ink-100 px-2 py-1 text-[10px] font-medium text-ink-600">
                {formatNumber(data.applicationTrend.reduce((acc, p) => acc + p.value, 0))} total
              </span>
            }
          />
          <CardBody className="pb-4">
            <AreaTrend labels={data.applicationTrend.map((p) => p.label)} values={data.applicationTrend.map((p) => p.value)} label="Applications" height={236} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Lead conversion"
            description={`${conversion} converted of ${formatNumber(totalLeadsInFunnel)} leads`}
          />
          <CardBody>
            <FunnelChart stages={data.leadFunnel} height={236} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Sanction & disbursement" description="Completed disbursement value per month" />
          <CardBody>
            <AreaTrend
              labels={data.disbursementTrend.map((p) => p.label)}
              values={data.disbursementTrend.map((p) => p.value)}
              label="Disbursed"
              currency
              color="#0e6350"
              height={220}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Collection performance" description="Repayments collected per month" />
          <CardBody>
            <AreaTrend
              labels={data.collectionTrend.map((p) => p.label)}
              values={data.collectionTrend.map((p) => p.value)}
              label="Collected"
              currency
              color="#1f9775"
              height={220}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Approval vs rejection" description="Credit decisions by month" />
          <CardBody>
            <GroupedBars
              labels={data.decisionTrend.labels}
              series={[
                { label: "Approved", values: data.decisionTrend.approved, color: "#117a60" },
                { label: "Rejected", values: data.decisionTrend.rejected, color: "#be123c" },
              ]}
              height={220}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Product mix" description="Disbursed value by product" />
          <CardBody>
            <DonutChart
              labels={data.productMix.map((p) => PRODUCT_LABELS[p.label] ?? p.label)}
              values={data.productMix.map((p) => p.value)}
              currency
              height={232}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Pending tasks"
            description="Soonest due across your scope"
            action={
              <Link href="/tasks" className="text-[11px] font-medium text-brand-700 hover:text-brand-800">
                View all
              </Link>
            }
          />
          <CardBody className="space-y-1 p-2">
            {data.pendingTasks.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-ink-400">No open tasks in scope.</p>
            ) : (
              data.pendingTasks.map((task) => {
                const overdue = new Date(task.dueDate).getTime() < Date.now();
                return (
                  <Link
                    key={task.id}
                    href="/tasks"
                    className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-ink-50"
                  >
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${overdue ? "bg-rose-500" : "bg-brand-400"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-ink-800">{task.title}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[10px] text-ink-400">
                        <span>{task.ref}</span>
                        <span>·</span>
                        <span className={overdue ? "font-medium text-rose-600" : ""}>
                          {overdue ? "Overdue" : "Due"} {formatDate(task.dueDate)}
                        </span>
                      </span>
                    </span>
                    <StatusBadge status={task.priority} dot={false} />
                  </Link>
                );
              })
            )}
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Team performance"
            description="Scoped activity for the selected period"
            action={
              can(user, "users:view") ? (
                <Link href="/users" className="text-[11px] font-medium text-brand-700 hover:text-brand-800">
                  Manage team
                </Link>
              ) : undefined
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-[10px] uppercase tracking-[0.06em] text-ink-500">
                  <th className="px-4 py-2.5 font-semibold">Officer</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Leads</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Applications</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Disbursed</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Tasks done</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cases resolved</th>
                </tr>
              </thead>
              <tbody>
                {data.teamPerformance.map((member) => {
                  const employee = userById.get(member.userId);
                  return (
                    <tr key={member.userId} className="border-b border-ink-100/70 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={member.name} color={employee?.avatarColor} size="sm" />
                          <div>
                            <p className="text-[12px] font-medium text-ink-800">{member.name}</p>
                            <p className="text-[10px] text-ink-400">{employee?.designation}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular text-ink-700">{member.leads}</td>
                      <td className="px-4 py-2.5 text-right tabular text-ink-700">{member.applications}</td>
                      <td className="px-4 py-2.5 text-right tabular font-medium text-ink-900">
                        {formatINRCompact(member.disbursed)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular text-ink-700">{member.tasksCompleted}</td>
                      <td className="px-4 py-2.5 text-right tabular text-ink-700">{member.collections}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            description="Audit trail across your scope"
            action={
              can(user, "audit:view") ? (
                <Link href="/audit-logs" className="text-[11px] font-medium text-brand-700 hover:text-brand-800">
                  Audit log
                </Link>
              ) : undefined
            }
          />
          <CardBody className="space-y-3 p-4">
            {data.recentActivities.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-400">No recent activity.</p>
            ) : (
              data.recentActivities.slice(0, 7).map((log) => {
                const actor = userById.get(log.actorId);
                return (
                  <div key={log.id} className="flex gap-2.5">
                    <Avatar name={actor?.name ?? "System"} color={actor?.avatarColor} size="xs" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] leading-snug text-ink-700">
                        <span className="font-medium text-ink-900">{actor?.name ?? "System"}</span> ·{" "}
                        {log.action.replaceAll("_", " ").toLowerCase()}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-ink-400">{log.summary}</p>
                    </div>
                    <span className="shrink-0 text-[9.5px] text-ink-400">{formatRelative(log.at)}</span>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Branch performance" description="DEMO disbursement and collection totals" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-[10px] uppercase tracking-[0.06em] text-ink-500">
                  <th className="px-4 py-2.5 font-semibold">Branch</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Disbursed</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Collected</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.branchPerformance.map((branch) => (
                  <tr key={branch.branch} className="border-b border-ink-100/70 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ink-800">{branch.branch}</td>
                    <td className="px-4 py-2.5 text-right tabular text-ink-700">{formatINR(branch.disbursed)}</td>
                    <td className="px-4 py-2.5 text-right tabular text-ink-700">{formatINR(branch.collected)}</td>
                    <td className="px-4 py-2.5 text-right tabular text-rose-600">{formatINR(branch.overdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Portfolio snapshot" description="Active book and operational load" />
          <CardBody className="grid grid-cols-2 gap-3">
            {[
              { label: "Active loans", value: formatNumber(data.kpis.activeLoans), icon: CircleDollarSign },
              { label: "Overdue outstanding", value: formatINRCompact(data.kpis.overdueAmount), icon: HandCoins },
              { label: "Tasks due", value: formatNumber(data.kpis.tasksDue), icon: ListTodo },
              { label: "Credit queue", value: formatNumber(data.kpis.pendingCredit), icon: BadgeCheck },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-ink-100 bg-ink-50/40 p-3.5">
                <item.icon className="mb-2 h-4 w-4 text-brand-700" />
                <p className="text-lg font-semibold tabular text-ink-950">{item.value}</p>
                <p className="text-[10.5px] text-ink-500">{item.label}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-ink-100 bg-white/60 px-4 py-3 text-[10.5px] leading-relaxed text-ink-500">
        <span className="mt-0.5 rounded bg-ink-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-600">
          Note
        </span>
        <p>
          Dashboard values are derived live from the synthetic demo dataset. Financial calculations use illustrative
          EMI logic only and are not approved credit policy. No bureau, payment or communication integrations are
          connected. All amounts in INR.
        </p>
      </div>
    </div>
  );
}
