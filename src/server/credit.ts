import type {
  ApplicationStatus,
  Customer,
  ID,
  LoanApplication,
  LoanProduct,
  Scope,
  SanctionStatus,
  SessionUser,
} from "@/lib/types";
import { ApiError, assertBranchScope, inScope } from "./access";
import { getStore, makeId, appendAudit } from "./store";
import { inDateRange, sortBy } from "./query";

export type CreditTabKey = "pending" | "process" | "sent_back" | "decisions";

export const CREDIT_TABS: { key: CreditTabKey; label: string; statuses: ApplicationStatus[] }[] = [
  { key: "pending", label: "Pending review", statuses: ["RECOMMENDED"] },
  { key: "process", label: "In process", statuses: ["IN_PROCESS"] },
  { key: "sent_back", label: "Sent back", statuses: ["SENT_BACK"] },
  { key: "decisions", label: "Decisions", statuses: ["CREDIT_APPROVED", "CREDIT_REJECTED"] },
];

export function parseCreditTab(value: string | undefined): CreditTabKey {
  return CREDIT_TABS.some((tab) => tab.key === value) ? (value as CreditTabKey) : "pending";
}

export type CreditFilters = {
  branchId?: string;
  ownerId?: string;
  product?: string;
  from?: string;
  to?: string;
};

export type CreditRow = {
  id: ID;
  ref: string;
  customerId: ID;
  customerName: string;
  product: LoanProduct;
  requestedAmount: number;
  approvedAmount: number | null;
  tenureMonths: number;
  interestRate: number;
  riskBand: "LOW" | "MEDIUM" | "HIGH" | null;
  verificationLabel: string;
  documentsLabel: string;
  ownerName: string;
  creditOfficerName: string | null;
  status: ApplicationStatus;
  submittedAt: string | null;
  branchName: string;
};

export type CreditCounts = Record<CreditTabKey, number>;

export type CreditSummary = {
  counts: CreditCounts;
  pendingValue: number;
  approvedValue: number;
  rejectedValue: number;
  highRiskCount: number;
  avgTicket: number;
  decidedLast30Days: number;
};

function verificationLabel(verification: LoanApplication["verification"]) {
  const keys: Array<keyof LoanApplication["verification"]> = ["identity", "address", "employment", "income"];
  const verified = keys.filter((key) => verification[key] === "VERIFIED").length;
  const failed = keys.filter((key) => verification[key] === "FAILED").length;
  return failed > 0 ? `${verified}/4 verified · ${failed} failed` : `${verified}/4 verified`;
}

function documentLabel(documents: LoanApplication["documents"]) {
  if (!documents.length) return "No documents";
  const verified = documents.filter((doc) => doc.status === "VERIFIED").length;
  const rejected = documents.filter((doc) => doc.status === "REJECTED").length;
  return rejected > 0 ? `${verified}/${documents.length} · ${rejected} rejected` : `${verified}/${documents.length} verified`;
}

function statusesForTab(tab: CreditTabKey) {
  return CREDIT_TABS.find((item) => item.key === tab)?.statuses ?? CREDIT_TABS[0].statuses;
}

function scopedApplications(scope: Scope) {
  return getStore().applications.filter((application) => inScope(scope, application.branchId));
}

function matchesFilters(application: LoanApplication, filters: CreditFilters) {
  if (filters.branchId && application.branchId !== filters.branchId) return false;
  if (filters.ownerId && application.ownerId !== filters.ownerId) return false;
  if (filters.product && application.product !== filters.product) return false;
  if (filters.from || filters.to) {
    const stamp = application.submittedAt ?? application.createdAt;
    if (!inDateRange(stamp, filters.from, filters.to)) return false;
  }
  return true;
}

export function getCreditCounts(scope: Scope): CreditCounts {
  const scoped = scopedApplications(scope);
  const counts = { pending: 0, process: 0, sent_back: 0, decisions: 0 } as CreditCounts;
  for (const tab of CREDIT_TABS) {
    counts[tab.key] = scoped.filter((application) => tab.statuses.includes(application.status)).length;
  }
  return counts;
}

