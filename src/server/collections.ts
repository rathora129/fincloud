import type {
  Activity,
  CollectionBucket,
  CollectionCase,
  CollectionStatus,
  Customer,
  LoanAccount,
  Repayment,
  Scope,
  SessionUser,
} from "@/lib/types";
import { formatINR } from "@/lib/utils";
import { ApiError, assertBranchScope, assertRecordPermission, buildScope, canViewRecord, inScope } from "./access";
import { appendAudit, getStore, makeId } from "./store";

const DAY = 86_400_000;

const OPEN_STATUSES: CollectionStatus[] = ["PRE_COLLECTION", "PENDING", "RECOVERY", "LEGAL"];

export const COLLECTION_TABS: { key: CollectionStatus | "ALL"; label: string }[] = [
  { key: "PRE_COLLECTION", label: "Pre-collection" },
  { key: "PENDING", label: "Pending" },
  { key: "RECOVERY", label: "Recovery" },
  { key: "LEGAL", label: "Legal" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "ALL", label: "All" },
];

export type CollectionTab = CollectionStatus | "ALL";

export function normalizeCollectionTab(value: string | undefined): CollectionTab {
  const found = COLLECTION_TABS.find((tab) => tab.key === value);
  return found?.key ?? "ALL";
}

export type CollectionRow = {
  id: string;
  ref: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  loanAccountId: string;
  loanRef: string;
  branchId: string;
  branchName: string;
  bucket: CollectionBucket;
  status: CollectionStatus;
  overdueAmount: number;
  daysPastDue: number;
  assignedTo: string;
  assignedToName: string;
  assignedToColor: string;
  lastContactAt: string | null;
  nextActionAt: string | null;
  ptpAmount: number | null;
  ptpDate: string | null;
  emiAmount: number;
  outstanding: number;
  recoveryStage: string;
};

export type CollectionKpis = {
  openCases: number;
  overdueAmount: number;
  ptpAmount: number;
  ptpCount: number;
  resolvedThisMonth: number;
  preCollectionCount: number;
};

export type CollectionsOverview = {
  rows: CollectionRow[];
  counts: Record<CollectionTab, number>;
  kpis: CollectionKpis;
};

export type CollectionListFilters = {
  tab?: CollectionTab;
  bucket?: string;
  assigneeId?: string;
  branchId?: string;
  minDpd?: number;
  maxDpd?: number;
};

export type CollectionFilterOptions = {
  branches: { id: string; name: string }[];
  assignees: { id: string; name: string; color: string }[];
  buckets: { key: CollectionBucket; label: string }[];
};

export type CollectionActivity = {
  id: string;
  at: string;
  type: string;
  summary: string;
  actorName: string;
  actorColor: string;
};

export type CollectionDetail = {
  collectionCase: CollectionCase;
  customer: Customer | null;
  loan: LoanAccount | null;
  officer: { id: string; name: string; designation: string; avatarColor: string } | null;
  branchName: string;
  repayments: Repayment[];
  oldestOverdue: Repayment | null;
  activities: CollectionActivity[];
  allowedStatuses: Array<"RECOVERY" | "LEGAL">;
};

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function daysLate(dueDate: string) {
  return Math.max(1, Math.floor((Date.now() - new Date(dueDate).getTime()) / DAY));
}

function currentMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function addActivity(target: { activities: Activity[] }, actorId: string, type: string, summary: string) {
  target.activities.unshift({
    id: makeId("act"),
    at: new Date().toISOString(),
    actorId,
    type,
    summary,
  });
}

export function allowedCollectionTransitions(status: CollectionStatus): Array<"RECOVERY" | "LEGAL"> {
  if (status === "PENDING") return ["RECOVERY"];
  if (status === "RECOVERY") return ["LEGAL"];
  return [];
}

function toRow(
  collectionCase: CollectionCase,
  customer: Customer | undefined,
  loan: LoanAccount | undefined,
  assignee: { id: string; name: string; avatarColor: string } | undefined,
  branchName: string,
): CollectionRow {
  return {
    id: collectionCase.id,
    ref: collectionCase.ref,
    customerId: collectionCase.customerId,
    customerName: customer?.name ?? "Synthetic customer",
    customerPhone: customer?.phone ?? "—",
    loanAccountId: collectionCase.loanAccountId,
    loanRef: loan?.ref ?? "—",
    branchId: collectionCase.branchId,
    branchName,
    bucket: collectionCase.bucket,
    status: collectionCase.status,
    overdueAmount: collectionCase.overdueAmount,
    daysPastDue: collectionCase.daysPastDue,
    assignedTo: collectionCase.assignedTo,
    assignedToName: assignee?.name ?? "Unassigned",
    assignedToColor: assignee?.avatarColor ?? "#8099a5",
    lastContactAt: collectionCase.lastContactAt,
    nextActionAt: collectionCase.nextActionAt,
    ptpAmount: collectionCase.ptpAmount,
    ptpDate: collectionCase.ptpDate,
    emiAmount: loan?.emiAmount ?? 0,
    outstanding: loan?.outstanding ?? 0,
    recoveryStage: collectionCase.recoveryStage,
  };
}

