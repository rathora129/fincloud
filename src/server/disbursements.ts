import type {
  Customer,
  Disbursement,
  DisbursementStatus,
  ID,
  LoanAccount,
  LoanApplication,
  Repayment,
  Sanction,
  Scope,
  SessionUser,
} from "@/lib/types";
import type { DisbursementCreateInput } from "@/lib/validation/disbursements";
import { ApiError, assertBranchScope, assertRecordPermission, canViewRecord, inScope } from "./access";
import { appendAudit, getStore, makeId, nextSequence } from "./store";
import { inDateRange, sortBy } from "./query";

export type DisbursementTabKey = "new" | "in_process" | "recommended" | "pending" | "rejected" | "completed";

export const DISBURSEMENT_TABS: { key: DisbursementTabKey; label: string; statuses: DisbursementStatus[] }[] = [
  { key: "new", label: "New", statuses: ["NEW"] },
  { key: "in_process", label: "In process", statuses: ["IN_PROCESS"] },
  { key: "recommended", label: "Recommended", statuses: ["RECOMMENDED"] },
  { key: "pending", label: "Pending", statuses: ["PENDING"] },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"] },
  { key: "completed", label: "Completed", statuses: ["COMPLETED"] },
];

export function parseDisbursementTab(value: string | undefined): DisbursementTabKey {
  return DISBURSEMENT_TABS.some((tab) => tab.key === value) ? (value as DisbursementTabKey) : "new";
}

export type DisbursementFilters = {
  branchId?: string;
  ownerId?: string;
  product?: string;
  mode?: string;
  from?: string;
  to?: string;
};

export type DisbursementRow = {
  id: ID;
  ref: string;
  customerId: ID;
  customerName: string;
  applicationId: ID;
  applicationRef: string;
  product: LoanApplication["product"];
  amount: number;
  mode: Disbursement["mode"];
  status: DisbursementStatus;
  requestedAt: string;
  processedAt: string | null;
  processedByName: string | null;
  bankRef: string | null;
  branchName: string;
};

export type DisbursementCounts = Record<DisbursementTabKey, number>;

export type DisbursementSummary = {
  counts: DisbursementCounts;
  pipelineValue: number;
  completedValue: number;
  completedLast30Days: number;
  awaitingApproval: number;
  rejectedCount: number;
};

function disbursementOwnerId(disbursement: Disbursement): string | undefined {
  return getStore().applications.find((application) => application.id === disbursement.applicationId)?.ownerId;
}

function sanctionOwnerId(sanction: Sanction): string | undefined {
  return getStore().applications.find((application) => application.id === sanction.applicationId)?.ownerId;
}

function disbursementVisible(scope: Scope, disbursement: Disbursement): boolean {
  return (
    inScope(scope, disbursement.branchId) &&
    canViewRecord(
      scope.user,
      "DISBURSEMENT",
      disbursement.id,
      "disbursements:view",
      disbursement.branchId,
      disbursementOwnerId(disbursement),
    )
  );
}

function scopedDisbursements(scope: Scope) {
  return getStore().disbursements.filter((disbursement) => disbursementVisible(scope, disbursement));
}

function matchesFilters(
  disbursement: Disbursement,
  application: LoanApplication | undefined,
  filters: DisbursementFilters,
) {
  if (filters.branchId && disbursement.branchId !== filters.branchId) return false;
  if (filters.ownerId && application?.ownerId !== filters.ownerId) return false;
  if (filters.product && application?.product !== filters.product) return false;
  if (filters.mode && disbursement.mode !== filters.mode) return false;
  if (filters.from || filters.to) {
    if (!inDateRange(disbursement.requestedAt, filters.from, filters.to)) return false;
  }
  return true;
}

