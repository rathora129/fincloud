import type {
  Activity,
  ApplicationStatus,
  Customer,
  DocumentCheck,
  LoanApplication,
  LoanProduct,
  Scope,
  SessionUser,
  VerificationStatus,
} from "@/lib/types";
import { ApiError, assertBranchScope, assertPermission, buildScope, inScope } from "./access";
import { appendAudit, getStore, makeId, nextSequence } from "./store";
import { inDateRange, matchesText, sortBy } from "./query";
import { PRODUCT_RATES } from "@/lib/lead-flow";

export type ApplicationFilters = {
  tab?: string;
  q?: string;
  status?: string;
  product?: string;
  ownerId?: string;
  branchId?: string;
  from?: string;
  to?: string;
};

export type ApplicationListItem = {
  id: string;
  ref: string;
  customerId: string;
  customerName: string;
  customerRef: string;
  product: LoanProduct;
  requestedAmount: number;
  tenureMonths: number;
  interestRate: number;
  status: ApplicationStatus;
  branchId: string;
  branchName: string;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  creditOfficerName: string | null;
  isAuto: boolean;
  riskBand: LoanApplication["riskBand"];
  submittedAt: string | null;
  createdAt: string;
  requiredDocs: number;
  verifiedDocs: number;
  verificationReady: boolean;
};

export type ApplicationCounts = {
  all: number;
  new: number;
  auto: number;
  inProcess: number;
  recommended: number;
  sentBack: number;
};

export type ApplicationOptions = {
  owners: { id: string; name: string; branchId: string; color: string; role: string }[];
  creditOfficers: { id: string; name: string; branchId: string }[];
  branches: { id: string; name: string }[];
  customers: { id: string; name: string; ref: string; city: string; branchId: string }[];
  currentUserId: string;
  canManage: boolean;
};

export type ApplicationDetailView = {
  application: LoanApplication;
  customer: Customer;
  ownerName: string;
  ownerColor: string;
  branchName: string;
  creditOfficerName: string | null;
  leadRef: string | null;
  decisionByName: string | null;
  sanction: { id: string; ref: string; status: string; approvedAmount: number } | null;
  disbursement: { id: string; ref: string; status: string; amount: number } | null;
  loanAccount: { id: string; ref: string; status: string; outstanding: number; emiAmount: number } | null;
  tasks: { id: string; ref: string; title: string; status: string; dueDate: string }[];
  activities: (Activity & { actorName: string })[];
};

const TAB_MATCHERS: Record<string, (application: LoanApplication) => boolean> = {
  all: () => true,
  new: (application) => application.status === "NEW",
  auto: (application) => application.isAuto,
  in_process: (application) => application.status === "IN_PROCESS",
  recommended: (application) => application.status === "RECOMMENDED",
  send_back: (application) => application.status === "SENT_BACK",
};

const EDITABLE_STATUSES: ApplicationStatus[] = ["NEW", "IN_PROCESS", "SENT_BACK"];
const DOC_WORKABLE_STATUSES: ApplicationStatus[] = ["NEW", "IN_PROCESS", "SENT_BACK"];

function docSummary(application: LoanApplication) {
  const required = application.documents.filter((doc) => doc.required);
  return {
    requiredDocs: required.length,
    verifiedDocs: required.filter((doc) => doc.status === "VERIFIED").length,
    verificationReady: Object.values(application.verification).every((value) => value === "VERIFIED"),
  };
}

function actorName(id: string | null | undefined) {
  if (!id) return null;
  return getStore().users.find((user) => user.id === id)?.name ?? null;
}

function toListItem(scope: Scope, application: LoanApplication): ApplicationListItem {
  const store = getStore();
  const customer = store.customers.find((item) => item.id === application.customerId);
  const owner = store.users.find((item) => item.id === application.ownerId);
  const creditOfficer = application.creditOfficerId
    ? store.users.find((item) => item.id === application.creditOfficerId)
    : null;
  const branchName = store.branches.find((item) => item.id === application.branchId)?.name ?? "—";
  return {
    id: application.id,
    ref: application.ref,
    customerId: application.customerId,
    customerName: customer?.name ?? "Unknown customer",
    customerRef: customer?.ref ?? "—",
    product: application.product,
    requestedAmount: application.requestedAmount,
    tenureMonths: application.tenureMonths,
    interestRate: application.interestRate,
    status: application.status,
    branchId: application.branchId,
    branchName,
    ownerId: application.ownerId,
    ownerName: owner?.name ?? "Unassigned",
    ownerColor: owner?.avatarColor ?? "#117a60",
    creditOfficerName: creditOfficer?.name ?? null,
    isAuto: application.isAuto,
    riskBand: application.riskBand,
    submittedAt: application.submittedAt,
    createdAt: application.createdAt,
    ...docSummary(application),
  };
}

