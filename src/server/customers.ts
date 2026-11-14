import type {
  CollectionCase,
  Customer,
  Disbursement,
  ESignRequest,
  Grievance,
  Lead,
  LoanAccount,
  LoanApplication,
  LoanStatus,
  Repayment,
  Sanction,
  SessionUser,
  Store,
  Task,
} from "@/lib/types";
import { ApiError, assertBranchScope, buildScope, inScope } from "./access";
import { getStore } from "./store";
import { matchesText } from "./query";
import { formatINR } from "@/lib/utils";

const ACTIVE_LOAN_STATUSES: LoanStatus[] = ["ACTIVE", "OVERDUE"];

export type CustomerFilters = {
  tab?: string;
  q?: string;
  kyc?: string;
  branchId?: string;
  employmentType?: string;
};

export type CustomerListItem = {
  id: string;
  ref: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  employmentType: Customer["employmentType"];
  employer: string;
  monthlyIncome: number;
  kycStatus: Customer["kycStatus"];
  branchId: string;
  branchName: string;
  relationshipSince: string;
  applications: number;
  activeLoans: number;
  outstanding: number;
  lastActivityAt: string | null;
};

export type CustomerCounts = {
  all: number;
  verified: number;
  pending: number;
  rejected: number;
  withLoans: number;
};

export type CustomerPerson = { name: string; color: string };

export type CustomerDocumentRow = {
  id: string;
  applicationId: string;
  applicationRef: string;
  product: string;
  name: string;
  required: boolean;
  status: string;
  uploadedAt: string | null;
};

export type CustomerRemark = {
  id: string;
  at: string;
  author: string;
  source: string;
  ref: string;
  text: string;
};

export type CustomerTimelineEvent = {
  id: string;
  at: string;
  actor: string;
  type: string;
  summary: string;
  source: string;
  href: string | null;
};

export type CustomerSummary = {
  applications: number;
  approvedApplications: number;
  sanctionedAmount: number;
  disbursedAmount: number;
  activeLoans: number;
  outstanding: number;
  overdueAmount: number;
  collected: number;
  lastActivityAt: string | null;
  relationshipDays: number;
  risk: "HEALTHY" | "WATCH" | "STRESS";
};

export type CustomerDetailView = {
  customer: Customer;
  branchName: string;
  people: Record<string, CustomerPerson>;
  applications: LoanApplication[];
  sanctions: Sanction[];
  disbursements: Disbursement[];
  loans: LoanAccount[];
  repayments: Repayment[];
  collections: CollectionCase[];
  leads: Lead[];
  tasks: Task[];
  grievances: Grievance[];
  esign: ESignRequest[];
  documents: CustomerDocumentRow[];
  remarks: CustomerRemark[];
  timeline: CustomerTimelineEvent[];
  summary: CustomerSummary;
};

const TAB_MATCHERS: Record<string, (customer: Customer, store: Store) => boolean> = {
  all: () => true,
  verified: (customer) => customer.kycStatus === "VERIFIED",
  pending: (customer) => customer.kycStatus === "PENDING",
  rejected: (customer) => customer.kycStatus === "REJECTED",
  with_loans: (customer, store) =>
    store.loanAccounts.some((loan) => loan.customerId === customer.id && ACTIVE_LOAN_STATUSES.includes(loan.status)),
};

function timeOf(value: string | null | undefined) {
  return value ? new Date(value).getTime() : 0;
}

function latest(values: Array<string | null | undefined>) {
  let result: string | null = null;
  let stamp = 0;
  for (const value of values) {
    const time = timeOf(value);
    if (value && time > stamp) {
      stamp = time;
      result = value;
    }
  }
  return result;
}

function lastActivityFor(customer: Customer, store: Store) {
  const applications = store.applications.filter((application) => application.customerId === customer.id);
  const loans = store.loanAccounts.filter((loan) => loan.customerId === customer.id);
  const collections = store.collectionCases.filter((collection) => collection.customerId === customer.id);
  const repayments = store.repayments.filter((repayment) => repayment.customerId === customer.id);
  const grievances = store.grievances.filter((grievance) => grievance.customerId === customer.id);
  return latest([
    customer.relationshipSince,
    customer.createdAt,
    ...applications.map((application) => application.updatedAt),
    ...loans.map((loan) => loan.disbursedAt),
    ...repayments.map((repayment) => repayment.paidDate),
    ...collections.flatMap((collection) => [collection.lastContactAt, collection.createdAt]),
    ...grievances.map((grievance) => grievance.createdAt),
  ]);
}