export function getDisbursementCounts(scope: Scope): DisbursementCounts {
  const scoped = scopedDisbursements(scope);
  const counts = {
    new: 0,
    in_process: 0,
    recommended: 0,
    pending: 0,
    rejected: 0,
    completed: 0,
  } as DisbursementCounts;
  for (const tab of DISBURSEMENT_TABS) {
    counts[tab.key] = scoped.filter((disbursement) => tab.statuses.includes(disbursement.status)).length;
  }
  return counts;
}

export function getDisbursementSummary(scope: Scope): DisbursementSummary {
  const scoped = scopedDisbursements(scope);
  const completed = scoped.filter((disbursement) => disbursement.status === "COMPLETED");
  const inFlight = scoped.filter((disbursement) => !["COMPLETED", "REJECTED"].includes(disbursement.status));

  return {
    counts: getDisbursementCounts(scope),
    pipelineValue: inFlight.reduce((sum, disbursement) => sum + disbursement.amount, 0),
    completedValue: completed.reduce((sum, disbursement) => sum + disbursement.amount, 0),
    completedLast30Days: completed.filter(
      (disbursement) =>
        Boolean(disbursement.processedAt) &&
        new Date(disbursement.processedAt as string).getTime() > Date.now() - 30 * 86_400_000,
    ).length,
    awaitingApproval: scoped.filter((disbursement) => disbursement.status === "PENDING").length,
    rejectedCount: scoped.filter((disbursement) => disbursement.status === "REJECTED").length,
  };
}

export function getDisbursementQueue(scope: Scope, tab: DisbursementTabKey, filters: DisbursementFilters) {
  const store = getStore();
  const activeTab = parseDisbursementTab(tab);
  const statuses =
    DISBURSEMENT_TABS.find((item) => item.key === activeTab)?.statuses ?? DISBURSEMENT_TABS[0].statuses;
  const applicationById = new Map(store.applications.map((application) => [application.id, application]));
  const customerById = new Map(store.customers.map((customer) => [customer.id, customer]));
  const userById = new Map(store.users.map((user) => [user.id, user]));
  const branchById = new Map(store.branches.map((branch) => [branch.id, branch]));

  const rows: DisbursementRow[] = scopedDisbursements(scope)
    .filter((disbursement) => statuses.includes(disbursement.status))
    .filter((disbursement) => matchesFilters(disbursement, applicationById.get(disbursement.applicationId), filters))
    .map((disbursement) => {
      const application = applicationById.get(disbursement.applicationId);
      const customer = customerById.get(disbursement.customerId);
      const processor = disbursement.processedBy ? userById.get(disbursement.processedBy) : undefined;
      return {
        id: disbursement.id,
        ref: disbursement.ref,
        customerId: disbursement.customerId,
        customerName: customer?.name ?? "Unknown customer",
        applicationId: disbursement.applicationId,
        applicationRef: application?.ref ?? "—",
        product: application?.product ?? "PERSONAL",
        amount: disbursement.amount,
        mode: disbursement.mode,
        status: disbursement.status,
        requestedAt: disbursement.requestedAt,
        processedAt: disbursement.processedAt,
        processedByName: processor?.name ?? null,
        bankRef: disbursement.bankRef,
        branchName: branchById.get(disbursement.branchId)?.name ?? "—",
      };
    });

  const sorted = sortBy(rows, (row) => new Date(row.requestedAt).getTime(), "desc");
  return {
    tab: activeTab,
    counts: getDisbursementCounts(scope),
    rows: sorted,
    total: sorted.length,
    summary: getDisbursementSummary(scope),
  };
}

export type DisbursementTimelineEntry = {
  id: ID;
  at: string;
  type: string;
  summary: string;
  actorName: string;
  actorColor: string;
};

export type DisbursementDetail = {
  disbursement: Disbursement;
  sanction: Sanction | null;
  application: LoanApplication | null;
  customer: Customer | null;
  branchName: string;
  processedByName: string | null;
  processedByColor: string;
  timeline: DisbursementTimelineEntry[];
  loanAccount: LoanAccount | null;
  schedule: Repayment[];
  emiAmount: number;
  isCompleted: boolean;
};

