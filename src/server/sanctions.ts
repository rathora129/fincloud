import type { ID, LoanApplication, Sanction, SanctionStatus, Scope, SessionUser, Customer } from "@/lib/types";
import type { SanctionCreateInput } from "@/lib/validation/sanctions";
import { ApiError, assertBranchScope, assertRecordPermission, canViewRecord, inScope } from "./access";
import { appendAudit, getStore, makeId, nextSequence } from "./store";
import { inDateRange, sortBy } from "./query";

export type SanctionTabKey = "acceptance" | "processing" | "approved" | "rejected";

export const SANCTION_TABS: { key: SanctionTabKey; label: string; statuses: SanctionStatus[] }[] = [
  { key: "acceptance", label: "Acceptance pending", statuses: ["PENDING_ACCEPTANCE"] },
  { key: "processing", label: "Processing", statuses: ["PROCESSING"] },
  { key: "approved", label: "Approved", statuses: ["APPROVED"] },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"] },
];

export function parseSanctionTab(value: string | undefined): SanctionTabKey {
  return SANCTION_TABS.some((tab) => tab.key === value) ? (value as SanctionTabKey) : "acceptance";
}

export type SanctionFilters = {
  branchId?: string;
  ownerId?: string;
  product?: string;
  from?: string;
  to?: string;
};

export type SanctionRow = {
  id: ID;
  ref: string;
  applicationId: ID;
  applicationRef: string;
  customerId: ID;
  customerName: string;
  product: LoanApplication["product"];
  approvedAmount: number;
  interestRate: number;
  tenureMonths: number;
  status: SanctionStatus;
  requestedAt: string;
  decidedAt: string | null;
  approverName: string | null;
  disbursementMode: Sanction["disbursementMode"];
  branchName: string;
};

export type SanctionCounts = Record<SanctionTabKey, number>;

export type SanctionSummary = {
  counts: SanctionCounts;
  acceptanceValue: number;
  processingValue: number;
  approvedValue: number;
  rejectedCount: number;
  avgTicket: number;
  decidedLast30Days: number;
};

function sanctionOwnerId(sanction: Sanction): string | undefined {
  return getStore().applications.find((application) => application.id === sanction.applicationId)?.ownerId;
}

function sanctionVisible(scope: Scope, sanction: Sanction): boolean {
  return (
    inScope(scope, sanction.branchId) &&
    canViewRecord(scope.user, "SANCTION", sanction.id, "sanctions:view", sanction.branchId, sanctionOwnerId(sanction))
  );
}

function scopedSanctions(scope: Scope) {
  return getStore().sanctions.filter((sanction) => sanctionVisible(scope, sanction));
}

function matchesFilters(sanction: Sanction, application: LoanApplication | undefined, filters: SanctionFilters) {
  if (filters.branchId && sanction.branchId !== filters.branchId) return false;
  if (filters.ownerId && application?.ownerId !== filters.ownerId) return false;
  if (filters.product && application?.product !== filters.product) return false;
  if (filters.from || filters.to) {
    const stamp = sanction.requestedAt;
    if (!inDateRange(stamp, filters.from, filters.to)) return false;
  }
  return true;
}

export function getSanctionCounts(scope: Scope): SanctionCounts {
  const scoped = scopedSanctions(scope);
  const counts = { acceptance: 0, processing: 0, approved: 0, rejected: 0 } as SanctionCounts;
  for (const tab of SANCTION_TABS) {
    counts[tab.key] = scoped.filter((sanction) => tab.statuses.includes(sanction.status)).length;
  }
  return counts;
}

export function getSanctionSummary(scope: Scope): SanctionSummary {
  const scoped = scopedSanctions(scope);
  const byStatus = (status: SanctionStatus) => scoped.filter((sanction) => sanction.status === status);
  const acceptance = byStatus("PENDING_ACCEPTANCE");
  const processing = byStatus("PROCESSING");
  const approved = byStatus("APPROVED");
  const decidedRecent = scoped.filter(
    (sanction) =>
      Boolean(sanction.decidedAt) &&
      ["APPROVED", "REJECTED"].includes(sanction.status) &&
      new Date(sanction.decidedAt as string).getTime() > Date.now() - 30 * 86_400_000,
  );

  return {
    counts: getSanctionCounts(scope),
    acceptanceValue: acceptance.reduce((sum, sanction) => sum + sanction.approvedAmount, 0),
    processingValue: processing.reduce((sum, sanction) => sum + sanction.approvedAmount, 0),
    approvedValue: approved.reduce((sum, sanction) => sum + sanction.approvedAmount, 0),
    rejectedCount: byStatus("REJECTED").length,
    avgTicket: scoped.length
      ? Math.round(scoped.reduce((sum, sanction) => sum + sanction.approvedAmount, 0) / scoped.length)
      : 0,
    decidedLast30Days: decidedRecent.length,
  };
}