export function getCreditSummary(scope: Scope): CreditSummary {
  const scoped = scopedApplications(scope);
  const pending = scoped.filter((application) => application.status === "RECOMMENDED");
  const approved = scoped.filter(
    (application) =>
      application.status === "CREDIT_APPROVED" &&
      application.creditDecision &&
      new Date(application.creditDecision.decidedAt).getTime() > Date.now() - 30 * 86_400_000,
  );
  const rejected = scoped.filter(
    (application) =>
      application.status === "CREDIT_REJECTED" &&
      application.creditDecision &&
      new Date(application.creditDecision.decidedAt).getTime() > Date.now() - 30 * 86_400_000,
  );
  const decided = scoped.filter(
    (application) =>
      application.creditDecision &&
      ["CREDIT_APPROVED", "CREDIT_REJECTED"].includes(application.status) &&
      new Date(application.creditDecision.decidedAt).getTime() > Date.now() - 30 * 86_400_000,
  );

  return {
    counts: getCreditCounts(scope),
    pendingValue: pending.reduce((sum, application) => sum + application.requestedAmount, 0),
    approvedValue: approved.reduce(
      (sum, application) => sum + (application.creditDecision?.approvedAmount ?? application.requestedAmount),
      0,
    ),
    rejectedValue: rejected.reduce((sum, application) => sum + application.requestedAmount, 0),
    highRiskCount: pending.filter((application) => application.riskBand === "HIGH").length,
    avgTicket: pending.length ? Math.round(pending.reduce((sum, a) => sum + a.requestedAmount, 0) / pending.length) : 0,
    decidedLast30Days: decided.length,
  };
}

export function getCreditQueue(scope: Scope, tab: CreditTabKey, filters: CreditFilters) {
  const store = getStore();
  const activeTab = parseCreditTab(tab);
  const statuses = statusesForTab(activeTab);
  const customerById = new Map(store.customers.map((customer) => [customer.id, customer]));
  const userById = new Map(store.users.map((user) => [user.id, user]));
  const branchById = new Map(store.branches.map((branch) => [branch.id, branch]));

  const rows: CreditRow[] = scopedApplications(scope)
    .filter((application) => statuses.includes(application.status))
    .filter((application) => matchesFilters(application, filters))
    .map((application) => {
      const customer = customerById.get(application.customerId);
      const owner = userById.get(application.ownerId);
      const officer = application.creditOfficerId ? userById.get(application.creditOfficerId) : undefined;
      return {
        id: application.id,
        ref: application.ref,
        customerId: application.customerId,
        customerName: customer?.name ?? "Unknown customer",
        product: application.product,
        requestedAmount: application.requestedAmount,
        approvedAmount: application.creditDecision?.approvedAmount ?? null,
        tenureMonths: application.tenureMonths,
        interestRate: application.interestRate,
        riskBand: application.riskBand,
        verificationLabel: verificationLabel(application.verification),
        documentsLabel: documentLabel(application.documents),
        ownerName: owner?.name ?? "Unassigned",
        creditOfficerName: officer?.name ?? null,
        status: application.status,
        submittedAt: application.submittedAt ?? null,
        branchName: branchById.get(application.branchId)?.name ?? "—",
      };
    });

  const sorted = sortBy(rows, (row) => new Date(row.submittedAt ?? 0).getTime(), "desc");
  return {
    tab: activeTab,
    counts: getCreditCounts(scope),
    rows: sorted,
    total: sorted.length,
    summary: getCreditSummary(scope),
  };
}

export type TimelineEntry = {
  id: ID;
  at: string;
  type: string;
  summary: string;
  actorName: string;
  actorColor: string;
};

export type CreditDetail = {
  application: LoanApplication;
  customer: Customer;
  branchName: string;
  ownerName: string;
  ownerDesignation: string;
  creditOfficerName: string | null;
  decidedByName: string | null;
  decidedByColor: string;
  timeline: TimelineEntry[];
  estimatedEmi: number;
  foir: number;
  verifiedDocuments: number;
  rejectedDocuments: number;
  sanction: { id: ID; ref: string; status: SanctionStatus } | null;
};

