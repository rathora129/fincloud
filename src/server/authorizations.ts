import type {
  Activity,
  AuthorizationRequest,
  AuthorizationType,
  Scope,
  SessionUser,
} from "@/lib/types";
import { ApiError, assertBranchScope, buildScope, inScope } from "./access";
import { appendAudit, getStore, nextSequence } from "./store";

export const AUTHORIZATION_TABS: { key: AuthorizationType | "ALL" | "PENDING" | "DECIDED"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PAYMENT", label: "Payment" },
  { key: "LMS_ACCOUNT", label: "LMS Account" },
  { key: "AGENCY", label: "Agency" },
  { key: "PENDING", label: "Pending" },
  { key: "DECIDED", label: "Decided" },
];

export type AuthorizationTab = AuthorizationType | "ALL" | "PENDING" | "DECIDED";

export function normalizeAuthorizationTab(value: string | undefined): AuthorizationTab {
  return AUTHORIZATION_TABS.find((tab) => tab.key === value)?.key ?? "ALL";
}

export type AuthorizationRow = AuthorizationRequest & {
  requestedByName: string;
  requestedByColor: string;
  decidedByName: string | null;
  branchName: string;
};

export type AuthorizationsOverview = {
  rows: AuthorizationRow[];
  counts: Record<AuthorizationTab, number>;
  kpis: {
    pending: number;
    pendingAmount: number;
    approved: number;
    rejected: number;
  };
};

export type AuthorizationActivity = {
  id: string;
  at: string;
  type: string;
  summary: string;
  actorName: string;
  actorColor: string;
};

export type AuthorizationDetail = {
  authorization: AuthorizationRequest;
  requestedByName: string;
  requestedByColor: string;
  decidedByName: string | null;
  branchName: string;
  activities: AuthorizationActivity[];
};

