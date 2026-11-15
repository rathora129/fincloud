import { redirect } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Banknote, CircleDollarSign, Clock3, Landmark, ShieldAlert } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope, inScope } from "@/server/access";
import { getStore } from "@/server/store";
import {
  DISBURSEMENT_TABS,
  getDisbursementEligibleSanctions,
  getDisbursementQueue,
  parseDisbursementTab,
} from "@/server/disbursements";
import { can } from "@/lib/rbac";
import { formatINRCompact, formatNumber } from "@/lib/utils";
import type { LoanProduct } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { InlineNote, PermissionDenied } from "@/components/ui/states";
import { DisbursementFilters } from "./disbursement-filters";
import { DisbursementCreateDialog } from "./disbursement-create-dialog";
import { DisbursementTable } from "./disbursement-table";

export const metadata = { title: "Disbursements" };

export default async function DisbursementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "disbursements:view")) return <PermissionDenied className="mt-2" />;

  const params = await searchParams;
  const value = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const tab = parseDisbursementTab(value("tab"));

  const filters = {
    branchId: value("branch"),
    ownerId: value("owner"),
    product: (value("product") as LoanProduct | undefined) ?? "",
    mode: value("mode"),
    from: value("from"),
    to: value("to"),
  };

  const scope = buildScope(user);
  const store = getStore();
  const queue = getDisbursementQueue(scope, tab, filters);
  const canCreate = can(user, "disbursements:process");
  const eligibleSanctions = canCreate ? getDisbursementEligibleSanctions(scope) : [];

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

  const activeFilterCount = [
    filters.branchId,
    filters.ownerId,
    filters.product,
    filters.mode,
    filters.from,
    filters.to,
  ].filter(Boolean).length;

  const tabHref = (key: string) => {
    const query = new URLSearchParams();
    query.set("tab", key);
    if (filters.branchId) query.set("branch", filters.branchId);
    if (filters.ownerId) query.set("owner", filters.ownerId);
    if (filters.product) query.set("product", filters.product);
    if (filters.mode) query.set("mode", filters.mode);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    return `/disbursements?${query.toString()}`;
  };

  const tabItems = DISBURSEMENT_TABS.map((item) => ({
    key: item.key,
    label: item.label,
    count: item.key === tab ? -1 : queue.counts[item.key],
    href: tabHref(item.key),
  }));

  const activeTabLabel = DISBURSEMENT_TABS.find((item) => item.key === tab)?.label ?? "New";
  const summary = queue.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Risk & fulfilment"
        title="Disbursements"
        description={`Payout processing from approved sanctions for ${scope.isGlobal ? "all branches" : user.branchName}. Processing, recommendation and authorization are separate steps.`}
        breadcrumbs={[{ label: "Risk & fulfilment" }, { label: "Disbursements" }]}
        actions={
          <>
            {canCreate ? <DisbursementCreateDialog sanctions={eligibleSanctions} /> : null}
            <Link
              href="/sanctions"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11.5px] font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900"
            >
              <BadgeCheck className="h-3.5 w-3.5" /> Sanctions
            </Link>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-50 px-3 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
              <ShieldAlert className="h-3.5 w-3.5" /> DEMO mode · no real transfers
            </span>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Disbursement indicators">
        <StatCard
          label="Pipeline value"
          value={formatINRCompact(summary.pipelineValue)}
          hint={`${formatNumber(
            summary.counts.new + summary.counts.in_process + summary.counts.recommended + summary.counts.pending,
          )} in-flight requests`}
          icon={<CircleDollarSign className="h-4 w-4" />}
          accent="amber"
        />
        <StatCard
          label="Awaiting authorization"
          value={formatNumber(summary.awaitingApproval)}
          hint="Pending checker approval"
          icon={<Clock3 className="h-4 w-4" />}
          accent="sky"
        />
        <StatCard
          label="Completed value"
          value={formatINRCompact(summary.completedValue)}
          hint={`${formatNumber(summary.counts.completed)} completed (DEMO)`}
          icon={<Banknote className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Completed last 30 days"
          value={formatNumber(summary.completedLast30Days)}
          hint={`${formatNumber(summary.rejectedCount)} rejected`}
          icon={<Landmark className="h-4 w-4" />}
        />
      </section>

      <DisbursementFilters
        branches={branches}
        employees={employees}
        values={{
          branch: filters.branchId,
          owner: filters.ownerId,
          product: filters.product,
          mode: filters.mode,
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
              <span className="font-medium text-ink-800">{formatNumber(queue.total)}</span> disbursement
              {queue.total === 1 ? "" : "s"} in {activeTabLabel.toLowerCase()}
              {activeFilterCount > 0 ? " with filters applied" : ""}.
            </p>
            <p className="text-[10.5px] text-ink-400">Bank references are synthetic DEMO identifiers.</p>
          </div>
        </div>
        <DisbursementTable rows={queue.rows} tabLabel={activeTabLabel} />
      </div>

      <InlineNote tone="warning">
        DEMO mode: no real bank transfer, NEFT/IMPS/UPI instruction or payment integration is executed. Completing a
        disbursement only creates a synthetic loan account and repayment schedule for demonstration.
      </InlineNote>
    </div>
  );
}