export function getApplicationsWorkspace(user: SessionUser, filters: ApplicationFilters) {
  const store = getStore();
  const scope = buildScope(user);
  const tab = filters.tab && TAB_MATCHERS[filters.tab] ? filters.tab : "all";

  const scoped = store.applications.filter(
    (application) =>
      inScope(scope, application.branchId) && (!filters.ownerId || application.ownerId === filters.ownerId),
  );

  const counts: ApplicationCounts = {
    all: scoped.length,
    new: scoped.filter(TAB_MATCHERS.new).length,
    auto: scoped.filter(TAB_MATCHERS.auto).length,
    inProcess: scoped.filter(TAB_MATCHERS.in_process).length,
    recommended: scoped.filter(TAB_MATCHERS.recommended).length,
    sentBack: scoped.filter(TAB_MATCHERS.send_back).length,
  };

  const filtered = scoped.filter((application) => {
    if (!TAB_MATCHERS[tab](application)) return false;
    if (filters.branchId && application.branchId !== filters.branchId) return false;
    if (filters.status && application.status !== filters.status) return false;
    if (filters.product && application.product !== filters.product) return false;
    if (!inDateRange(application.createdAt, filters.from, filters.to)) return false;
    const customer = store.customers.find((item) => item.id === application.customerId);
    const owner = store.users.find((item) => item.id === application.ownerId);
    return matchesText(filters.q, [
      application.ref,
      application.purpose,
      customer?.name,
      customer?.ref,
      customer?.phone,
      owner?.name,
    ]);
  });

  const owners = store.users
    .filter(
      (item) =>
        item.status === "ACTIVE" &&
        inScope(scope, item.branchId) &&
        ["LOAN_OFFICER", "BRANCH_MANAGER", "CREDIT_OFFICER", "COLLECTION_OFFICER"].includes(item.role),
    )
    .map((item) => ({ id: item.id, name: item.name, branchId: item.branchId, color: item.avatarColor, role: item.role }));

  const creditOfficers = store.users
    .filter(
      (item) =>
        item.status === "ACTIVE" &&
        inScope(scope, item.branchId) &&
        ["CREDIT_OFFICER", "BRANCH_MANAGER"].includes(item.role),
    )
    .map((item) => ({ id: item.id, name: item.name, branchId: item.branchId }));

  const branches = store.branches.filter((branch) => inScope(scope, branch.id)).map((branch) => ({ id: branch.id, name: branch.name }));

  const customers = store.customers
    .filter((customer) => inScope(scope, customer.branchId))
    .map((customer) => ({ id: customer.id, name: customer.name, ref: customer.ref, city: customer.city, branchId: customer.branchId }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const options: ApplicationOptions = {
    owners,
    creditOfficers,
    branches,
    customers,
    currentUserId: user.id,
    canManage: user.permissions.includes("applications:manage"),
  };

  return {
    items: sortBy(filtered, (application) => new Date(application.createdAt).getTime(), "desc").map((application) =>
      toListItem(scope, application),
    ),
    counts,
    options,
  };
}

function scopeApplication(user: SessionUser, applicationId: string) {
  const store = getStore();
  const scope = buildScope(user);
  const application = store.applications.find((item) => item.id === applicationId);
  if (!application) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application not found.");
  assertBranchScope(scope, application.branchId);
  return { store, scope, application };
}

export function getApplicationDetail(user: SessionUser, applicationId: string): ApplicationDetailView {
  const { store, application } = scopeApplication(user, applicationId);
  const customer = store.customers.find((item) => item.id === application.customerId);
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Linked customer record is unavailable.");
  const owner = store.users.find((item) => item.id === application.ownerId);
  const sanction = store.sanctions.find((item) => item.applicationId === application.id) ?? null;
  const disbursement = store.disbursements.find((item) => item.applicationId === application.id) ?? null;
  const loanAccount = store.loanAccounts.find((item) => item.applicationId === application.id) ?? null;
  const lead = application.leadId ? store.leads.find((item) => item.id === application.leadId) : null;
  const tasks = store.tasks
    .filter((task) => task.relatedType === "APPLICATION" && task.relatedId === application.id)
    .map((task) => ({ id: task.id, ref: task.ref, title: task.title, status: task.status, dueDate: task.dueDate }));

  return {
    application,
    customer,
    ownerName: owner?.name ?? "Unassigned",
    ownerColor: owner?.avatarColor ?? "#117a60",
    branchName: store.branches.find((item) => item.id === application.branchId)?.name ?? "—",
    creditOfficerName: actorName(application.creditOfficerId),
    leadRef: lead?.ref ?? null,
    decisionByName: actorName(application.creditDecision?.decidedBy),
    sanction: sanction
      ? { id: sanction.id, ref: sanction.ref, status: sanction.status, approvedAmount: sanction.approvedAmount }
      : null,
    disbursement: disbursement
      ? { id: disbursement.id, ref: disbursement.ref, status: disbursement.status, amount: disbursement.amount }
      : null,
    loanAccount: loanAccount
      ? {
          id: loanAccount.id,
          ref: loanAccount.ref,
          status: loanAccount.status,
          outstanding: loanAccount.outstanding,
          emiAmount: loanAccount.emiAmount,
        }
      : null,
    tasks,
    activities: sortBy(
      application.activities.map((activity) => ({ ...activity, actorName: actorName(activity.actorId) ?? "System" })),
      (activity) => new Date(activity.at).getTime(),
      "desc",
    ),
  };
}

function touchApplication(application: LoanApplication, summary: string, actorId: string, type = "UPDATED") {
  const at = new Date().toISOString();
  application.updatedAt = at;
  application.activities.unshift({ id: makeId("act"), at, actorId, type, summary });
}

const STANDARD_DOCUMENTS = ["PAN card", "Aadhaar (masked)", "Bank statement — 6 months", "Address proof"];

export function createApplication(
  user: SessionUser,
  input: {
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    customerCity?: string;
    employmentType?: Customer["employmentType"];
    employer?: string;
    monthlyIncome?: number;
    product: LoanProduct;
    requestedAmount: number;
    tenureMonths: number;
    interestRate?: number;
    purpose: string;
    ownerId?: string;
    branchId?: string;
  },
) {
  assertPermission(user, "applications:manage");
  const store = getStore();
  const scope = buildScope(user);
  const branchId = scope.isGlobal ? input.branchId ?? user.branchId : user.branchId;
  const branch = store.branches.find((item) => item.id === branchId);
  if (!branch) throw new ApiError(422, "INVALID_BRANCH", "Select a valid branch.");

  const ownerId = input.ownerId ?? user.id;
  const owner = store.users.find((item) => item.id === ownerId && item.status === "ACTIVE");
  if (!owner || !inScope(scope, owner.branchId)) {
    throw new ApiError(422, "INVALID_OWNER", "Selected owner is not available in your scope.");
  }
  if (owner.branchId !== branchId) {
    throw new ApiError(422, "OWNER_BRANCH_MISMATCH", "Application owner must belong to the selected branch.");
  }

  const now = new Date().toISOString();
  let customer = input.customerId ? store.customers.find((item) => item.id === input.customerId) : undefined;
  if (customer) {
    assertBranchScope(scope, customer.branchId);
    if (customer.branchId !== branchId) {
      throw new ApiError(422, "CUSTOMER_BRANCH_MISMATCH", "Existing customer belongs to another branch.");
    }
  } else {
    if (!input.customerName || !input.customerPhone || !input.customerEmail || !input.customerCity) {
      throw new ApiError(422, "CUSTOMER_REQUIRED", "Provide customer details or select an existing customer.");
    }
    const created: Customer = {
      id: makeId("cus"),
      ref: nextSequence("CUS", store.customers.map((item) => item.ref)),
      name: input.customerName.trim(),
      dob: new Date(new Date().getFullYear() - 32, 4, 12).toISOString(),
      gender: "OTHER",
      phone: input.customerPhone.trim(),
      email: input.customerEmail.trim().toLowerCase(),
      addressLine: "Synthetic address — captured at application",
      city: input.customerCity.trim(),
      state: "Maharashtra",
      pincode: "400001",
      panMasked: "SYNPA••••X",
      aadhaarMasked: "•••• •••• 0000",
      employmentType: input.employmentType ?? "SALARIED",
      employer: input.employer?.trim() || "Synthetic employer",
      monthlyIncome: input.monthlyIncome ?? 45000,
      kycStatus: "PENDING",
      branchId,
      relationshipSince: now,
      createdAt: now,
    };
    store.customers.unshift(created);
    customer = created;
    appendAudit(store, user.id, "CUSTOMER_CREATED", "Customer", created.id, `Created customer ${created.ref} from application intake`);
  }

  const docs: DocumentCheck[] = STANDARD_DOCUMENTS.map((name, index) => ({
    id: makeId("doc"),
    name,
    required: index < 3,
    status: "PENDING",
    fileName: null,
    uploadedAt: null,
  }));

  const application: LoanApplication = {
    id: makeId("app"),
    ref: nextSequence("APP", store.applications.map((item) => item.ref)),
    customerId: customer.id,
    leadId: null,
    product: input.product,
    requestedAmount: input.requestedAmount,
    tenureMonths: input.tenureMonths,
    interestRate: input.interestRate ?? PRODUCT_RATES[input.product],
    purpose: input.purpose.trim(),
    status: "NEW",
    branchId,
    ownerId,
    creditOfficerId: null,
    isAuto: false,
    riskBand: null,
    sentBackReason: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    creditDecision: null,
    documents: docs,
    verification: { identity: "PENDING", address: "PENDING", employment: "PENDING", income: "PENDING" },
    activities: [
      {
        id: makeId("act"),
        at: now,
        actorId: user.id,
        type: "APPLICATION_CREATED",
        summary: `Application created for ${customer.name}`,
      },
    ],
  };
  store.applications.unshift(application);
  appendAudit(store, user.id, "APPLICATION_CREATED", "Application", application.id, `Created application ${application.ref}`);
  return { id: application.id, ref: application.ref };
}

export function updateApplication(
  user: SessionUser,
  applicationId: string,
  patch: Partial<Pick<LoanApplication, "product" | "requestedAmount" | "tenureMonths" | "interestRate" | "purpose" | "ownerId">>,
) {
  assertPermission(user, "applications:manage");
  const { store, scope, application } = scopeApplication(user, applicationId);
  if (!EDITABLE_STATUSES.includes(application.status)) {
    throw new ApiError(409, "LOCKED_APPLICATION", "This application can no longer be edited after a credit decision.");
  }
  if (patch.ownerId) {
    const owner = store.users.find((item) => item.id === patch.ownerId && item.status === "ACTIVE");
    if (!owner || !inScope(scope, owner.branchId) || owner.branchId !== application.branchId) {
      throw new ApiError(422, "INVALID_OWNER", "Owner must be an active member of the application's branch.");
    }
  }
  Object.assign(application, patch);
  touchApplication(application, "Application details updated", user.id);
  appendAudit(store, user.id, "APPLICATION_UPDATED", "Application", application.id, `Updated application ${application.ref}`);
  return { ok: true };
}

function assertDocsComplete(application: LoanApplication, requireVerified: boolean) {
  const required = application.documents.filter((doc) => doc.required);
  const missing = required.filter((doc) => (requireVerified ? doc.status !== "VERIFIED" : doc.status === "PENDING" || doc.status === "REJECTED"));
  if (missing.length > 0) {
    throw new ApiError(
      409,
      "DOCUMENTS_INCOMPLETE",
      `${requireVerified ? "Verified" : "Uploaded"} documents required: ${missing.map((doc) => doc.name).join(", ")}.`,
    );
  }
}

export function submitApplication(user: SessionUser, applicationId: string) {
  assertPermission(user, "applications:manage");
  const { store, application } = scopeApplication(user, applicationId);
  if (application.status !== "NEW") {
    throw new ApiError(409, "INVALID_STAGE", "Only new applications can be submitted for processing.");
  }
  assertDocsComplete(application, false);
  application.status = "IN_PROCESS";
  application.submittedAt = application.submittedAt ?? new Date().toISOString();
  touchApplication(application, "Submitted for processing — mandatory documents uploaded", user.id, "SUBMITTED");
  appendAudit(store, user.id, "APPLICATION_SUBMITTED", "Application", application.id, `Submitted ${application.ref} for processing`);
  return { ok: true };
}

export function updateDocument(
  user: SessionUser,
  applicationId: string,
  documentId: string,
  status: DocumentCheck["status"],
) {
  assertPermission(user, "applications:manage");
  const { store, application } = scopeApplication(user, applicationId);
  if (!DOC_WORKABLE_STATUSES.includes(application.status)) {
    throw new ApiError(409, "LOCKED_APPLICATION", "Documents cannot be changed after a credit decision.");
  }
  const document = application.documents.find((doc) => doc.id === documentId);
  if (!document) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document not found on this application.");
  if (status === "UPLOADED" && document.status !== "PENDING") {
    throw new ApiError(409, "INVALID_DOCUMENT_TRANSITION", "Only pending documents can be uploaded.");
  }
  if ((status === "VERIFIED" || status === "REJECTED") && document.status !== "UPLOADED") {
    throw new ApiError(409, "INVALID_DOCUMENT_TRANSITION", "Only uploaded documents can be verified or rejected.");
  }
  if (status === "PENDING") throw new ApiError(409, "INVALID_DOCUMENT_TRANSITION", "Documents cannot be reset to pending.");
  document.status = status;
  if (status === "UPLOADED") {
    document.fileName = `${document.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-demo.pdf`;
    document.uploadedAt = new Date().toISOString();
  }
  touchApplication(application, `${document.name} marked ${status.toLowerCase()}`, user.id, "DOCUMENT");
  appendAudit(store, user.id, "APPLICATION_DOCUMENT", "Application", application.id, `${document.name} ${status.toLowerCase()} for ${application.ref}`);
  return { ok: true };
}

export function updateVerification(
  user: SessionUser,
  applicationId: string,
  field: keyof LoanApplication["verification"],
  status: VerificationStatus,
) {
  assertPermission(user, "applications:manage");
  const { store, application } = scopeApplication(user, applicationId);
  if (!["NEW", "IN_PROCESS"].includes(application.status)) {
    throw new ApiError(409, "LOCKED_APPLICATION", "Verification is locked after the file is recommended.");
  }
  application.verification[field] = status;
  touchApplication(application, `${field} verification marked ${status.toLowerCase()}`, user.id, "VERIFICATION");
  appendAudit(store, user.id, "APPLICATION_VERIFICATION", "Application", application.id, `${field} verification ${status.toLowerCase()} for ${application.ref}`);
  return { ok: true };
}

export function recommendApplication(user: SessionUser, applicationId: string, creditOfficerId?: string) {
  assertPermission(user, "applications:manage");
  const { store, application } = scopeApplication(user, applicationId);
  if (application.status !== "IN_PROCESS") {
    throw new ApiError(409, "INVALID_STAGE", "Only in-process applications can be recommended to credit.");
  }
  assertDocsComplete(application, true);
  const pendingVerification = Object.entries(application.verification)
    .filter(([, value]) => value !== "VERIFIED")
    .map(([key]) => key);
  if (pendingVerification.length > 0) {
    throw new ApiError(409, "VERIFICATION_INCOMPLETE", `Complete verification first: ${pendingVerification.join(", ")}.`);
  }

  const eligible = store.users.filter(
    (item) =>
      item.status === "ACTIVE" &&
      inScope(buildScope(user), item.branchId) &&
      ["CREDIT_OFFICER", "BRANCH_MANAGER"].includes(item.role),
  );
  const officer = creditOfficerId
    ? eligible.find((item) => item.id === creditOfficerId)
    : eligible.find((item) => item.branchId === application.branchId && item.role === "CREDIT_OFFICER") ??
      eligible.find((item) => item.branchId === application.branchId) ??
      eligible.find((item) => item.role === "CREDIT_OFFICER") ??
      eligible[0];
  if (creditOfficerId && !officer) {
    throw new ApiError(422, "INVALID_CREDIT_OFFICER", "Selected credit officer is not available in your scope.");
  }
  if (!officer) {
    throw new ApiError(422, "NO_CREDIT_OFFICER", "No credit officer is available to receive this file.");
  }

  application.status = "RECOMMENDED";
  application.creditOfficerId = officer.id;
  touchApplication(application, `Recommended to credit review — assigned to ${officer.name}`, user.id, "RECOMMENDED");
  appendAudit(store, user.id, "APPLICATION_RECOMMENDED", "Application", application.id, `Recommended ${application.ref} to credit`);
  return { ok: true };
}

export function resubmitApplication(user: SessionUser, applicationId: string) {
  assertPermission(user, "applications:manage");
  const { store, application } = scopeApplication(user, applicationId);
  if (application.status !== "SENT_BACK") {
    throw new ApiError(409, "INVALID_STAGE", "Only sent-back applications can be resubmitted.");
  }
  application.status = "IN_PROCESS";
  application.sentBackReason = null;
  touchApplication(application, "Resubmitted for credit review after send-back", user.id, "RESUBMITTED");
  appendAudit(store, user.id, "APPLICATION_RESUBMITTED", "Application", application.id, `Resubmitted ${application.ref}`);
  return { ok: true };
}
