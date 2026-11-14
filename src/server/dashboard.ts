import type {
  DashboardData,
  LoanProduct,
  Scope,
  SeriesPoint,
} from "@/lib/types";
import { getStore } from "./store";
import { inDateRange, monthBuckets, monthKey, sortBy } from "./query";
import { canViewRecord, inScope } from "./access";

export type DashboardFilters = {
  branchId?: string;
  ownerId?: string;
  product?: LoanProduct | "";
  status?: string;
  from?: string;
  to?: string;
};

const PRODUCTS: LoanProduct[] = ["PERSONAL", "BUSINESS", "HOME", "VEHICLE", "GOLD"];

export function getDashboardData(scope: Scope, filters: DashboardFilters = {}): DashboardData {
  const store = getStore();
  const from = filters.from ?? new Date(Date.now() - 179 * 86_400_000).toISOString();
  const to = filters.to ?? new Date().toISOString();
  const buckets = monthBuckets(6);

  const inBranch = (branchId: string) =>
    inScope(scope, branchId) && (!filters.branchId || branchId === filters.branchId);

  const leads = store.leads.filter(
    (l) =>
      inBranch(l.branchId) &&
      (!filters.ownerId || l.ownerId === filters.ownerId) &&
      inDateRange(l.createdAt, from, to) &&
      canViewRecord(scope.user, "LEAD", l.id, "leads:view", l.branchId, l.ownerId),
  );

  const applications = store.applications.filter(
    (a) =>
      inBranch(a.branchId) &&
      (!filters.ownerId || a.ownerId === filters.ownerId || a.creditOfficerId === filters.ownerId) &&
      (!filters.product || a.product === filters.product) &&
      (!filters.status || a.status === filters.status) &&
      inDateRange(a.createdAt, from, to) &&
      canViewRecord(scope.user, "APPLICATION", a.id, "applications:view", a.branchId, a.ownerId),
  );
  const appById = new Map(store.applications.map((a) => [a.id, a]));

  const disbursements = store.disbursements.filter(
    (d) =>
      inBranch(d.branchId) &&
      (!filters.product || appById.get(d.applicationId)?.product === filters.product) &&
      inDateRange(d.requestedAt, from, to) &&
      canViewRecord(
        scope.user,
        "DISBURSEMENT",
        d.id,
        "disbursements:view",
        d.branchId,
        appById.get(d.applicationId)?.ownerId,
      ),
  );
  const completedDisbursements = disbursements.filter((d) => d.status === "COMPLETED");
  const loans = store.loanAccounts.filter(
    (l) =>
      inBranch(l.branchId) &&
      (!filters.product || appById.get(l.applicationId)?.product === filters.product) &&
      canViewRecord(scope.user, "LOAN", l.id, "collections:view", l.branchId),
  );
  const scopedLoanIds = new Set(loans.map((l) => l.id));
  const repayments = store.repayments.filter((r) => scopedLoanIds.has(r.loanAccountId));
  const dueInWindow = repayments.filter((r) => inDateRange(r.dueDate, from, to));
  const paidInWindow = repayments.filter((r) => r.status === "PAID" && r.paidDate && inDateRange(r.paidDate, from, to));
  const dueAmount = dueInWindow.reduce((acc, r) => acc + r.amount, 0);
  const paidAmount = paidInWindow.reduce((acc, r) => acc + r.amount, 0);

  const tasks = store.tasks.filter(
    (t) =>
      inBranch(t.branchId) && canViewRecord(scope.user, "TASK", t.id, "tasks:view", t.branchId, t.assigneeId),
  );
  const openTasks = tasks.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status));
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const totalLeads = leads.length;
  const newLeads = leads.filter((l) => new Date(l.createdAt).getTime() >= Date.now() - 30 * 86_400_000).length;
  const newApplications = applications.filter((a) => a.status === "NEW").length;
  const inProcessApplications = applications.filter((a) => ["IN_PROCESS", "RECOMMENDED", "SENT_BACK"].includes(a.status)).length;
  const pendingCredit = applications.filter((a) => a.status === "RECOMMENDED").length;
  const approvedLoans = applications.filter((a) => a.creditDecision?.decision === "APPROVE").length;
  const rejectedLoans = applications.filter((a) => a.creditDecision?.decision === "REJECT").length;
  const totalDisbursed = completedDisbursements.reduce((acc, d) => acc + d.amount, 0);
  const overdueAmount = loans.filter((l) => l.status === "OVERDUE").reduce((acc, l) => acc + l.outstanding, 0);

  const applicationTrend: SeriesPoint[] = buckets.map((bucket) => ({
    label: bucket.label,
    value: applications.filter((a) => new Date(a.createdAt).getTime() >= bucket.start && new Date(a.createdAt).getTime() < bucket.end).length,
  }));

  const disbursementTrend: SeriesPoint[] = buckets.map((bucket) => ({
    label: bucket.label,
    value: completedDisbursements
      .filter((d) => d.processedAt && new Date(d.processedAt).getTime() >= bucket.start && new Date(d.processedAt).getTime() < bucket.end)
      .reduce((acc, d) => acc + d.amount, 0),
  }));

  const collectionTrend: SeriesPoint[] = buckets.map((bucket) => ({
    label: bucket.label,
    value: paidInWindow
      .filter((r) => r.paidDate && new Date(r.paidDate).getTime() >= bucket.start && new Date(r.paidDate).getTime() < bucket.end)
      .reduce((acc, r) => acc + r.amount, 0),
  }));

  const leadFunnel = (["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"] as const).map((status) => ({
    stage: status,
    value: leads.filter((l) => l.status === status).length,
  }));

  const productMix = PRODUCTS.map((product) => ({
    label: product,
    value: completedDisbursements
      .filter((d) => store.applications.find((a) => a.id === d.applicationId)?.product === product)
      .reduce((acc, d) => acc + d.amount, 0),
  }));

  const decisionBucketMap = new Map(buckets.map((b) => [b.key, { approved: 0, rejected: 0 }]));
  applications.forEach((a) => {
    if (!a.creditDecision) return;
    const key = monthKey(a.creditDecision.decidedAt);
    const bucket = decisionBucketMap.get(key);
    if (!bucket) return;
    if (a.creditDecision.decision === "APPROVE") bucket.approved += 1;
    if (a.creditDecision.decision === "REJECT") bucket.rejected += 1;
  });
  const decisionTrend = {
    labels: buckets.map((b) => b.label),
    approved: buckets.map((b) => decisionBucketMap.get(b.key)?.approved ?? 0),
    rejected: buckets.map((b) => decisionBucketMap.get(b.key)?.rejected ?? 0),
  };

  const teamUsers = store.users.filter(
    (u) =>
      u.status === "ACTIVE" &&
      inScope(scope, u.branchId) &&
      ["LOAN_OFFICER", "CREDIT_OFFICER", "COLLECTION_OFFICER", "BRANCH_MANAGER"].includes(u.role) &&
      (!filters.branchId || u.branchId === filters.branchId),
  );

  const teamPerformance = teamUsers
    .map((u) => {
      const userLeads = leads.filter((l) => l.ownerId === u.id).length;
      const userApps = applications.filter((a) => a.ownerId === u.id).length;
      const disbursed = completedDisbursements
        .filter((d) => d.processedBy === u.id)
        .reduce((acc, d) => acc + d.amount, 0);
      const collections = store.collectionCases.filter(
        (c) =>
          c.assignedTo === u.id &&
          c.status === "RESOLVED" &&
          canViewRecord(scope.user, "COLLECTION", c.id, "collections:view", c.branchId, c.assignedTo),
      ).length;
      const tasksCompleted = tasks.filter((t) => t.assigneeId === u.id && t.status === "COMPLETED").length;
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        leads: userLeads,
        applications: userApps,
        disbursed,
        collections,
        tasksCompleted,
      };
    })
    .sort((a, b) => b.disbursed + b.applications * 1000 - (a.disbursed + a.applications * 1000))
    .slice(0, 6);

  const branchPerformance = store.branches
    .filter((b) => inScope(scope, b.id) && (!filters.branchId || b.id === filters.branchId))
    .map((b) => {
      const branchLoans = store.loanAccounts.filter(
        (l) => l.branchId === b.id && canViewRecord(scope.user, "LOAN", l.id, "collections:view", l.branchId),
      );
      const branchLoanIds = new Set(branchLoans.map((l) => l.id));
      return {
        branch: b.name.split("—")[0].trim(),
        disbursed: store.disbursements
          .filter(
            (d) =>
              d.branchId === b.id &&
              d.status === "COMPLETED" &&
              canViewRecord(
                scope.user,
                "DISBURSEMENT",
                d.id,
                "disbursements:view",
                d.branchId,
                appById.get(d.applicationId)?.ownerId,
              ),
          )
          .reduce((acc, d) => acc + d.amount, 0),
        collected: store.repayments
          .filter((r) => branchLoanIds.has(r.loanAccountId) && r.status === "PAID" && r.paidDate && inDateRange(r.paidDate, from, to))
          .reduce((acc, r) => acc + r.amount, 0),
        overdue: branchLoans.filter((l) => l.status === "OVERDUE").reduce((acc, l) => acc + l.outstanding, 0),
      };
    })
    .sort((a, b) => b.disbursed - a.disbursed);

  const recentActivities = sortBy(
    store.auditLogs.filter((log) => {
      const actor = store.users.find((u) => u.id === log.actorId);
      return actor ? inBranch(actor.branchId) : false;
    }),
    (l) => new Date(l.at).getTime(),
    "desc",
  ).slice(0, 8);

  const pendingTasks = sortBy(
    openTasks.filter((t) => !filters.ownerId || t.assigneeId === filters.ownerId),
    (t) => new Date(t.dueDate).getTime(),
    "asc",
  ).slice(0, 6);

  return {
    kpis: {
      totalLeads,
      newLeads,
      newApplications,
      inProcessApplications,
      pendingCredit,
      approvedLoans,
      rejectedLoans,
      totalDisbursed,
      collectionRate: dueAmount > 0 ? Math.min(100, (paidAmount / dueAmount) * 100) : 0,
      overdueAmount,
      activeLoans: loans.filter((l) => l.status === "ACTIVE").length,
      tasksDue: openTasks.filter((t) => new Date(t.dueDate).getTime() <= todayEnd.getTime()).length,
    },
    applicationTrend,
    disbursementTrend,
    collectionTrend,
    leadFunnel,
    productMix,
    decisionTrend,
    pendingTasks,
    recentActivities,
    teamPerformance,
    branchPerformance,
  };
}