function collectionVisible(scope: Scope, collectionCase: CollectionCase): boolean {
  return (
    inScope(scope, collectionCase.branchId) &&
    canViewRecord(
      scope.user,
      "COLLECTION",
      collectionCase.id,
      "collections:view",
      collectionCase.branchId,
      collectionCase.assignedTo,
    )
  );
}

export function getCollectionsOverview(scope: Scope, filters: CollectionListFilters = {}): CollectionsOverview {
  const store = getStore();
  const customerById = new Map(store.customers.map((customer) => [customer.id, customer]));
  const loanById = new Map(store.loanAccounts.map((loan) => [loan.id, loan]));
  const userById = new Map(store.users.map((user) => [user.id, user]));
  const branchById = new Map(store.branches.map((branch) => [branch.id, branch]));

  const scoped = store.collectionCases.filter((collectionCase) => collectionVisible(scope, collectionCase));
  const filtered = scoped.filter(
    (collectionCase) =>
      (!filters.bucket || collectionCase.bucket === filters.bucket) &&
      (!filters.assigneeId || collectionCase.assignedTo === filters.assigneeId) &&
      (!filters.branchId || collectionCase.branchId === filters.branchId) &&
      (filters.minDpd === undefined || collectionCase.daysPastDue >= filters.minDpd) &&
      (filters.maxDpd === undefined || collectionCase.daysPastDue <= filters.maxDpd),
  );

  const counts: Record<CollectionTab, number> = {
    ALL: filtered.length,
    PRE_COLLECTION: 0,
    PENDING: 0,
    RECOVERY: 0,
    LEGAL: 0,
    RESOLVED: 0,
  };
  filtered.forEach((collectionCase) => {
    counts[collectionCase.status] += 1;
  });

  const tab = filters.tab ?? "ALL";
  const rows = filtered
    .filter((collectionCase) => tab === "ALL" || collectionCase.status === tab)
    .map((collectionCase) =>
      toRow(
        collectionCase,
        customerById.get(collectionCase.customerId),
        loanById.get(collectionCase.loanAccountId),
        userById.get(collectionCase.assignedTo),
        branchById.get(collectionCase.branchId)?.name ?? "—",
      ),
    )
    .sort((a, b) => {
      if (a.status === "PRE_COLLECTION" && b.status !== "PRE_COLLECTION") return 1;
      if (b.status === "PRE_COLLECTION" && a.status !== "PRE_COLLECTION") return -1;
      return b.daysPastDue - a.daysPastDue || b.overdueAmount - a.overdueAmount;
    });

  const active = filtered.filter((collectionCase) => collectionCase.status !== "RESOLVED");
  const ptpCases = active.filter((collectionCase) => collectionCase.ptpAmount !== null && collectionCase.ptpDate !== null);
  const monthStart = currentMonthStart();

  const kpis: CollectionKpis = {
    openCases: filtered.filter((collectionCase) => OPEN_STATUSES.includes(collectionCase.status)).length,
    overdueAmount: active.reduce((total, collectionCase) => total + collectionCase.overdueAmount, 0),
    ptpAmount: ptpCases.reduce((total, collectionCase) => total + (collectionCase.ptpAmount ?? 0), 0),
    ptpCount: ptpCases.length,
    resolvedThisMonth: filtered.filter(
      (collectionCase) =>
        collectionCase.status === "RESOLVED" &&
        collectionCase.activities.some(
          (activity) => activity.type === "CASE_RESOLVED" && new Date(activity.at).getTime() >= monthStart,
        ),
    ).length,
    preCollectionCount: counts.PRE_COLLECTION,
  };

  return { rows, counts, kpis };
}