function toListItem(customer: Customer, store: Store): CustomerListItem {
  const applications = store.applications.filter((application) => application.customerId === customer.id);
  const loans = store.loanAccounts.filter(
    (loan) => loan.customerId === customer.id && ACTIVE_LOAN_STATUSES.includes(loan.status),
  );
  return {
    id: customer.id,
    ref: customer.ref,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    city: customer.city,
    state: customer.state,
    employmentType: customer.employmentType,
    employer: customer.employer,
    monthlyIncome: customer.monthlyIncome,
    kycStatus: customer.kycStatus,
    branchId: customer.branchId,
    branchName: store.branches.find((branch) => branch.id === customer.branchId)?.name ?? "—",
    relationshipSince: customer.relationshipSince,
    applications: applications.length,
    activeLoans: loans.length,
    outstanding: loans.reduce((total, loan) => total + loan.outstanding, 0),
    lastActivityAt: lastActivityFor(customer, store),
  };
}

export function getCustomersWorkspace(user: SessionUser, filters: CustomerFilters) {
  const store = getStore();
  const scope = buildScope(user);
  const tab = filters.tab && TAB_MATCHERS[filters.tab] ? filters.tab : "all";

  const scoped = store.customers.filter((customer) => inScope(scope, customer.branchId));

  const counts: CustomerCounts = {
    all: scoped.length,
    verified: scoped.filter((customer) => TAB_MATCHERS.verified(customer, store)).length,
    pending: scoped.filter((customer) => TAB_MATCHERS.pending(customer, store)).length,
    rejected: scoped.filter((customer) => TAB_MATCHERS.rejected(customer, store)).length,
    withLoans: scoped.filter((customer) => TAB_MATCHERS.with_loans(customer, store)).length,
  };

  const filtered = scoped.filter((customer) => {
    if (!TAB_MATCHERS[tab](customer, store)) return false;
    if (filters.branchId && customer.branchId !== filters.branchId) return false;
    if (filters.kyc && customer.kycStatus !== filters.kyc) return false;
    if (filters.employmentType && customer.employmentType !== filters.employmentType) return false;
    return matchesText(filters.q, [
      customer.name,
      customer.ref,
      customer.phone,
      customer.email,
      customer.city,
      customer.state,
      customer.panMasked,
      customer.employer,
    ]);
  });

  const branches = store.branches
    .filter((branch) => inScope(scope, branch.id))
    .map((branch) => ({ id: branch.id, name: branch.name }));

  return {
    items: filtered
      .map((customer) => toListItem(customer, store))
      .sort((a, b) => a.name.localeCompare(b.name)),
    counts,
    branches,
  };
}

