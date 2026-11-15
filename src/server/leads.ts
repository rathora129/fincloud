import type {
  FollowUp,
  Lead,
  LeadSource,
  LeadStatus,
  LeadType,
  LoanProduct,
  Scope,
  SessionUser,
} from "@/lib/types";
import {
  ApiError,
  assertBranchScope,
  assertPermission,
  assertRecordPermission,
  buildScope,
  canViewRecord,
  inScope,
} from "./access";
import { appendAudit, getStore, makeId, nextSequence } from "./store";
import { inDateRange, matchesText, sortBy } from "./query";
import { LEAD_TRANSITIONS, PRODUCT_RATES } from "@/lib/lead-flow";
import { stateForCity } from "@/lib/geo";
import { humanize } from "@/lib/labels";

export type LeadFilters = {
  tab?: string;
  q?: string;
  status?: string;
  source?: string;
  ownerId?: string;
  branchId?: string;
  from?: string;
  to?: string;
};

export type LeadListItem = Omit<Lead, "activities" | "followUps"> & {
  ownerName: string;
  ownerColor: string;
  branchName: string;
  applicationRef: string | null;
  applicationId: string | null;
};

export type LeadDetailView = {
  lead: Lead;
  ownerName: string;
  ownerColor: string;
  branchName: string;
  followUps: (FollowUp & { actorName: string })[];
  activities: (Lead["activities"][number] & { actorName: string })[];
  application: { id: string; ref: string; status: string; product: LoanProduct; requestedAmount: number } | null;
  tasks: { id: string; ref: string; title: string; status: string; dueDate: string }[];
};

export type LeadCounts = {
  all: number;
  new: number;
  repeat: number;
  preApproved: number;
  processing: number;
};

export type LeadOptions = {
  owners: { id: string; name: string; branchId: string; color: string }[];
  branches: { id: string; name: string }[];
  canAssign: boolean;
  canManage: boolean;
  currentUserId: string;
};

const TAB_MATCHERS: Record<string, (lead: Lead) => boolean> = {
  all: () => true,
  new: (lead) => lead.type === "NEW",
  repeat: (lead) => lead.type === "REPEAT",
  pre_approved: (lead) => lead.type === "PRE_APPROVED",
  processing: (lead) => ["CONTACTED", "QUALIFIED"].includes(lead.status),
};

const PRODUCT_TENURE: Record<LoanProduct, number> = {
  PERSONAL: 36,
  BUSINESS: 48,
  HOME: 180,
  VEHICLE: 60,
  GOLD: 12,
};

function toListItem(scope: Scope, lead: Lead): LeadListItem {
  const store = getStore();
  const owner = store.users.find((u) => u.id === lead.ownerId);
  const branch = store.branches.find((b) => b.id === lead.branchId);
  const application = lead.convertedApplicationId
    ? store.applications.find((a) => a.id === lead.convertedApplicationId)
    : null;
  const { activities: _activities, followUps: _followUps, ...listFields } = lead;
  return {
    ...listFields,
    ownerName: owner?.name ?? "Unassigned",
    ownerColor: owner?.avatarColor ?? "#117a60",
    branchName: branch?.name ?? "—",
    applicationRef: application?.ref ?? null,
    applicationId: application?.id ?? null,
  };
}

export function getLeadsWorkspace(user: SessionUser, filters: LeadFilters) {
  const store = getStore();
  const scope = buildScope(user);
  const tab = filters.tab && TAB_MATCHERS[filters.tab] ? filters.tab : "all";

  const scopedLeads = store.leads.filter(
    (lead) =>
      inScope(scope, lead.branchId) &&
      canAccessLead(user, lead, "leads:view") &&
      (!filters.ownerId || lead.ownerId === filters.ownerId),
  );

  const counts: LeadCounts = {
    all: scopedLeads.length,
    new: scopedLeads.filter(TAB_MATCHERS.new).length,
    repeat: scopedLeads.filter(TAB_MATCHERS.repeat).length,
    preApproved: scopedLeads.filter(TAB_MATCHERS.pre_approved).length,
    processing: scopedLeads.filter(TAB_MATCHERS.processing).length,
  };

  const filtered = scopedLeads.filter((lead) => {
    if (!TAB_MATCHERS[tab](lead)) return false;
    if (filters.branchId && lead.branchId !== filters.branchId) return false;
    if (filters.status && lead.status !== filters.status) return false;
    if (filters.source && lead.source !== filters.source) return false;
    if (!inDateRange(lead.createdAt, filters.from, filters.to)) return false;
    return matchesText(filters.q, [lead.ref, lead.customerName, lead.phone, lead.email, lead.city, lead.loanPurpose]);
  });

  const owners = store.users
    .filter(
      (u) =>
        u.status === "ACTIVE" &&
        inScope(scope, u.branchId) &&
        [
          "TEAM_LEADER",
          "SENIOR_LOAN_OFFICER",
          "LOAN_OFFICER",
          "JUNIOR_LOAN_OFFICER",
          "BRANCH_MANAGER",
          "CREDIT_OFFICER",
          "COLLECTION_OFFICER",
        ].includes(u.role),
    )
    .map((u) => ({ id: u.id, name: u.name, branchId: u.branchId, color: u.avatarColor }));

  const branches = store.branches
    .filter((b) => inScope(scope, b.id))
    .map((b) => ({ id: b.id, name: b.name }));

  const options: LeadOptions = {
    owners,
    branches,
    canAssign: user.permissions.includes("leads:assign"),
    canManage: user.permissions.includes("leads:manage"),
    currentUserId: user.id,
  };

  return {
    items: sortBy(filtered, (lead) => new Date(lead.createdAt).getTime(), "desc").map((lead) => toListItem(scope, lead)),
    counts,
    options,
  };
}