export function getSanctionQueue(scope: Scope, tab: SanctionTabKey, filters: SanctionFilters) {
  const store = getStore();
  const activeTab = parseSanctionTab(tab);
  const statuses = SANCTION_TABS.find((item) => item.key === activeTab)?.statuses ?? SANCTION_TABS[0].statuses;
  const applicationById = new Map(store.applications.map((application) => [application.id, application]));
  const customerById = new Map(store.customers.map((customer) => [customer.id, customer]));
  const userById = new Map(store.users.map((user) => [user.id, user]));
  const branchById = new Map(store.branches.map((branch) => [branch.id, branch]));

  const rows: SanctionRow[] = scopedSanctions(scope)
    .filter((sanction) => statuses.includes(sanction.status))
    .filter((sanction) => matchesFilters(sanction, applicationById.get(sanction.applicationId), filters))
    .map((sanction) => {
      const application = applicationById.get(sanction.applicationId);
      const customer = customerById.get(sanction.customerId);
      const approver = sanction.approvedBy ? userById.get(sanction.approvedBy) : undefined;
      return {
        id: sanction.id,
        ref: sanction.ref,
        applicationId: sanction.applicationId,
        applicationRef: application?.ref ?? "—",
        customerId: sanction.customerId,
        customerName: customer?.name ?? "Unknown customer",
        product: application?.product ?? "PERSONAL",
        approvedAmount: sanction.approvedAmount,
        interestRate: sanction.interestRate,
        tenureMonths: sanction.tenureMonths,
        status: sanction.status,
        requestedAt: sanction.requestedAt,
        decidedAt: sanction.decidedAt,
        approverName: approver?.name ?? null,
        disbursementMode: sanction.disbursementMode,
        branchName: branchById.get(sanction.branchId)?.name ?? "—",
      };
    });

  const sorted = sortBy(rows, (row) => new Date(row.requestedAt).getTime(), "desc");
  return {
    tab: activeTab,
    counts: getSanctionCounts(scope),
    rows: sorted,
    total: sorted.length,
    summary: getSanctionSummary(scope),
  };
}

export type SanctionTimelineEntry = {
  id: ID;
  at: string;
  type: string;
  summary: string;
  actorName: string;
  actorColor: string;
};

export type SanctionDetail = {
  sanction: Sanction;
  application: LoanApplication | null;
  customer: Customer | null;
  branchName: string;
  approverName: string | null;
  approverColor: string;
  requestedByName: string | null;
  timeline: SanctionTimelineEntry[];
  emiAmount: number;
  totalPayable: number;
  disbursementId: ID | null;
  disbursementStatus: string | null;
};

function amortisedEmi(principal: number, annualRate: number, tenureMonths: number) {
  const monthlyRate = annualRate / 12 / 100;
  if (!tenureMonths || principal <= 0) return 0;
  if (monthlyRate === 0) return Math.round(principal / tenureMonths);
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  return Math.round((principal * monthlyRate * factor) / (factor - 1));
}