export function amortisedEmi(principal: number, annualRate: number, tenureMonths: number) {
  const monthlyRate = annualRate / 12 / 100;
  if (!tenureMonths || principal <= 0) return 0;
  if (monthlyRate === 0) return Math.round(principal / tenureMonths);
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  return Math.round((principal * monthlyRate * factor) / (factor - 1));
}

export function getDisbursementDetail(scope: Scope, id: string): DisbursementDetail | null {
  const store = getStore();
  const disbursement = store.disbursements.find((item) => item.id === id);
  if (!disbursement || !disbursementVisible(scope, disbursement)) return null;

  const sanction = store.sanctions.find((item) => item.id === disbursement.sanctionId) ?? null;
  const application = store.applications.find((item) => item.id === disbursement.applicationId) ?? null;
  const customer = store.customers.find((item) => item.id === disbursement.customerId) ?? null;
  const userById = new Map(store.users.map((user) => [user.id, user]));
  const processor = disbursement.processedBy ? userById.get(disbursement.processedBy) : undefined;
  const loanAccount = store.loanAccounts.find((loan) => loan.disbursementId === disbursement.id) ?? null;
  const schedule = loanAccount
    ? sortBy(
        store.repayments.filter((repayment) => repayment.loanAccountId === loanAccount.id),
        (repayment) => new Date(repayment.dueDate).getTime(),
        "asc",
      )
    : [];

  const timeline: DisbursementTimelineEntry[] = [
    {
      id: `${disbursement.id}-requested`,
      at: disbursement.requestedAt,
      type: "DISBURSEMENT_REQUESTED",
      summary: `Disbursement ${disbursement.ref} requested for ₹${disbursement.amount.toLocaleString("en-IN")} via ${disbursement.mode}`,
      actorName: application ? (userById.get(application.ownerId)?.name ?? "System") : "System",
      actorColor: application ? (userById.get(application.ownerId)?.avatarColor ?? "#117a60") : "#8099a5",
    },
    ...disbursement.activities.map((activity) => {
      const actor = userById.get(activity.actorId);
      return {
        id: activity.id,
        at: activity.at,
        type: activity.type,
        summary: activity.summary,
        actorName: actor?.name ?? "System",
        actorColor: actor?.avatarColor ?? "#8099a5",
      };
    }),
    ...(disbursement.processedAt
      ? [
          {
            id: `${disbursement.id}-processed`,
            at: disbursement.processedAt,
            type: disbursement.status === "COMPLETED" ? "DISBURSEMENT_COMPLETED" : "DISBURSEMENT_UPDATED",
            summary:
              disbursement.status === "COMPLETED"
                ? `Marked completed in DEMO mode · bank ref ${disbursement.bankRef ?? "—"}`
                : "Disbursement record updated",
            actorName: processor?.name ?? "System",
            actorColor: processor?.avatarColor ?? "#117a60",
          },
        ]
      : []),
  ];

  const emiAmount = amortisedEmi(disbursement.amount, sanction?.interestRate ?? 0, sanction?.tenureMonths ?? 0);

  return {
    disbursement,
    sanction,
    application,
    customer,
    branchName: store.branches.find((branch) => branch.id === disbursement.branchId)?.name ?? "—",
    processedByName: processor?.name ?? null,
    processedByColor: processor?.avatarColor ?? "#117a60",
    timeline: sortBy(timeline, (entry) => new Date(entry.at).getTime(), "desc"),
    loanAccount,
    schedule,
    emiAmount,
    isCompleted: disbursement.status === "COMPLETED",
  };
}

export type DisbursementEligibleSanction = {
  id: ID;
  ref: string;
  applicationId: ID;
  applicationRef: string;
  customerId: ID;
  customerName: string;
  approvedAmount: number;
  interestRate: number;
  tenureMonths: number;
  disbursementMode: Sanction["disbursementMode"];
  decidedAt: string | null;
  branchId: ID;
  branchName: string;
  customerCity: string;
};