export function getCollectionFilterOptions(scope: Scope): CollectionFilterOptions {
  const store = getStore();
  const scopedCases = store.collectionCases.filter((collectionCase) => collectionVisible(scope, collectionCase));
  const assignedIds = new Set(scopedCases.map((collectionCase) => collectionCase.assignedTo));
  const assignees = store.users
    .filter(
      (user) =>
        user.status === "ACTIVE" &&
        inScope(scope, user.branchId) &&
        (assignedIds.has(user.id) ||
          ["COLLECTION_OFFICER", "BRANCH_MANAGER"].includes(user.role)),
    )
    .map((user) => ({ id: user.id, name: user.name, color: user.avatarColor }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    branches: store.branches
      .filter((branch) => inScope(scope, branch.id))
      .map((branch) => ({ id: branch.id, name: branch.name })),
    assignees,
    buckets: [
      { key: "PRE_DUE", label: "Pre-due" },
      { key: "BUCKET_1", label: "1–30 DPD" },
      { key: "BUCKET_2", label: "31–60 DPD" },
      { key: "BUCKET_3", label: "61–90 DPD" },
      { key: "NPA", label: "90+ DPD / NPA" },
    ],
  };
}

export function getCollectionDetail(scope: Scope, caseId: string): CollectionDetail | null {
  const store = getStore();
  const collectionCase = store.collectionCases.find((item) => item.id === caseId);
  if (!collectionCase || !collectionVisible(scope, collectionCase)) return null;

  const customer = store.customers.find((item) => item.id === collectionCase.customerId) ?? null;
  const loan = store.loanAccounts.find((item) => item.id === collectionCase.loanAccountId) ?? null;
  const officerRecord = store.users.find((item) => item.id === collectionCase.assignedTo) ?? null;
  const branchName = store.branches.find((item) => item.id === collectionCase.branchId)?.name ?? "—";

  const repayments = store.repayments
    .filter((repayment) => repayment.loanAccountId === collectionCase.loanAccountId)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const oldestOverdue = repayments.find((repayment) => repayment.status === "OVERDUE") ?? null;

  const userById = new Map(store.users.map((user) => [user.id, user]));
  const activities: CollectionActivity[] = [...collectionCase.activities]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((activity) => {
      const actor = userById.get(activity.actorId);
      return {
        id: activity.id,
        at: activity.at,
        type: activity.type,
        summary: activity.summary,
        actorName: actor?.name ?? "System",
        actorColor: actor?.avatarColor ?? "#8099a5",
      };
    });

  return {
    collectionCase,
    customer,
    loan,
    officer: officerRecord
      ? {
          id: officerRecord.id,
          name: officerRecord.name,
          designation: officerRecord.designation,
          avatarColor: officerRecord.avatarColor,
        }
      : null,
    branchName,
    repayments,
    oldestOverdue,
    activities,
    allowedStatuses: allowedCollectionTransitions(collectionCase.status),
  };
}

export type CollectionActionInput =
  | { action: "LOG_CONTACT"; note: string; nextActionAt?: string | null }
  | { action: "SET_PTP"; ptpAmount: number; ptpDate: string }
  | { action: "MOVE_STATUS"; status: "RECOVERY" | "LEGAL" }
  | { action: "RESOLVE"; note: string };

export type CollectionMutationResult = {
  collectionCase: CollectionCase;
  allowedStatuses: Array<"RECOVERY" | "LEGAL">;
  message: string;
};

function findCaseOrThrow(caseId: string) {
  const store = getStore();
  const collectionCase = store.collectionCases.find((item) => item.id === caseId);
  if (!collectionCase) {
    throw new ApiError(404, "NOT_FOUND", "Collection case not found.");
  }
  return { store, collectionCase };
}

export function applyCollectionAction(
  user: SessionUser,
  caseId: string,
  input: CollectionActionInput,
): CollectionMutationResult {
  const scope = buildScope(user);
  const { collectionCase } = findCaseOrThrow(caseId);
  assertBranchScope(scope, collectionCase.branchId);
  assertRecordPermission(
    user,
    "COLLECTION",
    collectionCase.id,
    "collections:manage",
    collectionCase.branchId,
    collectionCase.assignedTo,
  );

  if (collectionCase.status === "RESOLVED") {
    throw new ApiError(409, "CASE_RESOLVED", "This case is already resolved. No further action is possible.");
  }

  let message = "";

  if (input.action === "LOG_CONTACT") {
    const note = input.note.trim();
    if (note.length < 3) {
      throw new ApiError(422, "NOTE_REQUIRED", "Add a short note (at least 3 characters).");
    }
    let nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : null;
    if (nextActionAt && Number.isNaN(nextActionAt.getTime())) {
      throw new ApiError(422, "INVALID_DATE", "Enter a valid next action date.");
    }
    if (nextActionAt && nextActionAt.getTime() < startOfToday().getTime()) {
      throw new ApiError(422, "INVALID_DATE", "Next action date cannot be in the past.");
    }
    if (!nextActionAt) {
      nextActionAt = new Date(Date.now() + 2 * DAY);
    }
    collectionCase.lastContactAt = new Date().toISOString();
    collectionCase.nextActionAt = nextActionAt.toISOString();
    addActivity(
      collectionCase,
      user.id,
      "CONTACT_LOGGED",
      note.length > 180 ? `${note.slice(0, 177)}…` : note,
    );
    message = "Contact logged and next action scheduled.";
  }

  if (input.action === "SET_PTP") {
    if (!Number.isFinite(input.ptpAmount) || input.ptpAmount <= 0) {
      throw new ApiError(422, "INVALID_AMOUNT", "Promise amount must be greater than zero.");
    }
    const ptpDate = new Date(input.ptpDate);
    if (Number.isNaN(ptpDate.getTime())) {
      throw new ApiError(422, "INVALID_DATE", "Enter a valid promise date.");
    }
    if (ptpDate.getTime() < startOfToday().getTime()) {
      throw new ApiError(422, "INVALID_DATE", "Promise date cannot be in the past.");
    }
    collectionCase.ptpAmount = round2(input.ptpAmount);
    collectionCase.ptpDate = ptpDate.toISOString();
    collectionCase.nextActionAt = ptpDate.toISOString();
    collectionCase.recoveryStage = "PTP recorded";
    addActivity(
      collectionCase,
      user.id,
      "PTP_RECORDED",
      `Promise to pay ${formatINR(round2(input.ptpAmount))} recorded for ${ptpDate.toISOString().slice(0, 10)}.`,
    );
    message = "Promise to pay recorded.";
  }

  if (input.action === "MOVE_STATUS") {
    const allowed = allowedCollectionTransitions(collectionCase.status);
    if (!allowed.includes(input.status)) {
      throw new ApiError(
        409,
        "INVALID_TRANSITION",
        `A ${collectionCase.status.replaceAll("_", " ").toLowerCase()} case cannot move directly to ${input.status.toLowerCase()}.`,
      );
    }
    collectionCase.status = input.status;
    collectionCase.recoveryStage = input.status === "RECOVERY" ? "Recovery follow-up" : "Legal escalation";
    addActivity(
      collectionCase,
      user.id,
      "STATUS_CHANGED",
      input.status === "RECOVERY"
        ? "Case moved from pending to recovery."
        : "Case escalated from recovery to legal.",
    );
    message = input.status === "RECOVERY" ? "Case moved to recovery." : "Case escalated to legal.";
  }

  if (input.action === "RESOLVE") {
    const note = input.note.trim();
    if (note.length < 5) {
      throw new ApiError(422, "NOTE_REQUIRED", "Add a resolution note (at least 5 characters).");
    }
    collectionCase.status = "RESOLVED";
    collectionCase.recoveryStage = "Resolved";
    collectionCase.ptpAmount = null;
    collectionCase.ptpDate = null;
    addActivity(collectionCase, user.id, "CASE_RESOLVED", `Case resolved — ${note}`);
    message = "Case resolved.";
  }

  appendAudit(
    getStore(),
    user.id,
    `COLLECTION_${input.action}`,
    "Collection case",
    collectionCase.id,
    `${collectionCase.ref}: ${message}`,
  );

  return {
    collectionCase,
    allowedStatuses: allowedCollectionTransitions(collectionCase.status),
    message,
  };
}

export type RepaymentMode = "NACH" | "UPI" | "NEFT" | "CASH";

export type RecordRepaymentResult = {
  repayment: Repayment;
  loan: LoanAccount;
  collectionCase: CollectionCase | null;
  message: string;
};

export function recordCollectionRepayment(
  user: SessionUser,
  repaymentId: string,
  input: { mode: RepaymentMode },
): RecordRepaymentResult {
  const store = getStore();
  const scope = buildScope(user);

  const repayment = store.repayments.find((item) => item.id === repaymentId);
  if (!repayment) {
    throw new ApiError(404, "NOT_FOUND", "Repayment instalment not found.");
  }
  const loan = store.loanAccounts.find((item) => item.id === repayment.loanAccountId);
  if (!loan) {
    throw new ApiError(404, "NOT_FOUND", "Linked loan account not found.");
  }
  assertBranchScope(scope, loan.branchId);
  assertRecordPermission(user, "LOAN", loan.id, "collections:manage", loan.branchId);

  if (repayment.status !== "OVERDUE") {
    throw new ApiError(
      409,
      "INVALID_STATE",
      "Only the oldest overdue instalment can be settled from this panel.",
    );
  }

  const oldestOverdue = store.repayments
    .filter((item) => item.loanAccountId === loan.id && item.status === "OVERDUE")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  if (!oldestOverdue || oldestOverdue.id !== repayment.id) {
    throw new ApiError(409, "OUT_OF_ORDER", "Settle the oldest overdue instalment first.");
  }

  const nowIso = new Date().toISOString();
  repayment.status = "PAID";
  repayment.paidDate = nowIso;
  repayment.mode = input.mode;
  repayment.receiptNo = `RCPT${String(Date.now()).slice(-6)}`;

  loan.outstanding = round2(Math.max(0, loan.outstanding - repayment.principalComponent));
  loan.paidAmount = round2(loan.paidAmount + repayment.amount);

  const remainingOverdue = store.repayments
    .filter((item) => item.loanAccountId === loan.id && item.status === "OVERDUE")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const nextPending = store.repayments
    .filter((item) => item.loanAccountId === loan.id && item.status === "PENDING")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  let loanClosed = false;
  if (loan.outstanding <= 0) {
    loan.status = "CLOSED";
    loan.dpd = 0;
    loanClosed = true;

    const application = store.applications.find((item) => item.id === loan.applicationId);
    if (application && application.status !== "CLOSED") {
      application.status = "CLOSED";
      application.updatedAt = nowIso;
      application.activities.push({
        id: makeId("act"),
        at: nowIso,
        actorId: user.id,
        type: "LOAN_CLOSED",
        summary: `Loan ${loan.ref} fully settled. Application closed (DEMO).`,
      });
      appendAudit(
        store,
        user.id,
        "LOAN_CLOSED",
        "LOAN",
        loan.id,
        `Loan ${loan.ref} fully settled; application ${application.ref} closed.`,
      );
    }
  } else if (remainingOverdue.length === 0) {    loan.status = "ACTIVE";
    loan.dpd = 0;
  } else {
    loan.status = "OVERDUE";
    loan.dpd = daysLate(remainingOverdue[0].dueDate);
  }
  if (nextPending) {
    loan.nextDueDate = nextPending.dueDate;
  } else if (remainingOverdue.length > 0) {
    loan.nextDueDate = remainingOverdue[0].dueDate;
  }

  const collectionCase =
    store.collectionCases.find(
      (item) => item.loanAccountId === loan.id && item.status !== "RESOLVED",
    ) ?? null;

  let caseResolved = false;
  if (collectionCase) {
    collectionCase.overdueAmount = round2(
      remainingOverdue.reduce((total, item) => total + item.amount + item.penalty, 0),
    );
    collectionCase.daysPastDue = remainingOverdue.length ? daysLate(remainingOverdue[0].dueDate) : 0;
    addActivity(
      collectionCase,
      user.id,
      "REPAYMENT_RECORDED",
      `${repayment.ref} settled via ${input.mode} — ${formatINR(repayment.amount)} (DEMO receipt ${repayment.receiptNo}).`,
    );
    if (remainingOverdue.length === 0) {
      collectionCase.status = "RESOLVED";
      collectionCase.recoveryStage = "Resolved — schedule settled";
      collectionCase.ptpAmount = null;
      collectionCase.ptpDate = null;
      addActivity(
        collectionCase,
        user.id,
        "CASE_RESOLVED",
        "Case resolved — no overdue instalments remain on the account.",
      );
      caseResolved = true;
    }
  }

  appendAudit(
    store,
    user.id,
    "PAYMENT_RECORDED",
    "Repayment",
    repayment.id,
    `Settled ${repayment.ref} for ${loan.ref} via ${input.mode} (DEMO). Outstanding now ${formatINR(loan.outstanding)}.`,
  );

  return {
    repayment,
    loan,
    collectionCase,
    message: loanClosed
      ? "Repayment recorded. Loan account is fully settled and closed (DEMO)."
      : caseResolved
        ? "Repayment recorded. No overdue instalments remain — case resolved."
        : "Repayment recorded. Overdue position updated.",
  };
}