function canAccessLead(user: SessionUser, lead: Lead, permission: "leads:view" | "leads:manage" | "leads:assign") {
  return canViewRecord(user, "LEAD", lead.id, permission, lead.branchId, lead.ownerId);
}

export function getLeadDetail(user: SessionUser, leadId: string): LeadDetailView {
  const store = getStore();
  const scope = buildScope(user);
  const lead = store.leads.find((item) => item.id === leadId);
  if (!lead) throw new ApiError(404, "LEAD_NOT_FOUND", "Lead not found.");
  assertBranchScope(scope, lead.branchId);
  assertRecordPermission(user, "LEAD", lead.id, "leads:view", lead.branchId, lead.ownerId);

  const owner = store.users.find((u) => u.id === lead.ownerId);
  const branch = store.branches.find((b) => b.id === lead.branchId);
  const application = lead.convertedApplicationId
    ? store.applications.find((a) => a.id === lead.convertedApplicationId)
    : null;
  const tasks = store.tasks
    .filter((task) => task.relatedType === "LEAD" && task.relatedId === lead.id)
    .map((task) => ({ id: task.id, ref: task.ref, title: task.title, status: task.status, dueDate: task.dueDate }));

  return {
    lead,
    ownerName: owner?.name ?? "Unassigned",
    ownerColor: owner?.avatarColor ?? "#117a60",
    branchName: branch?.name ?? "—",
    followUps: sortBy(
      lead.followUps.map((followUp) => ({
        ...followUp,
        actorName: store.users.find((u) => u.id === followUp.actorId)?.name ?? "System",
      })),
      (f) => new Date(f.at).getTime(),
      "desc",
    ),
    activities: sortBy(
      lead.activities.map((activity) => ({
        ...activity,
        actorName: store.users.find((u) => u.id === activity.actorId)?.name ?? "System",
      })),
      (a) => new Date(a.at).getTime(),
      "desc",
    ),
    application: application
      ? {
          id: application.id,
          ref: application.ref,
          status: application.status,
          product: application.product,
          requestedAmount: application.requestedAmount,
        }
      : null,
    tasks,
  };
}

function scopeLead(user: SessionUser, leadId: string, permission: "leads:manage" | "leads:assign" = "leads:manage") {
  const store = getStore();
  const scope = buildScope(user);
  const lead = store.leads.find((item) => item.id === leadId);
  if (!lead) throw new ApiError(404, "LEAD_NOT_FOUND", "Lead not found.");
  assertBranchScope(scope, lead.branchId);
  assertRecordPermission(user, "LEAD", lead.id, permission, lead.branchId, lead.ownerId);
  return { store, scope, lead };
}

function touchLead(lead: Lead, summary: string, actorId: string, type = "UPDATED") {
  const at = new Date().toISOString();
  lead.updatedAt = at;
  lead.activities.unshift({ id: makeId("act"), at, actorId, type, summary });
}

