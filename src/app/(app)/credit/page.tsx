import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, FileSearch, Gauge, ShieldCheck, Wallet } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope, inScope } from "@/server/access";
import { getStore } from "@/server/store";
import { CREDIT_TABS, getCreditQueue, parseCreditTab } from "@/server/credit";
import { can } from "@/lib/rbac";
import { formatINRCompact, formatNumber } from "@/lib/utils";
import type { LoanProduct } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { PermissionDenied, InlineNote } from "@/components/ui/states";
import { CreditFilters } from "./credit-filters";
import { CreditTable } from "./credit-table";

export const metadata = { title: "Credit Review" };

export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "credit:view")) return <PermissionDenied className="mt-2" />;

  const params = await searchParams;
  const value = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const tab = parseCreditTab(value("tab"));

  const filters = {
    branchId: value("branch"),
    ownerId: value("owner"),
    product: (value("product") as LoanProduct | undefined) ?? "",
    from: value("from"),
    to: value("to"),
  };

  const scope = buildScope(user);
  const store = getStore();
  const queue = getCreditQueue(scope, tab, filters);

  const branches = store.branches
    .filter((branch) => inScope(scope, branch.id))
    .map((branch) => ({ id: branch.id, name: branch.name }));
  const employees = store.users
    .filter(
      (employee) =>
        employee.status === "ACTIVE" &&
        inScope(scope, employee.branchId) &&
        (!filters.branchId || employee.branchId === filters.branchId) &&
        ["LOAN_OFFICER", "CREDIT_OFFICER", "BRANCH_MANAGER"].includes(employee.role),
    )
    .map((employee) => ({ id: employee.id, name: employee.name, role: employee.role }));

  const activeFilterCount = [filters.branchId, filters.ownerId, filters.product, filters.from, filters.to].filter(
    Boolean,
  ).length;

  const tabHref = (key: string) => {
    const query = new URLSearchParams();
    query.set("tab", key);
    if (filters.branchId) query.set("branch", filters.branchId);
    if (filters.ownerId) query.set("owner", filters.ownerId);
    if (filters.product) query.set("product", filters.product);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    return `/credit?${query.toString()}`;
  };

  const tabItems = CREDIT_TABS.map((item) => ({
    key: item.key,
    label: item.label,
    count: item.key === tab ? -1 : queue.counts[item.key],
    href: tabHref(item.key),
  }));

  const activeTabLabel = CREDIT_TABS.find((item) => item.key === tab)?.label ?? "Pending review";
  const summary = queue.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Risk & fulfilment"
        title="Credit Review"
        description={`Assess applications recommended by the branch, record decisions and route outcomes to sanctions. Showing records for ${scope.isGlobal ? "all branches" : user.branchName}.`}
        breadcrumbs={[{ label: "Risk & fulfilment" }, { label: "Credit Review" }]}
        actions={
          <>
            <Link
              href="/sanctions"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11.5px] font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Sanctions desk
            </Link>
            {can(user, "credit:decide") ? (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-50 px-3 text-[11px] font-medium text-brand-700 ring-1 ring-brand-200">
                <ClipboardCheck className="h-3.5 w-3.5" /> Decision rights enabled
              </span>
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-50 px-3 text-[11px] font-medium text-ink-500 ring-1 ring-ink-200">
                <AlertTriangle className="h-3.5 w-3.5" /> Read-only access
              </span>
            )}
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Credit queue indicators">
        <StatCard
          label="Pending review"
          value={formatNumber(summary.counts.pending)}
          hint={`${formatINRCompact(summary.pendingValue)} requested`}
          icon={<FileSearch className="h-4 w-4" />}
          accent="amber"
          trend={{ value: `${summary.highRiskCount} high risk`, direction: "flat" }}
        />
        <StatCard
          label="In process"
          value={formatNumber(summary.counts.process)}
          hint="Awaiting recommendation"
          icon={<Gauge className="h-4 w-4" />}
          accent="sky"
        />
        <StatCard
          label="Decided last 30 days"
          value={formatNumber(summary.decidedLast30Days)}
          hint={`${formatNumber(summary.counts.decisions)} total decisions`}
          icon={<ClipboardCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Approved value (30d)"
          value={formatINRCompact(summary.approvedValue)}
          hint={`Avg queue ticket ${formatINRCompact(summary.avgTicket)}`}
          icon={<Wallet className="h-4 w-4" />}
          accent="brand"
        />
      </section>

      <CreditFilters
        branches={branches}
        employees={employees}
        values={{
          branch: filters.branchId,
          owner: filters.ownerId,
          product: filters.product,
          from: filters.from,
          to: filters.to,
        }}
        activeCount={activeFilterCount}
      />

      <div className="space-y-3">
        <div className="surface overflow-hidden rounded-2xl">
          <div className="px-4 pt-1">
            <LinkTabs className="border-b-0" items={tabItems} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-2.5">
            <p className="text-[11.5px] text-ink-500">
              <span className="font-medium text-ink-800">{formatNumber(queue.total)}</span> application
              {queue.total === 1 ? "" : "s"} in {activeTabLabel.toLowerCase()}
              {activeFilterCount > 0 ? " with filters applied" : ""}.
            </p>
            <p className="text-[10.5px] text-ink-400">Tab counts are computed server-side for your branch scope.</p>
          </div>
        </div>
        <CreditTable rows={queue.rows} tabLabel={activeTabLabel} />
      </div>

      <InlineNote>
        DEMO environment: credit decisions are illustrative and recorded against synthetic applications only. No bureau
        pull, scoring engine or e-signature integration is connected. All amounts in INR.
      </InlineNote>
    </div>
  );
}