/** Approved sanctions that have no live (non-rejected) disbursement request yet. */
export function getDisbursementEligibleSanctions(scope: Scope): DisbursementEligibleSanction[] {
  const store = getStore();
  const applicationById = new Map(store.applications.map((application) => [application.id, application]));
  const customerById = new Map(store.customers.map((customer) => [customer.id, customer]));
  const branchById = new Map(store.branches.map((branch) => [branch.id, branch]));

  return store.sanctions
    .filter((sanction) => sanction.status === "APPROVED")
    .filter(
      (sanction) =>
        inScope(scope, sanction.branchId) &&
        canViewRecord(
          scope.user,
          "SANCTION",
          sanction.id,
          "disbursements:process",
          sanction.branchId,
          sanctionOwnerId(sanction),
        ) &&
        !store.disbursements.some(
          (disbursement) => disbursement.sanctionId === sanction.id && disbursement.status !== "REJECTED",
        ),
    )
    .sort((a, b) => new Date(b.decidedAt ?? b.requestedAt).getTime() - new Date(a.decidedAt ?? a.requestedAt).getTime())
    .map((sanction) => {
      const application = applicationById.get(sanction.applicationId);
      const customer = customerById.get(sanction.customerId);
      return {
        id: sanction.id,
        ref: sanction.ref,
        applicationId: sanction.applicationId,
        applicationRef: application?.ref ?? "—",
        customerId: sanction.customerId,
        customerName: customer?.name ?? "Unknown customer",
        approvedAmount: sanction.approvedAmount,
        interestRate: sanction.interestRate,
        tenureMonths: sanction.tenureMonths,
        disbursementMode: sanction.disbursementMode,
        decidedAt: sanction.decidedAt,
        branchId: sanction.branchId,
        branchName: branchById.get(sanction.branchId)?.name ?? "—",
        customerCity: customer?.city ?? "—",
      };
    });
}

export type CreateDisbursementResult = {
  id: ID;
  ref: string;
  status: DisbursementStatus;
  sanctionId: ID;
  applicationId: ID;
  amount: number;
  mode: Disbursement["mode"];
};

/**
 * Raises a disbursement request from an approved sanction. Requires disbursements:process
 * (enforced by the API) plus record-level visibility on the sanction. No money moves here;
 * the maker-checker steps run through applyDisbursementAction.
 */