export function createLead(
  user: SessionUser,
  input: {
    customerName: string;
    phone: string;
    email: string;
    city: string;
    source: LeadSource;
    type: LeadType;
    monthlyIncome: number;
    loanPurpose: string;
    notes?: string;
    ownerId?: string;
    branchId?: string;
    nextFollowUpAt?: string;
  },
) {
  assertPermission(user, "leads:manage");
  const store = getStore();
  const scope = buildScope(user);
  const branchId = scope.isGlobal ? input.branchId ?? user.branchId : user.branchId;
  const branch = store.branches.find((b) => b.id === branchId);
  if (!branch) throw new ApiError(422, "INVALID_BRANCH", "Select a valid branch.");
  const ownerId = input.ownerId ?? user.id;
  const owner = store.users.find((u) => u.id === ownerId && u.status === "ACTIVE");
  if (!owner || !inScope(scope, owner.branchId)) {
    throw new ApiError(422, "INVALID_OWNER", "Selected owner is not available in your scope.");
  }
  if (owner.branchId !== branchId) {
    throw new ApiError(422, "OWNER_BRANCH_MISMATCH", "Lead owner must belong to the selected branch.");
  }

  const now = new Date().toISOString();
  const lead: Lead = {
    id: makeId("lead"),
    ref: nextSequence("LD", store.leads.map((l) => l.ref)),
    customerName: input.customerName.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    city: input.city.trim(),
    source: input.source,
    type: input.type,
    status: "NEW",
    branchId,
    ownerId,
    monthlyIncome: input.monthlyIncome,
    loanPurpose: input.loanPurpose.trim(),
    notes: input.notes?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
    nextFollowUpAt: input.nextFollowUpAt ?? null,
    convertedApplicationId: null,
    activities: [
      { id: makeId("act"), at: now, actorId: user.id, type: "LEAD_CREATED", summary: "Lead captured in DEMO workspace" },
    ],
    followUps: [],
  };
  store.leads.unshift(lead);
  appendAudit(store, user.id, "LEAD_CREATED", "Lead", lead.id, `Created lead ${lead.ref} for ${lead.customerName}`);
  return { id: lead.id, ref: lead.ref };
}

export function updateLead(
  user: SessionUser,
  leadId: string,
  patch: Partial<
    Pick<
      Lead,
      | "customerName"
      | "phone"
      | "email"
      | "city"
      | "monthlyIncome"
      | "loanPurpose"
      | "notes"
      | "source"
      | "type"
      | "nextFollowUpAt"
    >
  >,
) {
  assertPermission(user, "leads:manage");
  const { store, lead } = scopeLead(user, leadId);
  Object.assign(lead, patch);
  touchLead(lead, "Lead details updated", user.id);
  appendAudit(store, user.id, "LEAD_UPDATED", "Lead", lead.id, `Updated lead ${lead.ref}`);
  return { ok: true };
}

export function assignLead(user: SessionUser, leadId: string, ownerId: string) {
  assertPermission(user, "leads:assign");
  const { store, scope, lead } = scopeLead(user, leadId, "leads:assign");
  const owner = store.users.find((u) => u.id === ownerId && u.status === "ACTIVE");
  if (!owner || !inScope(scope, owner.branchId)) {
    throw new ApiError(422, "INVALID_OWNER", "Selected owner is outside your scope.");
  }
  if (owner.branchId !== lead.branchId) {
    throw new ApiError(422, "OWNER_BRANCH_MISMATCH", "Owner must belong to the lead's branch.");
  }
  const previous = store.users.find((u) => u.id === lead.ownerId)?.name ?? "Unassigned";
  lead.ownerId = ownerId;
  touchLead(lead, `Lead reassigned from ${previous} to ${owner.name}`, user.id, "ASSIGNED");
  appendAudit(store, user.id, "LEAD_ASSIGNED", "Lead", lead.id, `Reassigned ${lead.ref} to ${owner.name}`);
  return { ok: true };
}

export function changeLeadStatus(user: SessionUser, leadId: string, status: LeadStatus, note?: string) {
  assertPermission(user, "leads:manage");
  const { store, lead } = scopeLead(user, leadId);
  if (!LEAD_TRANSITIONS[lead.status].includes(status)) {
    throw new ApiError(
      409,
      "INVALID_TRANSITION",
      `Cannot move a lead from ${lead.status.replaceAll("_", " ")} to ${status.replaceAll("_", " ")}.`,
    );
  }
  const previous = lead.status;
  lead.status = status;
  if (status === "LOST") lead.nextFollowUpAt = null;
  touchLead(
    lead,
    note?.trim()
      ? `Status ${humanize(previous)} → ${humanize(status)}: ${note.trim()}`
      : `Status changed from ${humanize(previous)} to ${humanize(status)}`,
    user.id,
    "STATUS_CHANGED",
  );
  appendAudit(store, user.id, "LEAD_STATUS_CHANGED", "Lead", lead.id, `Lead ${lead.ref} moved to ${status}`);
  return { ok: true };
}

