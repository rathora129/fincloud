import { redirect } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Banknote, Clock3, FileCheck2, ShieldCheck, XCircle } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope, inScope } from "@/server/access";
import { getStore } from "@/server/store";
import { SANCTION_TABS, getSanctionQueue, parseSanctionTab } from "@/server/sanctions";
import { can } from "@/lib/rbac";
import { formatINRCompact, formatNumber } from "@/lib/utils";
import type { LoanProduct } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { InlineNote, PermissionDenied } from "@/components/ui/states";
import { SanctionFilters } from "./sanction-filters";
import { SanctionTable } from "./sanction-table";

export const metadata = { title: "Sanctions" };

export default async function SanctionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "sanctions:view")) return <PermissionDenied className="mt-2" />;

  const params = await searchParams;
  const value = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const tab = parseSanctionTab(value("tab"));

  const filters = {
    branchId: value("branch"),
    ownerId: value("owner"),
    product: (value("product") as LoanProduct | undefined) ?? "",
    from: value("from"),
    to: value("to"),
  };

  const scope = buildScope(user);
  const store = getStore();
  const queue = getSanctionQueue(scope, tab, filters);

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
    return `/sanctions?${query.toString()}`;
  };

  const tabItems = SANCTION_TABS.map((item) => ({
    key: item.key,
    label: item.label,
    count: item.key === tab ? -1 : queue.counts[item.key],
    href: tabHref(item.key),
  }));

  const activeTabLabel = SANCTION_TABS.find((item) => item.key === tab)?.label ?? "Acceptance pending";
  const summary = queue.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Risk & fulfilment"
        title="Sanctions"
        description={`Sanction offers raised from credit-approved applications. Record customer acceptance and branch approvals for ${scope.isGlobal ? "all branches" : user.branchName}.`}
        breadcrumbs={[{ label: "Risk & fulfilment" }, { label: "Sanctions" }]}
        actions={
          <>
            <Link
              href="/credit"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11.5px] font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Credit queue
            </Link>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-50 px-3 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
              <Clock3 className="h-3.5 w-3.5" /> {formatNumber(summary.counts.acceptance)} awaiting acceptance
            </span>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sanction indicators">
        <StatCard
          label="Awaiting customer acceptance"
          value={formatNumber(summary.counts.acceptance)}
          hint={`${formatINRCompact(summary.acceptanceValue)} offer value`}
          icon={<FileCheck2 className="h-4 w-4" />}
          accent="amber"
        />
        <StatCard
          label="Processing"
          value={formatNumber(summary.counts.processing)}
          hint={`${formatINRCompact(summary.processingValue)} in process`}
          icon={<Clock3 className="h-4 w-4" />}
          accent="sky"
        />
        <StatCard
          label="Approved value"
          value={formatINRCompact(summary.approvedValue)}
          hint={`${formatNumber(summary.counts.approved)} approved sanctions`}
          icon={<BadgeCheck className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Decided last 30 days"
          value={formatNumber(summary.decidedLast30Days)}
          hint="Approved or rejected in window"
          icon={<Banknote className="h-4 w-4" />}
        />
      </section>

      <SanctionFilters
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
              <span className="font-medium text-ink-800">{formatNumber(queue.total)}</span> sanction
              {queue.total === 1 ? "" : "s"} in {activeTabLabel.toLowerCase()}
              {activeFilterCount > 0 ? " with filters applied" : ""}.
            </p>
            <p className="text-[10.5px] text-ink-400">
              {summary.counts.rejected > 0 ? (
                <span className="inline-flex items-center gap-1 text-rose-600">
                  <XCircle className="h-3 w-3" /> {summary.counts.rejected} rejected
                </span>
              ) : (
                "Sanction terms are indicative and non-binding in DEMO mode."
              )}
            </p>
          </div>
        </div>
        <SanctionTable rows={queue.rows} tabLabel={activeTabLabel} />
      </div>

      <InlineNote>
        Sanction approval does not move money. It updates the sanction status and marks the linked application as
        sanctioned; disbursement is a separate DEMO workflow. All amounts in INR.
      </InlineNote>
    </div>
  );
}