export function createDisbursement(
  user: SessionUser,
  scope: Scope,
  input: DisbursementCreateInput,
): CreateDisbursementResult {
  const store = getStore();
  const sanction = store.sanctions.find((item) => item.id === input.sanctionId);
  if (!sanction) throw new ApiError(404, "NOT_FOUND", "Sanction not found.");

  assertBranchScope(scope, sanction.branchId);
  assertRecordPermission(
    user,
    "SANCTION",
    sanction.id,
    "disbursements:process",
    sanction.branchId,
    sanctionOwnerId(sanction),
  );

  if (sanction.status !== "APPROVED") {
    throw new ApiError(409, "INVALID_STATE", "Only approved sanctions can be disbursed.");
  }
  if (input.amount > sanction.approvedAmount) {
    throw new ApiError(
      422,
      "AMOUNT_EXCEEDS_SANCTION",
      `Disbursement amount cannot exceed the sanctioned ${sanction.approvedAmount.toLocaleString("en-IN")} INR.`,
    );
  }

  const liveDisbursement = store.disbursements.find(
    (disbursement) => disbursement.sanctionId === sanction.id && disbursement.status !== "REJECTED",
  );
  if (liveDisbursement) {
    throw new ApiError(409, "DISBURSEMENT_EXISTS", `Disbursement ${liveDisbursement.ref} already exists for this sanction.`);
  }

  const application = store.applications.find((item) => item.id === sanction.applicationId);
  const now = new Date().toISOString();
  const amount = Math.round(input.amount * 100) / 100;

  const disbursement: Disbursement = {
    id: makeId("dis"),
    ref: nextSequence("DIS", store.disbursements.map((item) => item.ref)),
    sanctionId: sanction.id,
    applicationId: sanction.applicationId,
    customerId: sanction.customerId,
    amount,
    mode: input.mode,
    status: "NEW",
    requestedAt: now,
    processedAt: null,
    processedBy: null,
    bankRef: null,
    remarks: input.remarks || "Disbursement request created from an approved sanction (DEMO, no bank transfer).",
    branchId: sanction.branchId,
    activities: [
      {
        id: makeId("act"),
        at: now,
        actorId: user.id,
        type: "DISBURSEMENT_REQUESTED",
        summary: `Disbursement request raised for ₹${amount.toLocaleString("en-IN")} via ${input.mode}.`,
      },
    ],
  };
  store.disbursements.push(disbursement);

  if (application) {
    application.activities.push({
      id: makeId("act"),
      at: now,
      actorId: user.id,
      type: "DISBURSEMENT_REQUESTED",
      summary: `Disbursement ${disbursement.ref} requested against sanction ${sanction.ref} (DEMO).`,
    });
    application.updatedAt = now;
  }

  appendAudit(
    store,
    user.id,
    "DISBURSEMENT_CREATED",
    "DISBURSEMENT",
    disbursement.id,
    `Raised ${disbursement.ref} for ₹${amount.toLocaleString("en-IN")} against ${sanction.ref}.`,
  );

  return {
    id: disbursement.id,
    ref: disbursement.ref,
    status: disbursement.status,
    sanctionId: sanction.id,
    applicationId: sanction.applicationId,
    amount: disbursement.amount,
    mode: disbursement.mode,
  };
}

export type DisbursementAction = "PROCESS" | "RECOMMEND" | "AUTHORIZE" | "COMPLETE" | "REJECT";

export type DisbursementActionInput = { action: DisbursementAction; remarks?: string };

export type DisbursementActionResult = {
  id: ID;
  ref: string;
  status: DisbursementStatus;
  bankRef: string | null;
  processedAt: string | null;
  loanAccountRef: string | null;
  applicationStatus: string | null;
  scheduleCount: number;
};

const MIN_REMARK = 4;