export function getSanctionDetail(scope: Scope, id: string): SanctionDetail | null {
  const store = getStore();
  const sanction = store.sanctions.find((item) => item.id === id);
  if (!sanction || !sanctionVisible(scope, sanction)) return null;

  const application = store.applications.find((item) => item.id === sanction.applicationId) ?? null;
  const customer = store.customers.find((item) => item.id === sanction.customerId) ?? null;
  const userById = new Map(store.users.map((user) => [user.id, user]));
  const approver = sanction.approvedBy ? userById.get(sanction.approvedBy) : undefined;
  const requester = application ? userById.get(application.ownerId) : undefined;
  const disbursement = store.disbursements.find((item) => item.sanctionId === sanction.id) ?? null;

  const timeline: SanctionTimelineEntry[] = [
    {
      id: `${sanction.id}-requested`,
      at: sanction.requestedAt,
      type: "SANCTION_REQUESTED",
      summary: `Sanction ${sanction.ref} raised for ${sanction.approvedAmount.toLocaleString("en-IN")} INR`,
      actorName: requester?.name ?? "System",
      actorColor: requester?.avatarColor ?? "#117a60",
    },
    ...sanction.activities.map((activity) => {
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
    ...(sanction.decidedAt
      ? [
          {
            id: `${sanction.id}-decided`,
            at: sanction.decidedAt,
            type: sanction.status === "REJECTED" ? "SANCTION_REJECTED" : "SANCTION_APPROVED",
            summary:
              sanction.status === "REJECTED"
                ? `Sanction rejected: ${sanction.remarks}`
                : `Sanction ${sanction.status === "APPROVED" ? "approved" : "processed"}`,
            actorName: approver?.name ?? "System",
            actorColor: approver?.avatarColor ?? "#117a60",
          },
        ]
      : []),
  ];

  const emiAmount = amortisedEmi(sanction.approvedAmount, sanction.interestRate, sanction.tenureMonths);

  return {
    sanction,
    application,
    customer,
    branchName: store.branches.find((branch) => branch.id === sanction.branchId)?.name ?? "—",
    approverName: approver?.name ?? null,
    approverColor: approver?.avatarColor ?? "#117a60",
    requestedByName: requester?.name ?? null,
    timeline: sortBy(timeline, (entry) => new Date(entry.at).getTime(), "desc"),
    emiAmount,
    totalPayable: emiAmount * sanction.tenureMonths,
    disbursementId: disbursement?.id ?? null,
    disbursementStatus: disbursement?.status ?? null,
  };
}

export type SanctionEligibleApplication = {
  id: ID;
  ref: string;
  customerId: ID;
  customerName: string;
  product: LoanApplication["product"];
  requestedAmount: number;
  creditApprovedAmount: number;
  interestRate: number;
  tenureMonths: number;
  riskBand: LoanApplication["riskBand"];
  branchId: ID;
  branchName: string;
  ownerName: string;
  creditDecidedAt: string | null;
  suggestedProcessingFee: number;
};

/** Credit-approved applications that do not already carry a live (non-rejected) sanction. */
export function getSanctionEligibleApplications(scope: Scope): SanctionEligibleApplication[] {
  const store = getStore();
  const customerById = new Map(store.customers.map((customer) => [customer.id, customer]));
  const userById = new Map(store.users.map((user) => [user.id, user]));
  const branchById = new Map(store.branches.map((branch) => [branch.id, branch]));

  return store.applications
    .filter(
      (application) =>
        application.status === "CREDIT_APPROVED" &&
        application.creditDecision?.decision === "APPROVE" &&
        (application.creditDecision.approvedAmount ?? 0) > 0,
    )
    .filter(
      (application) =>
        inScope(scope, application.branchId) &&
        canViewRecord(
          scope.user,
          "APPLICATION",
          application.id,
          "sanctions:view",
          application.branchId,
          application.ownerId,
        ) &&
        !store.sanctions.some(
          (sanction) => sanction.applicationId === application.id && sanction.status !== "REJECTED",
        ),
    )
    .sort(
      (a, b) =>
        new Date(b.creditDecision?.decidedAt ?? b.updatedAt).getTime() -
        new Date(a.creditDecision?.decidedAt ?? a.updatedAt).getTime(),
    )
    .map((application) => {
      const approvedAmount = application.creditDecision?.approvedAmount ?? 0;
      return {
        id: application.id,
        ref: application.ref,
        customerId: application.customerId,
        customerName: customerById.get(application.customerId)?.name ?? "Unknown customer",
        product: application.product,
        requestedAmount: application.requestedAmount,
        creditApprovedAmount: approvedAmount,
        interestRate: application.interestRate,
        tenureMonths: application.tenureMonths,
        riskBand: application.riskBand,
        branchId: application.branchId,
        branchName: branchById.get(application.branchId)?.name ?? "—",
        ownerName: userById.get(application.ownerId)?.name ?? "—",
        creditDecidedAt: application.creditDecision?.decidedAt ?? null,
        suggestedProcessingFee: Math.round(approvedAmount * 0.015),
      };
    });
}

export type CreateSanctionResult = {
  id: ID;
  ref: string;
  status: SanctionStatus;
  applicationId: ID;
  applicationRef: string;
  approvedAmount: number;
  interestRate: number;
  tenureMonths: number;
};

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Raises a sanction offer from a credit-approved application. Requires sanctions:decide
 * (enforced by the API) plus record-level visibility on the application — no new
 * permission was introduced for creation.
 */
export function createSanction(user: SessionUser, scope: Scope, input: SanctionCreateInput): CreateSanctionResult {
  const store = getStore();
  const application = store.applications.find((item) => item.id === input.applicationId);
  if (!application) throw new ApiError(404, "NOT_FOUND", "Application not found.");

  assertBranchScope(scope, application.branchId);
  assertRecordPermission(
    user,
    "APPLICATION",
    application.id,
    "sanctions:view",
    application.branchId,
    application.ownerId,
  );

  if (application.status !== "CREDIT_APPROVED" || application.creditDecision?.decision !== "APPROVE") {
    throw new ApiError(409, "INVALID_STATE", "Only credit-approved applications can be sanctioned.");
  }

  const creditApprovedAmount = application.creditDecision.approvedAmount ?? 0;
  if (creditApprovedAmount <= 0) {
    throw new ApiError(409, "INVALID_STATE", "The credit decision does not carry an approved amount.");
  }
  if (input.approvedAmount > creditApprovedAmount) {
    throw new ApiError(
      422,
      "AMOUNT_EXCEEDS_APPROVAL",
      `Sanction amount cannot exceed the credit-approved ${creditApprovedAmount.toLocaleString("en-IN")} INR.`,
    );
  }

  const liveSanction = store.sanctions.find(
    (sanction) => sanction.applicationId === application.id && sanction.status !== "REJECTED",
  );
  if (liveSanction) {
    throw new ApiError(409, "SANCTION_EXISTS", `Sanction ${liveSanction.ref} already exists for this application.`);
  }

  const now = new Date().toISOString();
  const approvedAmount = roundAmount(input.approvedAmount);
  const processingFee = roundAmount(input.processingFee ?? approvedAmount * 0.015);
  const ref = nextSequence("SAN", store.sanctions.map((sanction) => sanction.ref));

  const sanction: Sanction = {
    id: makeId("san"),
    ref,
    applicationId: application.id,
    customerId: application.customerId,
    approvedAmount,
    interestRate: roundAmount(input.interestRate),
    tenureMonths: input.tenureMonths,
    processingFee,
    status: "PENDING_ACCEPTANCE",
    requestedAt: now,
    decidedAt: null,
    approvedBy: null,
    remarks: input.remarks || "Sanction offer raised from a credit-approved application (DEMO).",
    disbursementMode: input.disbursementMode,
    branchId: application.branchId,
    activities: [
      {
        id: makeId("act"),
        at: now,
        actorId: user.id,
        type: "SANCTION_CREATED",
        summary: `Sanction offer raised for ₹${approvedAmount.toLocaleString("en-IN")} at ${roundAmount(input.interestRate)}% for ${input.tenureMonths} months.`,
      },
    ],
  };
  store.sanctions.push(sanction);

  application.activities.push({
    id: makeId("act"),
    at: now,
    actorId: user.id,
    type: "SANCTION_RAISED",
    summary: `Sanction ${ref} raised from the credit-approved offer.`,
  });
  application.updatedAt = now;

  appendAudit(
    store,
    user.id,
    "SANCTION_CREATED",
    "SANCTION",
    sanction.id,
    `Raised ${ref} for ₹${approvedAmount.toLocaleString("en-IN")} on ${application.ref}.`,
  );

  return {
    id: sanction.id,
    ref: sanction.ref,
    status: sanction.status,
    applicationId: application.id,
    applicationRef: application.ref,
    approvedAmount: sanction.approvedAmount,
    interestRate: sanction.interestRate,
    tenureMonths: sanction.tenureMonths,
  };
}

export type SanctionAction = "ACCEPT" | "APPROVE" | "REJECT";

export type SanctionActionInput = { action: SanctionAction; remarks?: string };

export type SanctionActionResult = {
  id: ID;
  ref: string;
  status: SanctionStatus;
  decidedAt: string | null;
  approvedByName: string | null;
  applicationStatus: string | null;
};

const MIN_REMARK = 4;

export function applySanctionAction(
  user: SessionUser,
  scope: Scope,
  id: string,
  input: SanctionActionInput,
): SanctionActionResult {
  const store = getStore();
  const sanction = store.sanctions.find((item) => item.id === id);
  if (!sanction) throw new ApiError(404, "NOT_FOUND", "Sanction record not found.");
  assertBranchScope(scope, sanction.branchId);
  assertRecordPermission(
    user,
    "SANCTION",
    sanction.id,
    "sanctions:decide",
    sanction.branchId,
    sanctionOwnerId(sanction),
  );

  const remarks = (input.remarks ?? "").trim();
  const now = new Date().toISOString();
  const application = store.applications.find((item) => item.id === sanction.applicationId);

  if (input.action === "ACCEPT") {
    if (sanction.status !== "PENDING_ACCEPTANCE") {
      throw new ApiError(409, "INVALID_STATE", "Customer acceptance can only be recorded while acceptance is pending.");
    }
    sanction.status = "PROCESSING";
    sanction.remarks = remarks || "Customer accepted sanction terms in DEMO mode.";
    sanction.activities.push({
      id: makeId("act"),
      at: now,
      actorId: user.id,
      type: "SANCTION_ACCEPTED",
      summary: "Customer acceptance recorded (DEMO, no e-signature integration).",
    });
    appendAudit(store, user.id, "SANCTION_ACCEPTED", "SANCTION", sanction.id, `Acceptance recorded for ${sanction.ref}`);
  }

  if (input.action === "APPROVE") {
    if (!["PENDING_ACCEPTANCE", "PROCESSING"].includes(sanction.status)) {
      throw new ApiError(409, "INVALID_STATE", "Only sanctions pending acceptance or processing can be approved.");
    }
    sanction.status = "APPROVED";
    sanction.decidedAt = now;
    sanction.approvedBy = user.id;
    sanction.remarks = remarks || sanction.remarks || "Sanction approved per credit terms.";
    sanction.activities.push({
      id: makeId("act"),
      at: now,
      actorId: user.id,
      type: "SANCTION_APPROVED",
      summary: `Sanction approved for ₹${sanction.approvedAmount.toLocaleString("en-IN")} at ${sanction.interestRate}% p.a.`,
    });
    if (application && ["CREDIT_APPROVED", "SANCTIONED"].includes(application.status)) {
      application.status = "SANCTIONED";
      application.updatedAt = now;
    }
    appendAudit(store, user.id, "SANCTION_APPROVED", "SANCTION", sanction.id, `Approved ${sanction.ref}`);
  }

  if (input.action === "REJECT") {
    if (sanction.status === "APPROVED") {
      throw new ApiError(409, "INVALID_STATE", "An approved sanction cannot be rejected.");
    }
    if (sanction.status === "REJECTED") {
      throw new ApiError(409, "ALREADY_REJECTED", "This sanction has already been rejected.");
    }
    if (remarks.length < MIN_REMARK) {
      throw new ApiError(422, "REMARKS_REQUIRED", "A rejection remark is required.");
    }
    sanction.status = "REJECTED";
    sanction.decidedAt = now;
    sanction.approvedBy = user.id;
    sanction.remarks = remarks;
    sanction.activities.push({
      id: makeId("act"),
      at: now,
      actorId: user.id,
      type: "SANCTION_REJECTED",
      summary: `Sanction rejected: ${remarks}`,
    });
    appendAudit(store, user.id, "SANCTION_REJECTED", "SANCTION", sanction.id, `Rejected ${sanction.ref}: ${remarks}`);
  }

  return {
    id: sanction.id,
    ref: sanction.ref,
    status: sanction.status,
    decidedAt: sanction.decidedAt,
    approvedByName: sanction.approvedBy ? user.name : null,
    applicationStatus: application?.status ?? null,
  };
}