function addActivity(target: { activities: Activity[] }, actorId: string, type: string, summary: string) {
  target.activities.unshift({
    id: `act-${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    actorId,
    type,
    summary,
  });
}

export function getAuthorizationsOverview(scope: Scope, tab: AuthorizationTab = "ALL"): AuthorizationsOverview {
  const store = getStore();
  const userById = new Map(store.users.map((user) => [user.id, user]));
  const branchById = new Map(store.branches.map((branch) => [branch.id, branch]));

  const scoped = store.authorizations.filter((authorization) => inScope(scope, authorization.branchId));

  const counts: Record<AuthorizationTab, number> = {
    ALL: scoped.length,
    PAYMENT: 0,
    LMS_ACCOUNT: 0,
    AGENCY: 0,
    PENDING: 0,
    DECIDED: 0,
  };
  scoped.forEach((authorization) => {
    counts[authorization.type] += 1;
    if (authorization.status === "PENDING") counts.PENDING += 1;
    else counts.DECIDED += 1;
  });

  const rows: AuthorizationRow[] = scoped
    .filter((authorization) => {
      if (tab === "ALL") return true;
      if (tab === "PENDING") return authorization.status === "PENDING";
      if (tab === "DECIDED") return authorization.status !== "PENDING";
      return authorization.type === tab;
    })
    .map((authorization) => {
      const requester = userById.get(authorization.requestedBy);
      const decider = authorization.decidedBy ? userById.get(authorization.decidedBy) : null;
      return {
        ...authorization,
        requestedByName: requester?.name ?? "System",
        requestedByColor: requester?.avatarColor ?? "#8099a5",
        decidedByName: decider?.name ?? null,
        branchName: branchById.get(authorization.branchId)?.name ?? "—",
      };
    })
    .sort((a, b) => {
      if (a.status === "PENDING" && b.status !== "PENDING") return -1;
      if (b.status === "PENDING" && a.status !== "PENDING") return 1;
      return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
    });

  const pending = scoped.filter((authorization) => authorization.status === "PENDING");

  return {
    rows,
    counts,
    kpis: {
      pending: pending.length,
      pendingAmount: pending.reduce((total, authorization) => total + (authorization.amount ?? 0), 0),
      approved: scoped.filter((authorization) => authorization.status === "APPROVED").length,
      rejected: scoped.filter((authorization) => authorization.status === "REJECTED").length,
    },
  };
}

export function getAuthorizationDetail(scope: Scope, authorizationId: string): AuthorizationDetail | null {
  const store = getStore();
  const authorization = store.authorizations.find((item) => item.id === authorizationId);
  if (!authorization || !inScope(scope, authorization.branchId)) return null;

  const userById = new Map(store.users.map((user) => [user.id, user]));
  const requester = userById.get(authorization.requestedBy);
  const decider = authorization.decidedBy ? userById.get(authorization.decidedBy) : null;

  const activities: AuthorizationActivity[] = [...authorization.activities]
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
    authorization,
    requestedByName: requester?.name ?? "System",
    requestedByColor: requester?.avatarColor ?? "#8099a5",
    decidedByName: decider?.name ?? null,
    branchName: store.branches.find((branch) => branch.id === authorization.branchId)?.name ?? "—",
    activities,
  };
}

export type CreateAuthorizationInput = {
  type: AuthorizationType;
  title: string;
  entityName: string;
  amount?: number | null;
  remarks?: string;
};

export function createAuthorization(user: SessionUser, input: CreateAuthorizationInput): AuthorizationRequest {
  const store = getStore();
  const title = input.title.trim();
  const entityName = input.entityName.trim();

  if (title.length < 5) {
    throw new ApiError(422, "INVALID_TITLE", "Request title needs at least 5 characters.");
  }
  if (entityName.length < 3) {
    throw new ApiError(422, "INVALID_ENTITY", "Add the entity this request applies to.");
  }
  if (input.type === "PAYMENT") {
    if (!input.amount || !Number.isFinite(input.amount) || input.amount <= 0) {
      throw new ApiError(422, "INVALID_AMOUNT", "Payment requests need an amount greater than zero.");
    }
  }

  const authorization: AuthorizationRequest = {
    id: `auth-${Math.random().toString(36).slice(2, 10)}`,
    ref: nextSequence("AUTH", store.authorizations.map((item) => item.ref)),
    type: input.type,
    title,
    entityName,
    amount: input.type === "PAYMENT" ? Math.round(input.amount ?? 0) : null,
    requestedBy: user.id,
    branchId: user.branchId,
    status: "PENDING",
    requestedAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
    remarks: input.remarks?.trim() || "Awaiting checker authorization.",
    activities: [],
  };

  addActivity(authorization, user.id, "AUTH_REQUESTED", "Authorization request raised.");
  store.authorizations.unshift(authorization);
  appendAudit(
    store,
    user.id,
    "AUTH_REQUESTED",
    "Authorization",
    authorization.id,
    `Raised ${authorization.ref} — ${authorization.title}.`,
  );

  return authorization;
}

export type DecideAuthorizationInput = {
  action: "APPROVE" | "REJECT";
  remarks?: string;
};

export function decideAuthorization(
  user: SessionUser,
  authorizationId: string,
  input: DecideAuthorizationInput,
): AuthorizationRequest {
  const store = getStore();
  const scope = buildScope(user);
  const authorization = store.authorizations.find((item) => item.id === authorizationId);
  if (!authorization) {
    throw new ApiError(404, "NOT_FOUND", "Authorization request not found.");
  }
  assertBranchScope(scope, authorization.branchId);

  if (authorization.status !== "PENDING") {
    throw new ApiError(
      409,
      "ALREADY_DECIDED",
      `This request was already ${authorization.status.toLowerCase()} and cannot be changed.`,
    );
  }

  const remarks = input.remarks?.trim() ?? "";
  if (input.action === "REJECT" && remarks.length < 5) {
    throw new ApiError(422, "REMARKS_REQUIRED", "Add a rejection remark (at least 5 characters).");
  }

  authorization.status = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
  authorization.decidedAt = new Date().toISOString();
  authorization.decidedBy = user.id;
  authorization.remarks =
    remarks || (input.action === "APPROVE" ? "Authorized in DEMO mode." : "Rejected by checker.");

  addActivity(
    authorization,
    user.id,
    input.action === "APPROVE" ? "AUTH_APPROVED" : "AUTH_REJECTED",
    input.action === "APPROVE"
      ? `Authorized${remarks ? ` — ${remarks.replace(/[.\s]+$/, "")}` : " in DEMO mode"}.`
      : `Rejected — ${remarks.replace(/[.\s]+$/, "")}.`,
  );
  appendAudit(
    store,
    user.id,
    input.action === "APPROVE" ? "AUTH_APPROVED" : "AUTH_REJECTED",
    "Authorization",
    authorization.id,
    `${authorization.ref}: ${input.action.toLowerCase()}d by checker.`,
  );

  return authorization;
}