export function applyDisbursementAction(
  user: SessionUser,
  scope: Scope,
  id: string,
  input: DisbursementActionInput,
): DisbursementActionResult {
  const store = getStore();
  const disbursement = store.disbursements.find((item) => item.id === id);
  if (!disbursement) throw new ApiError(404, "NOT_FOUND", "Disbursement record not found.");
  assertBranchScope(scope, disbursement.branchId);
  const actionPermission = ["COMPLETE", "REJECT"].includes(input.action)
    ? "disbursements:approve"
    : "disbursements:process";
  assertRecordPermission(
    user,
    "DISBURSEMENT",
    disbursement.id,
    actionPermission,
    disbursement.branchId,
    disbursementOwnerId(disbursement),
  );

  const now = new Date().toISOString();
  const remarks = (input.remarks ?? "").trim();
  const application = store.applications.find((item) => item.id === disbursement.applicationId);
  let loanAccountRef: string | null = null;
  let scheduleCount = 0;

  if (input.action === "REJECT") {
    if (disbursement.status === "COMPLETED") {
      throw new ApiError(409, "ALREADY_COMPLETED", "A completed disbursement cannot be rejected.");
    }
    if (disbursement.status === "REJECTED") {
      throw new ApiError(409, "ALREADY_REJECTED", "This disbursement has already been rejected.");
    }
    if (remarks.length < MIN_REMARK) {
      throw new ApiError(422, "REMARKS_REQUIRED", "A rejection remark is required.");
    }
    disbursement.status = "REJECTED";
    disbursement.processedAt = now;
    disbursement.processedBy = user.id;
    disbursement.remarks = remarks;
    disbursement.activities.push({
      id: makeId("act"),
      at: now,
      actorId: user.id,
      type: "DISBURSEMENT_REJECTED",
      summary: `Disbursement rejected: ${remarks}`,
    });
    if (application && application.status === "DISBURSEMENT_PENDING") {
      application.status = "SANCTIONED";
      application.updatedAt = now;
    }
    appendAudit(store, user.id, "DISBURSEMENT_REJECTED", "DISBURSEMENT", disbursement.id, `Rejected ${disbursement.ref}: ${remarks}`);
    return {
      id: disbursement.id,
      ref: disbursement.ref,
      status: disbursement.status,
      bankRef: disbursement.bankRef,
      processedAt: disbursement.processedAt,
      loanAccountRef,
      applicationStatus: application?.status ?? null,
      scheduleCount,
    };
  }

  if (input.action === "PROCESS") {
    if (disbursement.status !== "NEW") {
      throw new ApiError(409, "INVALID_STATE", "Only new disbursements can be started.");
    }
    disbursement.status = "IN_PROCESS";
    disbursement.processedBy = user.id;
    disbursement.activities.push({
      id: makeId("act"),
      at: now,
      actorId: user.id,
      type: "DISBURSEMENT_IN_PROCESS",
      summary: "Disbursement processing started. No bank file generated (DEMO).",
    });
    appendAudit(store, user.id, "DISBURSEMENT_UPDATED", "DISBURSEMENT", disbursement.id, `Processing started for ${disbursement.ref}`);
  }

  if (input.action === "RECOMMEND") {
    if (disbursement.status !== "IN_PROCESS") {
      throw new ApiError(409, "INVALID_STATE", "Only in-process disbursements can be recommended.");
    }
    disbursement.status = "RECOMMENDED";
    disbursement.processedBy = user.id;
    disbursement.activities.push({
      id: makeId("act"),
      at: now,
      actorId: user.id,
      type: "DISBURSEMENT_RECOMMENDED",
      summary: "Disbursement recommended for authorization.",
    });
    appendAudit(store, user.id, "DISBURSEMENT_UPDATED", "DISBURSEMENT", disbursement.id, `Recommended ${disbursement.ref}`);
  }

  if (input.action === "AUTHORIZE") {
    if (disbursement.status !== "RECOMMENDED") {
      throw new ApiError(409, "INVALID_STATE", "Only recommended disbursements can be sent for authorization.");
    }
    disbursement.status = "PENDING";
    disbursement.processedBy = user.id;
    disbursement.activities.push({
      id: makeId("act"),
      at: now,
      actorId: user.id,
      type: "DISBURSEMENT_PENDING",
      summary: "Sent for authorization. Awaiting checker approval (DEMO).",
    });
    if (application && application.status === "SANCTIONED") {
      application.status = "DISBURSEMENT_PENDING";
      application.updatedAt = now;
    }
    appendAudit(store, user.id, "DISBURSEMENT_UPDATED", "DISBURSEMENT", disbursement.id, `Sent for authorization ${disbursement.ref}`);
  }

  if (input.action === "COMPLETE") {
    if (disbursement.status === "COMPLETED") {
      throw new ApiError(409, "ALREADY_COMPLETED", "This disbursement has already been completed.");
    }
    if (disbursement.status !== "PENDING") {
      throw new ApiError(409, "INVALID_STATE", "Only disbursements pending authorization can be completed.");
    }
    if (store.loanAccounts.some((loan) => loan.disbursementId === disbursement.id)) {
      throw new ApiError(409, "ALREADY_COMPLETED", "A loan account already exists for this disbursement.");
    }

    const sanction = store.sanctions.find((item) => item.id === disbursement.sanctionId) ?? null;
    const interestRate = sanction?.interestRate ?? application?.interestRate ?? 0;
    const tenureMonths = sanction?.tenureMonths ?? application?.tenureMonths ?? 12;
    const principal = disbursement.amount;
    const emi = amortisedEmi(principal, interestRate, tenureMonths);
    const loanRef = nextSequence("LAN", store.loanAccounts.map((loan) => loan.ref));
    const loanId = makeId("loan");
    const scheduleMonths = Math.min(12, Math.max(6, tenureMonths));
    const firstDue = new Date(now);
    firstDue.setMonth(firstDue.getMonth() + 1);

    disbursement.status = "COMPLETED";
    disbursement.processedAt = now;
    disbursement.processedBy = user.id;
    disbursement.bankRef = `DEMO${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    disbursement.remarks = "DEMO mode: no real bank transfer was executed.";

    const monthlyRate = interestRate / 12 / 100;
    let balance = principal;
    const repaymentBase = nextSequence("RCP", store.repayments.map((item) => item.ref));
    const repaymentPrefix = repaymentBase.slice(0, repaymentBase.lastIndexOf("-") + 1);
    const repaymentStart = Number(repaymentBase.slice(repaymentBase.lastIndexOf("-") + 1));
    for (let month = 0; month < scheduleMonths; month += 1) {
      const dueDate = new Date(firstDue);
      dueDate.setMonth(dueDate.getMonth() + month);
      const interestComponent = Math.round(balance * monthlyRate);
      const principalComponent = Math.max(0, Math.round(emi - interestComponent));
      balance = Math.max(0, balance - principalComponent);
      const repayment: Repayment = {
        id: makeId("rep"),
        ref: `${repaymentPrefix}${String(repaymentStart + month).padStart(4, "0")}`,
        loanAccountId: loanId,
        customerId: disbursement.customerId,
        dueDate: dueDate.toISOString(),
        paidDate: null,
        amount: emi,
        principalComponent,
        interestComponent,
        penalty: 0,
        status: "PENDING",
        mode: null,
        receiptNo: null,
      };
      store.repayments.push(repayment);
      scheduleCount += 1;
    }

    const loanAccount: LoanAccount = {
      id: loanId,
      ref: loanRef,
      applicationId: disbursement.applicationId,
      disbursementId: disbursement.id,
      customerId: disbursement.customerId,
      branchId: disbursement.branchId,
      principal,
      outstanding: principal,
      interestRate,
      tenureMonths,
      emiAmount: emi,
      disbursedAt: now,
      status: "ACTIVE",
      nextDueDate: firstDue.toISOString(),
      dpd: 0,
      paidAmount: 0,
      penaltyAccrued: 0,
    };
    store.loanAccounts.push(loanAccount);
    loanAccountRef = loanRef;

    if (application) {
      application.status = "DISBURSED";
      application.updatedAt = now;
      application.activities.push({
        id: makeId("act"),
        at: now,
        actorId: user.id,
        type: "DISBURSEMENT_COMPLETED",
        summary: `Disbursed ₹${principal.toLocaleString("en-IN")} in DEMO mode · loan ${loanRef}`,
      });
    }

    disbursement.activities.push({
      id: makeId("act"),
      at: now,
      actorId: user.id,
      type: "DISBURSEMENT_COMPLETED",
      summary: `Marked completed (DEMO). Loan account ${loanRef} created with ${scheduleCount} EMI entries.`,
    });
    appendAudit(
      store,
      user.id,
      "DISBURSEMENT_COMPLETED",
      "DISBURSEMENT",
      disbursement.id,
      `Completed ${disbursement.ref} (DEMO) · loan ${loanRef}`,
    );
  }

  return {
    id: disbursement.id,
    ref: disbursement.ref,
    status: disbursement.status,
    bankRef: disbursement.bankRef,
    processedAt: disbursement.processedAt,
    loanAccountRef,
    applicationStatus: application?.status ?? null,
    scheduleCount,
  };
}