export function calculateEmi(principal: number, annualRate: number, tenureMonths: number) {
  const monthlyRate = annualRate / 12 / 100;
  if (!tenureMonths || principal <= 0) return 0;
  if (monthlyRate === 0) return Math.round(principal / tenureMonths);
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  return Math.round((principal * monthlyRate * factor) / (factor - 1));
}

export function getCreditApplication(scope: Scope, id: string): CreditDetail | null {
  const store = getStore();
  const application = store.applications.find((item) => item.id === id);
  if (!application || !inScope(scope, application.branchId)) return null;
  const customer = store.customers.find((item) => item.id === application.customerId);
  if (!customer) return null;

  const userById = new Map(store.users.map((user) => [user.id, user]));
  const owner = userById.get(application.ownerId);
  const officer = application.creditOfficerId ? userById.get(application.creditOfficerId) : undefined;
  const decidedBy = application.creditDecision ? userById.get(application.creditDecision.decidedBy) : undefined;

  const estimatedEmi = calculateEmi(application.requestedAmount, application.interestRate, application.tenureMonths);
  const monthlyIncome = customer.monthlyIncome;
  const foir = monthlyIncome > 0 ? Math.round((estimatedEmi / monthlyIncome) * 1000) / 10 : 0;

  const timeline: TimelineEntry[] = [
    {
      id: `${application.id}-created`,
      at: application.createdAt,
      type: "APPLICATION_CREATED",
      summary: `Application ${application.ref} created`,
      actorName: owner?.name ?? "System",
      actorColor: owner?.avatarColor ?? "#117a60",
    },
    ...(application.submittedAt
      ? [
          {
            id: `${application.id}-submitted`,
            at: application.submittedAt,
            type: "APPLICATION_SUBMITTED",
            summary: "Application submitted for processing",
            actorName: owner?.name ?? "System",
            actorColor: owner?.avatarColor ?? "#117a60",
          },
        ]
      : []),
    ...application.activities.map((activity) => {
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
    ...(application.creditDecision
      ? [
          {
            id: application.creditDecision.id,
            at: application.creditDecision.decidedAt,
            type: "CREDIT_DECISION",
            summary: `Credit decision recorded: ${application.creditDecision.decision.replaceAll("_", " ")}`,
            actorName: decidedBy?.name ?? "Credit team",
            actorColor: decidedBy?.avatarColor ?? "#117a60",
          },
        ]
      : []),
  ];

  return {
    application,
    customer,
    branchName: store.branches.find((branch) => branch.id === application.branchId)?.name ?? "—",
    ownerName: owner?.name ?? "Unassigned",
    ownerDesignation: owner?.designation ?? "—",
    creditOfficerName: officer?.name ?? null,
    decidedByName: decidedBy?.name ?? null,
    decidedByColor: decidedBy?.avatarColor ?? "#117a60",
    timeline: sortBy(timeline, (entry) => new Date(entry.at).getTime(), "desc"),
    estimatedEmi,
    foir,
    verifiedDocuments: application.documents.filter((doc) => doc.status === "VERIFIED").length,
    rejectedDocuments: application.documents.filter((doc) => doc.status === "REJECTED").length,
    sanction: (() => {
      const linked = store.sanctions.find((sanction) => sanction.applicationId === application.id);
      return linked ? { id: linked.id, ref: linked.ref, status: linked.status } : null;
    })(),
  };
}

export type CreditDecisionInput = {
  decision: "APPROVE" | "REJECT" | "SEND_BACK";
  approvedAmount?: number;
  riskBand?: "LOW" | "MEDIUM" | "HIGH";
  remarks?: string;
};

export type CreditDecisionResult = {
  id: ID;
  ref: string;
  status: ApplicationStatus;
  decision: "APPROVE" | "REJECT" | "SEND_BACK";
  approvedAmount: number | null;
  riskBand: "LOW" | "MEDIUM" | "HIGH" | null;
  sentBackReason: string | null;
  decidedAt: string;
  decidedByName: string;
};

const MIN_REASON_LENGTH = 5;


export function applyCreditDecision(
  user: SessionUser,
  scope: Scope,
  id: string,
  input: CreditDecisionInput,
): CreditDecisionResult {
  const store = getStore();
  const application = store.applications.find((item) => item.id === id);
  if (!application) throw new ApiError(404, "NOT_FOUND", "Application not found.");
  assertBranchScope(scope, application.branchId);

  if (application.status !== "RECOMMENDED") {
    throw new ApiError(
      409,
      "INVALID_STATE",
      `A credit decision can only be recorded for applications pending review. Current status: ${application.status.replaceAll("_", " ").toLowerCase()}.`,
    );
  }

  const remarks = (input.remarks ?? "").trim();

  if (input.decision === "APPROVE") {
    const approvedAmount = input.approvedAmount;
    if (typeof approvedAmount !== "number" || !Number.isFinite(approvedAmount) || approvedAmount <= 0) {
      throw new ApiError(422, "INVALID_AMOUNT", "Approved amount must be greater than zero.");
    }
    if (approvedAmount > application.requestedAmount) {
      throw new ApiError(422, "INVALID_AMOUNT", "Approved amount cannot exceed the requested amount.");
    }
    if (!input.riskBand) {
      throw new ApiError(422, "RISK_BAND_REQUIRED", "Select a risk band before approving.");
    }
  }

  if (input.decision === "REJECT" && remarks.length < MIN_REASON_LENGTH) {
    throw new ApiError(422, "REMARKS_REQUIRED", "A rejection remark is required.");
  }

  if (input.decision === "SEND_BACK" && remarks.length < MIN_REASON_LENGTH) {
    throw new ApiError(422, "REASON_REQUIRED", "A send-back reason is required.");
  }

  if (input.decision === "APPROVE" && remarks.length < MIN_REASON_LENGTH) {
    throw new ApiError(422, "REMARKS_REQUIRED", "Add a short decision remark for the audit trail.");
  }

  const now = new Date().toISOString();
  const nextStatus: ApplicationStatus =
    input.decision === "APPROVE" ? "CREDIT_APPROVED" : input.decision === "REJECT" ? "CREDIT_REJECTED" : "SENT_BACK";
  const approvedAmount = input.decision === "APPROVE" ? (input.approvedAmount as number) : null;
  const riskBand = input.riskBand ?? application.riskBand ?? null;

  application.creditDecision = {
    id: makeId("cd"),
    decidedBy: user.id,
    decidedAt: now,
    decision: input.decision,
    approvedAmount,
    remarks,
  };
  application.status = nextStatus;
  application.creditOfficerId = user.id;
  application.riskBand = nextStatus === "SENT_BACK" ? application.riskBand : riskBand;
  application.sentBackReason = input.decision === "SEND_BACK" ? remarks : null;
  application.updatedAt = now;

  const summary =
    input.decision === "APPROVE"
      ? `Credit approved ${application.ref} for ₹${approvedAmount?.toLocaleString("en-IN")} (${riskBand} risk)`
      : input.decision === "REJECT"
        ? `Credit rejected ${application.ref}: ${remarks}`
        : `Application ${application.ref} sent back: ${remarks}`;

  application.activities.push({
    id: makeId("act"),
    at: now,
    actorId: user.id,
    type: input.decision === "APPROVE" ? "CREDIT_APPROVED" : input.decision === "REJECT" ? "CREDIT_REJECTED" : "SENT_BACK",
    summary,
  });

  appendAudit(store, user.id, "CREDIT_DECISION", "LOAN_APPLICATION", application.id, summary);

  return {
    id: application.id,
    ref: application.ref,
    status: application.status,
    decision: input.decision,
    approvedAmount,
    riskBand: application.riskBand,
    sentBackReason: application.sentBackReason,
    decidedAt: now,
    decidedByName: user.name,
  };
}