export function addFollowUp(
  user: SessionUser,
  leadId: string,
  input: {
    channel: FollowUp["channel"];
    outcome: FollowUp["outcome"];
    notes: string;
    nextFollowUpAt?: string | null;
  },
) {
  assertPermission(user, "leads:manage");
  const { store, lead } = scopeLead(user, leadId);
  if (lead.status === "CONVERTED") {
    throw new ApiError(409, "LEAD_CONVERTED", "Converted leads cannot receive new follow-ups.");
  }
  const at = new Date().toISOString();
  lead.followUps.unshift({
    id: makeId("fu"),
    at,
    actorId: user.id,
    channel: input.channel,
    outcome: input.outcome,
    notes: input.notes.trim(),
    nextFollowUpAt: input.nextFollowUpAt || null,
  });
  lead.nextFollowUpAt = input.nextFollowUpAt || null;
  if (lead.status === "NEW") lead.status = "CONTACTED";
  touchLead(lead, `Follow-up logged (${input.channel.toLowerCase()} · ${input.outcome.toLowerCase()})`, user.id, "FOLLOW_UP");
  appendAudit(store, user.id, "LEAD_FOLLOW_UP", "Lead", lead.id, `Follow-up recorded for ${lead.ref}`);
  return { ok: true };
}

export function convertLead(
  user: SessionUser,
  leadId: string,
  input: { product: LoanProduct; requestedAmount: number; tenureMonths: number; purpose: string; interestRate?: number },
) {
  assertPermission(user, "leads:manage");
  assertPermission(user, "applications:manage");
  const { store, lead } = scopeLead(user, leadId);
  if (lead.status !== "QUALIFIED") {
    throw new ApiError(409, "INVALID_STAGE", "Only qualified leads can be converted to an application.");
  }
  if (lead.convertedApplicationId) {
    throw new ApiError(409, "ALREADY_CONVERTED", "This lead already has a linked application.");
  }

  const now = new Date().toISOString();
  const customer = {
    id: makeId("cus"),
    ref: nextSequence("CUS", store.customers.map((c) => c.ref)),
    name: lead.customerName,
    dob: new Date(new Date().getFullYear() - 32, 4, 12).toISOString(),
    gender: "OTHER" as const,
    phone: lead.phone,
    email: lead.email,
    addressLine: "Synthetic address — captured from lead",
    city: lead.city,
    state: stateForCity(lead.city),
    pincode: "400001",
    panMasked: "SYNPA••••X",
    aadhaarMasked: "•••• •••• 0000",
    employmentType: "SALARIED" as const,
    employer: "Synthetic employer",
    monthlyIncome: lead.monthlyIncome,
    kycStatus: "PENDING" as const,
    branchId: lead.branchId,
    relationshipSince: now,
    createdAt: now,
  };
  store.customers.unshift(customer);

  const docs = ["PAN card", "Aadhaar (masked)", "Bank statement — 6 months", "Address proof"].map((name, index) => ({
    id: makeId("doc"),
    name,
    required: index < 3,
    status: "PENDING" as const,
    fileName: null,
    uploadedAt: null,
    fileId: null,
  }));

  const application = {
    id: makeId("app"),
    ref: nextSequence("APP", store.applications.map((a) => a.ref)),
    customerId: customer.id,
    leadId: lead.id,
    product: input.product,
    requestedAmount: input.requestedAmount,
    tenureMonths: input.tenureMonths,
    interestRate: input.interestRate ?? PRODUCT_RATES[input.product],
    purpose: input.purpose.trim(),
    status: "NEW" as const,
    branchId: lead.branchId,
    ownerId: lead.ownerId,
    creditOfficerId: null,
    isAuto: false,
    riskBand: null,
    sentBackReason: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: now,
    creditDecision: null,
    documents: docs,
    verification: { identity: "PENDING" as const, address: "PENDING" as const, employment: "PENDING" as const, income: "PENDING" as const },
    activities: [
      { id: makeId("act"), at: now, actorId: user.id, type: "APPLICATION_CREATED", summary: `Application created from lead ${lead.ref}` },
    ],
  };
  store.applications.unshift(application);

  lead.status = "CONVERTED";
  lead.convertedApplicationId = application.id;
  lead.nextFollowUpAt = null;
  touchLead(lead, `Converted to application ${application.ref}`, user.id, "CONVERTED");
  appendAudit(store, user.id, "LEAD_CONVERTED", "Lead", lead.id, `Converted ${lead.ref} → ${application.ref}`);
  appendAudit(store, user.id, "APPLICATION_CREATED", "Application", application.id, `Application ${application.ref} created from lead`);
  return { applicationId: application.id, applicationRef: application.ref };
}