export function getCustomerDetail(user: SessionUser, customerId: string): CustomerDetailView {
  const store = getStore();
  const scope = buildScope(user);
  const customer = store.customers.find((item) => item.id === customerId);
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
  assertBranchScope(scope, customer.branchId);

  const applications = store.applications
    .filter((application) => application.customerId === customer.id)
    .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
  const sanctions = store.sanctions
    .filter((sanction) => sanction.customerId === customer.id)
    .sort((a, b) => timeOf(b.requestedAt) - timeOf(a.requestedAt));
  const disbursements = store.disbursements
    .filter((disbursement) => disbursement.customerId === customer.id)
    .sort((a, b) => timeOf(b.requestedAt) - timeOf(a.requestedAt));
  const loans = store.loanAccounts
    .filter((loan) => loan.customerId === customer.id)
    .sort((a, b) => timeOf(b.disbursedAt) - timeOf(a.disbursedAt));
  const repayments = store.repayments
    .filter((repayment) => repayment.customerId === customer.id)
    .sort((a, b) => timeOf(b.dueDate) - timeOf(a.dueDate));
  const collections = store.collectionCases
    .filter((collection) => collection.customerId === customer.id)
    .sort((a, b) => b.daysPastDue - a.daysPastDue);
  const grievances = store.grievances
    .filter((grievance) => grievance.customerId === customer.id)
    .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
  const esign = store.esign
    .filter((request) => request.customerId === customer.id)
    .sort((a, b) => timeOf(b.initiatedAt) - timeOf(a.initiatedAt));

  const applicationIds = new Set(applications.map((application) => application.id));
  const loanIds = new Set(loans.map((loan) => loan.id));
  const collectionIds = new Set(collections.map((collection) => collection.id));
  const grievanceIds = new Set(grievances.map((grievance) => grievance.id));

  const tasks = store.tasks
    .filter((task) => {
      if (!task.relatedId) return false;
      if (task.relatedType === "APPLICATION") return applicationIds.has(task.relatedId);
      if (task.relatedType === "LOAN") return loanIds.has(task.relatedId);
      if (task.relatedType === "COLLECTION") return collectionIds.has(task.relatedId);
      if (task.relatedType === "GRIEVANCE") return grievanceIds.has(task.relatedId);
      return false;
    })
    .sort((a, b) => timeOf(a.dueDate) - timeOf(b.dueDate));

  const people: Record<string, CustomerPerson> = {};
  for (const member of store.users) people[member.id] = { name: member.name, color: member.avatarColor };
  const actorName = (id: string | null | undefined) => (id ? people[id]?.name ?? "System" : "System");

  const documents: CustomerDocumentRow[] = applications.flatMap((application) =>
    application.documents.map((document) => ({
      id: document.id,
      applicationId: application.id,
      applicationRef: application.ref,
      product: application.product,
      name: document.name,
      required: document.required,
      status: document.status,
      uploadedAt: document.uploadedAt,
    })),
  );

  const remarks: CustomerRemark[] = [];
  for (const application of applications) {
    if (application.creditDecision) {
      remarks.push({
        id: `rem-${application.creditDecision.id}`,
        at: application.creditDecision.decidedAt,
        author: actorName(application.creditDecision.decidedBy),
        source: "Credit review",
        ref: application.ref,
        text: application.creditDecision.remarks,
      });
    }
    if (application.sentBackReason) {
      remarks.push({
        id: `rem-sb-${application.id}`,
        at: application.updatedAt,
        author: actorName(application.creditOfficerId),
        source: "Credit review",
        ref: application.ref,
        text: `Sent back: ${application.sentBackReason}`,
      });
    }
  }
  for (const sanction of sanctions) {
    remarks.push({
      id: `rem-${sanction.id}`,
      at: sanction.decidedAt ?? sanction.requestedAt,
      author: actorName(sanction.approvedBy),
      source: "Sanction",
      ref: sanction.ref,
      text: sanction.remarks,
    });
  }
  for (const disbursement of disbursements) {
    remarks.push({
      id: `rem-${disbursement.id}`,
      at: disbursement.processedAt ?? disbursement.requestedAt,
      author: actorName(disbursement.processedBy),
      source: "Disbursement",
      ref: disbursement.ref,
      text: disbursement.remarks,
    });
  }
  for (const collection of collections) {
    remarks.push({
      id: `rem-${collection.id}`,
      at: collection.lastContactAt ?? collection.createdAt,
      author: actorName(collection.assignedTo),
      source: "Collections",
      ref: collection.ref,
      text: `${collection.recoveryStage}. ${collection.ptpAmount ? `PTP of ${formatINR(collection.ptpAmount)} recorded.` : "No payment promise recorded."}`,
    });
  }
  for (const grievance of grievances) {
    remarks.push({
      id: `rem-${grievance.id}`,
      at: grievance.createdAt,
      author: "Support desk",
      source: "Grievance",
      ref: grievance.ref,
      text: grievance.description,
    });
  }
  remarks.sort((a, b) => timeOf(b.at) - timeOf(a.at));

  const leadIds = new Set(applications.map((application) => application.leadId).filter(Boolean) as string[]);
  const leads = store.leads.filter((lead) => leadIds.has(lead.id));

  const timeline: CustomerTimelineEvent[] = [
    {
      id: `tl-onboard-${customer.id}`,
      at: customer.relationshipSince,
      actor: "System",
      type: "ONBOARDED",
      summary: `Customer relationship opened at ${store.branches.find((branch) => branch.id === customer.branchId)?.name ?? "branch"}`,
      source: customer.ref,
      href: null,
    },
  ];

  for (const lead of leads) {
    for (const followUp of lead.followUps) {
      timeline.push({
        id: `tl-${followUp.id}`,
        at: followUp.at,
        actor: actorName(followUp.actorId),
        type: "LEAD_FOLLOW_UP",
        summary: `${followUp.channel.replaceAll("_", " ").toLowerCase()} · ${followUp.outcome.replaceAll("_", " ").toLowerCase()}${followUp.notes ? ` — ${followUp.notes}` : ""}`,
        source: `${lead.ref} · Lead`,
        href: `/leads/${lead.id}`,
      });
    }
  }
  for (const application of applications) {
    for (const activity of application.activities) {
      timeline.push({
        id: `tl-${activity.id}`,
        at: activity.at,
        actor: actorName(activity.actorId),
        type: activity.type,
        summary: activity.summary,
        source: application.ref,
        href: `/applications/${application.id}`,
      });
    }
  }
  for (const sanction of sanctions) {
    for (const activity of sanction.activities) {
      timeline.push({
        id: `tl-${activity.id}`,
        at: activity.at,
        actor: actorName(activity.actorId),
        type: activity.type,
        summary: activity.summary,
        source: sanction.ref,
        href: `/sanctions/${sanction.id}`,
      });
    }
  }
  for (const disbursement of disbursements) {
    for (const activity of disbursement.activities) {
      timeline.push({
        id: `tl-${activity.id}`,
        at: activity.at,
        actor: actorName(activity.actorId),
        type: activity.type,
        summary: activity.summary,
        source: disbursement.ref,
        href: `/disbursements/${disbursement.id}`,
      });
    }
  }
  for (const collection of collections) {
    for (const activity of collection.activities) {
      timeline.push({
        id: `tl-${activity.id}`,
        at: activity.at,
        actor: actorName(activity.actorId),
        type: activity.type,
        summary: activity.summary,
        source: collection.ref,
        href: `/collections/${collection.id}`,
      });
    }
  }
  for (const repayment of repayments) {
    if (repayment.status !== "PAID" || !repayment.paidDate) continue;
    timeline.push({
      id: `tl-${repayment.id}`,
      at: repayment.paidDate,
      actor: "System",
      type: "REPAYMENT_RECEIVED",
      summary: `EMI ${repayment.ref} received via ${repayment.mode ?? "DEMO"} · receipt ${repayment.receiptNo ?? "—"}`,
      source: "Repayment",
      href: null,
    });
  }
  for (const request of esign) {
    if (!request.initiatedAt) continue;
    timeline.push({
      id: `tl-${request.id}`,
      at: request.completedAt ?? request.initiatedAt,
      actor: "DEMO eSign",
      type: `ESIGN_${request.status}`,
      summary: `Agreement eSign ${request.status.replaceAll("_", " ").toLowerCase()} (synthetic provider)`,
      source: "eSign",
      href: null,
    });
  }
  timeline.sort((a, b) => timeOf(b.at) - timeOf(a.at));

  const activeLoans = loans.filter((loan) => ACTIVE_LOAN_STATUSES.includes(loan.status));
  const overdueRepayments = repayments.filter((repayment) => repayment.status === "OVERDUE");
  const openCollections = collections.filter((collection) => collection.status !== "RESOLVED");
  const writtenOff = loans.some((loan) => loan.status === "WRITTEN_OFF");
  const risk: CustomerSummary["risk"] = writtenOff
    ? "STRESS"
    : overdueRepayments.length > 0 || openCollections.length > 0
      ? "WATCH"
      : "HEALTHY";

  const summary: CustomerSummary = {
    applications: applications.length,
    approvedApplications: applications.filter((application) =>
      ["CREDIT_APPROVED", "SANCTIONED", "DISBURSEMENT_PENDING", "DISBURSED", "CLOSED"].includes(application.status),
    ).length,
    sanctionedAmount: sanctions
      .filter((sanction) => sanction.status === "APPROVED")
      .reduce((total, sanction) => total + sanction.approvedAmount, 0),
    disbursedAmount: disbursements
      .filter((disbursement) => disbursement.status === "COMPLETED")
      .reduce((total, disbursement) => total + disbursement.amount, 0),
    activeLoans: activeLoans.length,
    outstanding: activeLoans.reduce((total, loan) => total + loan.outstanding, 0),
    overdueAmount: overdueRepayments.reduce((total, repayment) => total + repayment.amount + repayment.penalty, 0),
    collected: repayments
      .filter((repayment) => repayment.status === "PAID")
      .reduce((total, repayment) => total + repayment.amount, 0),
    lastActivityAt: latest([
      customer.relationshipSince,
      ...applications.map((application) => application.updatedAt),
      ...loans.map((loan) => loan.disbursedAt),
      ...repayments.map((repayment) => repayment.paidDate),
      ...collections.flatMap((collection) => [collection.lastContactAt, collection.createdAt]),
      ...grievances.map((grievance) => grievance.createdAt),
    ]),
    relationshipDays: Math.max(
      0,
      Math.round((Date.now() - new Date(customer.relationshipSince).getTime()) / 86_400_000),
    ),
    risk,
  };

  return {
    customer,
    branchName: store.branches.find((branch) => branch.id === customer.branchId)?.name ?? "—",
    people,
    applications,
    sanctions,
    disbursements,
    loans,
    repayments,
    collections,
    leads,
    tasks,
    grievances,
    esign,
    documents,
    remarks,
    timeline,
    summary,
  };
}
