import { getJson, patchJson, postJson } from "@/lib/api";
import type {
  AccessGrant,
  AccessScopeType,
  EffectivePermission,
  Permission,
  PermissionAudit,
  RecordType,
  RoleDefinition,
} from "@/lib/types";

export type AccessUserSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleName: string;
  department: string;
  branchNames: string[];
  status: "ACTIVE" | "INACTIVE";
  recordAccess: "BRANCH" | "ASSIGNED";
  isProtected: boolean;
  isSelf: boolean;
  roleRank: number;
  directGrantCount: number;
  effectiveCount: number;
  lastLoginAt: string | null;
};

export type RoleSummary = RoleDefinition & { userCount: number };

export type GrantStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export type GrantView = AccessGrant & {
  subjectName: string;
  grantedByName: string;
  revokedByName: string | null;
  status: GrantStatus;
};

export type AuditView = PermissionAudit & { actorName: string };

export type AccessCenterData = {
  users: AccessUserSummary[];
  roles: RoleSummary[];
  grants: GrantView[];
  audits: AuditView[];
  permissions: Permission[];
  branches: { id: string; name: string; code: string }[];
  departments: string[];
  protectedSuperAdminId: string;
  protectedSuperAdminName: string;
  summary: {
    totalUsers: number;
    activeGrants: number;
    temporaryGrants: number;
    restrictions: number;
    roleCount: number;
    permissionCount: number;
  };
};

export type UserAccessDetail = {
  user: AccessUserSummary;
  role: RoleDefinition | null;
  effective: EffectivePermission[];
  grants: GrantView[];
  history: AuditView[];
};

export type AccessPreview = {
  user: AccessUserSummary;
  context: {
    branchId?: string;
    department?: string;
    recordType?: RecordType;
    recordId?: string;
  } | null;
  effective: EffectivePermission[];
};

export type AccessComparison = {
  left: AccessUserSummary;
  right: AccessUserSummary;
  rows: { permission: Permission; left: boolean; right: boolean; difference: "SAME" | "DIFFERENT" }[];
  onlyLeft: Permission[];
  onlyRight: Permission[];
};

export type GrantInput = {
  subjectId: string;
  permission: Permission;
  effect: "ALLOW" | "DENY";
  scopeType: AccessScopeType;
  branchId?: string | null;
  department?: string | null;
  recordType?: RecordType | null;
  recordId?: string | null;
  mode: "DIRECT" | "DELEGATED";
  reason: string;
  expiresAt?: string | null;
};

export type RoleInput = {
  name: string;
  shortLabel: string;
  description: string;
  rank: number;
  isGlobal: boolean;
  permissions: Permission[];
  code?: string;
};

export type UserScopeInput = {
  branchIds: string[];
  department: string;
  recordAccess: "BRANCH" | "ASSIGNED";
  reason: string;
};

export async function fetchAccessCenter() {
  return getJson<AccessCenterData>("/access-control");
}

export async function fetchUserAccess(userId: string) {
  return getJson<UserAccessDetail>(`/access-control/users/${userId}`);
}

export async function previewUserAccess(userId: string, context: { branchId?: string; recordType?: string; recordId?: string }) {
  return getJson<AccessPreview>(`/access-control/users/${userId}`, context);
}

export async function compareAccess(left: string, right: string) {
  return getJson<AccessComparison>("/access-control/compare", { left, right });
}

export async function createAccessGrant(input: GrantInput) {
  return postJson<{ grant: GrantView }>("/access-control/grants", input);
}

export async function revokeAccessGrant(grantId: string, reason: string) {
  return postJson<{ grant: GrantView }>(`/access-control/grants/${grantId}/revoke`, { reason });
}

export async function createAccessRole(input: RoleInput) {
  return postJson<{ role: RoleDefinition }>("/access-control/roles", input);
}

export async function updateAccessRole(code: string, input: RoleInput) {
  return patchJson<{ role: RoleDefinition }>(`/access-control/roles/${code}`, input);
}

export async function updateAccessScope(userId: string, input: UserScopeInput) {
  return patchJson<{ user: AccessUserSummary }>(`/access-control/users/${userId}`, input);
}

export async function fetchPermissionHistory(targetId?: string) {
  return getJson<{ audits: AuditView[] }>("/access-control/history", targetId ? { target: targetId } : undefined);
}
