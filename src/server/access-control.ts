import { ALL_PERMISSIONS } from "@/lib/rbac";
import type {
  AccessGrant,
  AccessScopeType,
  EffectivePermission,
  Permission,
  PermissionAudit,
  RecordType,
  RoleDefinition,
  SessionUser,
  UserRecord,
} from "@/lib/types";
import { ApiError } from "./access";
import { logPermissionChange } from "./access-log";
import {
  assertScopeWithinAuthority,
  effectivePermissionsForUser,
  evaluateAllPermissions,
  getRoleDefinition,
  getRoleRank,
  getProtectedUser,
  hasPermission,
  isKnownPermission,
  isProtectedIdentity,
  isProtectedSuperAdmin,
  roleIsGlobal,
  wouldCreateDelegationCycle,
} from "./permissions";
import { getStore } from "./store";

const ADMIN_AUTHORITY: Permission[] = ["access:manage", "access:delegate", "roles:manage", "users:manage"];

const RECORD_COLLECTIONS: Record<RecordType, string> = {
  CUSTOMER: "customers",
  LEAD: "leads",
  APPLICATION: "applications",
  SANCTION: "sanctions",
  LOAN: "loanAccounts",
  DISBURSEMENT: "disbursements",
  COLLECTION: "collectionCases",
  TASK: "tasks",
  BRANCH: "branches",
  DEPARTMENT: "users",
  ORGANIZATION: "branches",
};

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

export type RoleUpdateInput = {
  name: string;
  shortLabel: string;
  description: string;
  rank: number;
  isGlobal: boolean;
  permissions: Permission[];
};

export type RoleCreateInput = RoleUpdateInput & { code?: string };

function grantStatus(grant: AccessGrant): GrantStatus {
  if (grant.revokedAt) return "REVOKED";
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) return "EXPIRED";
  return "ACTIVE";
}

function userBranches(user: UserRecord) {
  const store = getStore();
  return user.branchIds
    .map((id) => store.branches.find((branch) => branch.id === id))
    .filter((branch): branch is NonNullable<typeof branch> => Boolean(branch));
}

function assertAccessPermission(actor: SessionUser, permission: Permission) {
  if (!hasPermission(actor.id, permission)) {
    throw new ApiError(403, "FORBIDDEN", `You need ${permission} to perform this action.`);
  }
}

function visibleUser(actor: SessionUser, target: UserRecord): boolean {
  if (isProtectedSuperAdmin(actor.id) || roleIsGlobal(actor.role)) return true;
  return target.branchIds.some((branchId) => actor.branchIds.includes(branchId));
}

function assertVisibleUser(actor: SessionUser, target: UserRecord) {
  if (!visibleUser(actor, target)) {
    throw new ApiError(403, "OUT_OF_SCOPE", "This user is outside your branch scope.");
  }
}

/** Actor may administer the target only within their hierarchy and branch scope. */
function assertTargetWithinAuthority(actor: SessionUser, target: UserRecord) {
  if (isProtectedIdentity(target.id)) {
    throw new ApiError(403, "PROTECTED_IDENTITY", "The protected Super Admin identity cannot be modified.");
  }
  if (target.id === actor.id) {
    throw new ApiError(403, "SELF_ESCALATION", "You cannot change your own access. Ask another authorized administrator.");
  }
  assertVisibleUser(actor, target);
  if (isProtectedSuperAdmin(actor.id)) return;
  if (getRoleRank(target.role) >= getRoleRank(actor.role)) {
    throw new ApiError(403, "RANK_EXCEEDED", "You cannot modify access for an account at or above your authority level.");
  }
}

function assertAuthorityPermission(actor: SessionUser, permission: Permission) {
  if (ADMIN_AUTHORITY.includes(permission) && !isProtectedSuperAdmin(actor.id)) {
    throw new ApiError(
      403,
      "ADMIN_AUTHORITY_SEPARATION",
      "Administrative authority permissions can only be delegated by the protected Super Admin.",
    );
  }
}

function findUser(id: string): UserRecord {
  const user = getStore().users.find((item) => item.id === id);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "This user no longer exists.");
  return user;
}

function recordExists(recordType: RecordType, recordId: string) {
  const store = getStore();
  if (recordType === "ORGANIZATION") return true;
  if (recordType === "BRANCH") return store.branches.some((branch) => branch.id === recordId);
  if (recordType === "DEPARTMENT") return store.users.some((user) => user.department === recordId);
  const collection = store[RECORD_COLLECTIONS[recordType] as keyof typeof store];
  return Array.isArray(collection) && collection.some((row) => (row as { id: string }).id === recordId);
}

function recordBranch(recordType: RecordType, recordId: string): string | null {
  const store = getStore();
  if (recordType === "BRANCH") return recordId;
  if (recordType === "ORGANIZATION" || recordType === "DEPARTMENT") return null;
  const collection = store[RECORD_COLLECTIONS[recordType] as keyof typeof store];
  if (!Array.isArray(collection)) return null;
  const row = collection.find((item) => (item as { id: string }).id === recordId) as
    | { branchId?: string }
    | undefined;
  return row?.branchId ?? null;
}

function earliestActorExpiry(actor: SessionUser, permission: Permission): string | null {
  const grants = getStore().accessGrants.filter(
    (grant) =>
      grant.subjectId === actor.id &&
      grant.permission === permission &&
      grant.effect === "ALLOW" &&
      !grant.revokedAt &&
      grant.expiresAt,
  );
  if (grants.length === 0) return null;
  return grants
    .map((grant) => grant.expiresAt as string)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
}

function grantView(grant: AccessGrant): GrantView {
  const store = getStore();
  const subject = store.users.find((user) => user.id === grant.subjectId);
  const grantor = store.users.find((user) => user.id === grant.grantedBy);
  const revoker = grant.revokedBy ? store.users.find((user) => user.id === grant.revokedBy) : null;
  return {
    ...grant,
    subjectName: subject?.name ?? grant.subjectId,
    grantedByName: grantor?.name ?? grant.grantedBy,
    revokedByName: revoker?.name ?? null,
    status: grantStatus(grant),
  };
}

function auditView(entry: PermissionAudit): AuditView {
  const actor = getStore().users.find((user) => user.id === entry.actorId);
  return { ...entry, actorName: actor?.name ?? entry.actorId };
}

function userSummary(user: UserRecord, viewer: SessionUser): AccessUserSummary {
  const role = getRoleDefinition(user.role);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleName: role?.name ?? user.role,
    department: user.department,
    branchNames: userBranches(user).map((branch) => branch.name),
    status: user.status,
    recordAccess: user.recordAccess,
    isProtected: isProtectedIdentity(user.id),
    isSelf: user.id === viewer.id,
    roleRank: role?.rank ?? 0,
    directGrantCount: getStore().accessGrants.filter(
      (grant) => grant.subjectId === user.id && !grant.revokedAt,
    ).length,
    effectiveCount: effectivePermissionsForUser(user.id).length,
    lastLoginAt: user.lastLoginAt,
  };
}

export function getAccessCenterData(actor: SessionUser): AccessCenterData {
  assertAccessPermission(actor, "access:view");
  const store = getStore();
  const users = store.users
    .filter((user) => visibleUser(actor, user))
    .slice()
    .sort((a, b) => getRoleRank(b.role) - getRoleRank(a.role) || a.name.localeCompare(b.name))
    .map((user) => userSummary(user, actor));

  const visibleIds = new Set(users.map((user) => user.id));
  const grants = store.accessGrants
    .filter((grant) => visibleIds.has(grant.subjectId))
    .slice()
    .sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime())
    .map(grantView);

  const audits = store.permissionAudits
    .filter((entry) => {
      if (isProtectedSuperAdmin(actor.id) || roleIsGlobal(actor.role)) return true;
      if (visibleIds.has(entry.targetId)) return true;
      const grant = store.accessGrants.find((item) => item.id === entry.targetId);
      return Boolean(grant && visibleIds.has(grant.subjectId));
    })
    .slice(0, 120)
    .map(auditView);

  const roles: RoleSummary[] = store.roles
    .slice()
    .sort((a, b) => b.rank - a.rank)
    .map((role) => ({
      ...role,
      userCount: store.users.filter((user) => user.role === role.code).length,
    }));

  const active = grants.filter((grant) => grant.status === "ACTIVE");
  const protectedUser = getProtectedUser();

  return {
    users,
    roles,
    grants,
    audits,
    permissions: ALL_PERMISSIONS,
    branches: store.branches.map((branch) => ({ id: branch.id, name: branch.name, code: branch.code })),
    departments: Array.from(new Set(store.users.map((user) => user.department))).sort(),
    protectedSuperAdminId: store.security.protectedSuperAdminId,
    protectedSuperAdminName: protectedUser?.name ?? "Protected identity unavailable",
    summary: {
      totalUsers: users.length,
      activeGrants: active.length,
      temporaryGrants: active.filter((grant) => grant.expiresAt).length,
      restrictions: active.filter((grant) => grant.effect === "DENY").length,
      roleCount: roles.length,
      permissionCount: ALL_PERMISSIONS.length,
    },
  };
}

export function getUserAccess(actor: SessionUser, userId: string): UserAccessDetail {
  assertAccessPermission(actor, "access:view");
  const user = findUser(userId);
  assertVisibleUser(actor, user);
  const store = getStore();
  const grants = store.accessGrants
    .filter((grant) => grant.subjectId === user.id)
    .slice()
    .sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime())
    .map(grantView);
  const grantIds = new Set(grants.map((grant) => grant.id));
  const history = store.permissionAudits
    .filter((entry) => entry.targetId === user.id || grantIds.has(entry.targetId))
    .slice(0, 80)
    .map(auditView);

  return {
    user: userSummary(user, actor),
    role: getRoleDefinition(user.role) ?? null,
    effective: evaluateAllPermissions(user),
    grants,
    history,
  };
}

export function previewEffectivePermissions(
  actor: SessionUser,
  userId: string,
  context?: { branchId?: string; department?: string; recordType?: RecordType; recordId?: string },
) {
  assertAccessPermission(actor, "access:view");
  const user = findUser(userId);
  assertVisibleUser(actor, user);
  return {
    user: userSummary(user, actor),
    context: context ?? null,
    effective: evaluateAllPermissions(user, context),
  };
}

export function compareUserAccess(actor: SessionUser, leftId: string, rightId: string) {
  assertAccessPermission(actor, "access:view");
  const left = findUser(leftId);
  const right = findUser(rightId);
  assertVisibleUser(actor, left);
  assertVisibleUser(actor, right);
  const leftPermissions = new Set(effectivePermissionsForUser(left.id));
  const rightPermissions = new Set(effectivePermissionsForUser(right.id));
  return {
    left: userSummary(left, actor),
    right: userSummary(right, actor),
    rows: ALL_PERMISSIONS.map((permission) => ({
      permission,
      left: leftPermissions.has(permission),
      right: rightPermissions.has(permission),
      difference: leftPermissions.has(permission) === rightPermissions.has(permission) ? "SAME" : "DIFFERENT",
    })),
    onlyLeft: ALL_PERMISSIONS.filter((permission) => leftPermissions.has(permission) && !rightPermissions.has(permission)),
    onlyRight: ALL_PERMISSIONS.filter((permission) => rightPermissions.has(permission) && !leftPermissions.has(permission)),
  };
}

export function createGrant(actor: SessionUser, input: GrantInput, ip?: string): GrantView {
  assertAccessPermission(actor, "access:manage");
  const store = getStore();
  const subject = findUser(input.subjectId);
  assertTargetWithinAuthority(actor, subject);

  if (!isKnownPermission(input.permission)) {
    throw new ApiError(422, "INVALID_PERMISSION", "This permission is not part of the permission catalogue.");
  }
  if (input.reason.trim().length < 10) {
    throw new ApiError(422, "REASON_REQUIRED", "Provide a clear reason (at least 10 characters) for this access change.");
  }
  if (input.expiresAt) {
    const expiry = new Date(input.expiresAt).getTime();
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      throw new ApiError(422, "INVALID_EXPIRY", "Temporary access must expire in the future.");
    }
  }

  const scope = {
    scopeType: input.scopeType,
    branchId: input.branchId ?? null,
    department: input.department ?? null,
    recordType: input.recordType ?? null,
    recordId: input.recordId ?? null,
  };

  if (input.scopeType === "BRANCH") {
    if (!scope.branchId || !store.branches.some((branch) => branch.id === scope.branchId)) {
      throw new ApiError(422, "INVALID_SCOPE", "Select a valid branch for this grant.");
    }
  } else if (input.scopeType === "DEPARTMENT") {
    if (!scope.department) throw new ApiError(422, "INVALID_SCOPE", "Select a department for this grant.");
  } else if (input.scopeType === "RECORD") {
    if (!scope.recordType || !scope.recordId) {
      throw new ApiError(422, "INVALID_SCOPE", "Record grants need a record type and record ID.");
    }
    if (!recordExists(scope.recordType, scope.recordId)) {
      throw new ApiError(422, "RECORD_NOT_FOUND", "The referenced record does not exist.");
    }
    const branchId = recordBranch(scope.recordType, scope.recordId);
    if (branchId) scope.branchId = branchId;
  }

  if (!assertScopeWithinAuthority(actor.id, scope)) {
    throw new ApiError(403, "OUT_OF_SCOPE", "This grant scope exceeds your own authority.");
  }

  if (input.effect === "ALLOW") {
    assertAuthorityPermission(actor, input.permission);
    if (!isProtectedSuperAdmin(actor.id) && !hasPermission(actor.id, input.permission)) {
      throw new ApiError(
        403,
        "DELEGATION_EXCEEDED",
        "You cannot grant a permission you do not hold yourself.",
      );
    }
    if (input.mode === "DELEGATED") {
      assertAccessPermission(actor, "access:delegate");
      if (!isProtectedSuperAdmin(actor.id)) {
        if (wouldCreateDelegationCycle(actor.id, subject.id, input.permission)) {
          throw new ApiError(409, "DELEGATION_CYCLE", "This delegation would create a circular grant chain.");
        }
        const cap = earliestActorExpiry(actor, input.permission);
        if (cap) {
          if (!input.expiresAt) {
            throw new ApiError(422, "EXPIRY_REQUIRED", "Delegated access cannot outlive your own temporary grant.");
          }
          if (new Date(input.expiresAt).getTime() > new Date(cap).getTime()) {
            throw new ApiError(422, "EXPIRY_EXCEEDED", "Delegated access cannot outlive your own temporary grant.");
          }
        }
      }
    }
  } else {
    assertAuthorityPermission(actor, input.permission);
    if (!isProtectedSuperAdmin(actor.id) && getRoleRank(subject.role) >= getRoleRank(actor.role)) {
      throw new ApiError(403, "RANK_EXCEEDED", "You cannot restrict an account at or above your authority level.");
    }
    if (input.mode === "DELEGATED") {
      throw new ApiError(422, "INVALID_MODE", "Explicit restrictions must be direct, not delegated.");
    }
  }

  const duplicate = store.accessGrants.find(
    (grant) =>
      !grant.revokedAt &&
      grant.subjectId === subject.id &&
      grant.permission === input.permission &&
      grant.effect === input.effect &&
      grant.scopeType === input.scopeType &&
      grant.branchId === scope.branchId &&
      grant.department === scope.department &&
      grant.recordType === scope.recordType &&
      grant.recordId === scope.recordId &&
      (!grant.expiresAt || new Date(grant.expiresAt).getTime() > Date.now()),
  );
  if (duplicate) {
    throw new ApiError(409, "DUPLICATE_GRANT", "An equivalent active grant already exists for this user.");
  }

  const grant: AccessGrant = {
    id: `grant-${Math.random().toString(36).slice(2, 10)}`,
    subjectId: subject.id,
    permission: input.permission,
    effect: input.effect,
    scopeType: input.scopeType,
    branchId: scope.branchId,
    department: scope.department,
    recordType: scope.recordType,
    recordId: scope.recordId,
    mode: input.mode,
    reason: input.reason.trim(),
    grantedBy: actor.id,
    grantedAt: new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
    revokedBy: null,
    revokedAt: null,
    revokedReason: null,
  };
  store.accessGrants.unshift(grant);

  logPermissionChange({
    actorId: actor.id,
    actorRole: actor.role,
    targetType: "GRANT",
    targetId: grant.id,
    targetLabel: `${subject.name} · ${grant.permission} · ${grant.scopeType}${grant.recordId ? ` ${grant.recordId}` : ""}`,
    action: grant.effect === "DENY" ? "RESTRICTION_ADDED" : grant.mode === "DELEGATED" ? "GRANT_DELEGATED" : "GRANT_CREATED",
    before: [],
    after: [`${grant.effect}:${grant.permission}`],
    reason: grant.reason,
    expiresAt: grant.expiresAt,
    ip,
  });

  return grantView(grant);
}

export function revokeGrant(actor: SessionUser, grantId: string, reason: string, ip?: string): GrantView {
  assertAccessPermission(actor, "access:manage");
  if (reason.trim().length < 10) {
    throw new ApiError(422, "REASON_REQUIRED", "Explain why this grant is being revoked (at least 10 characters).");
  }
  const store = getStore();
  const grant = store.accessGrants.find((item) => item.id === grantId);
  if (!grant) throw new ApiError(404, "GRANT_NOT_FOUND", "This grant no longer exists.");
  if (grant.revokedAt) throw new ApiError(409, "ALREADY_REVOKED", "This grant has already been revoked.");
  const subject = findUser(grant.subjectId);
  assertTargetWithinAuthority(actor, subject);
  assertAuthorityPermission(actor, grant.permission);

  if (!isProtectedSuperAdmin(actor.id) && grant.grantedBy !== actor.id) {
    throw new ApiError(403, "FORBIDDEN", "Only the grantor or the protected Super Admin can revoke this grant.");
  }

  grant.revokedBy = actor.id;
  grant.revokedAt = new Date().toISOString();
  grant.revokedReason = reason.trim();

  logPermissionChange({
    actorId: actor.id,
    actorRole: actor.role,
    targetType: "GRANT",
    targetId: grant.id,
    targetLabel: `${subject.name} · ${grant.permission} · ${grant.scopeType}`,
    action: "GRANT_REVOKED",
    before: [`${grant.effect}:${grant.permission}`],
    after: [],
    reason: grant.revokedReason,
    expiresAt: grant.expiresAt,
    ip,
  });

  return grantView(grant);
}

export function updateRoleDefinition(
  actor: SessionUser,
  roleCode: string,
  input: RoleUpdateInput,
  ip?: string,
): RoleDefinition {
  assertAccessPermission(actor, "roles:manage");
  const store = getStore();
  const role = store.roles.find((item) => item.code === roleCode);
  if (!role) throw new ApiError(404, "ROLE_NOT_FOUND", "This role does not exist.");
  if (role.code === "SUPER_ADMIN" && !isProtectedSuperAdmin(actor.id)) {
    throw new ApiError(403, "PROTECTED_IDENTITY", "Only the protected Super Admin can change the Super Admin role.");
  }
  if (!isProtectedSuperAdmin(actor.id) && input.rank > getRoleRank(actor.role)) {
    throw new ApiError(403, "RANK_EXCEEDED", "Role rank cannot exceed your own authority level.");
  }
  if (input.isGlobal && !isProtectedSuperAdmin(actor.id)) {
    throw new ApiError(403, "ADMIN_AUTHORITY_SEPARATION", "Only the protected Super Admin can create global roles.");
  }

  const permissions = Array.from(new Set(input.permissions));
  const unknown = permissions.filter((permission) => !isKnownPermission(permission));
  if (unknown.length > 0) {
    throw new ApiError(422, "INVALID_PERMISSION", `Unknown permissions: ${unknown.join(", ")}`);
  }
  if (!isProtectedSuperAdmin(actor.id)) {
    const held = new Set(effectivePermissionsForUser(actor.id));
    const missing = permissions.filter((permission) => !held.has(permission));
    if (missing.length > 0) {
      throw new ApiError(
        403,
        "DELEGATION_EXCEEDED",
        `You cannot assign permissions you do not hold (${missing.slice(0, 3).join(", ")}).`,
      );
    }
  }
  if (role.code === "SUPER_ADMIN" && !permissions.includes("roles:manage")) {
    throw new ApiError(422, "PROTECTED_IDENTITY", "The Super Admin role must keep roles:manage.");
  }

  const before = [...role.permissions];
  role.name = input.name.trim();
  role.shortLabel = input.shortLabel.trim();
  role.description = input.description.trim();
  role.rank = input.rank;
  role.isGlobal = input.isGlobal;
  role.permissions = permissions;
  role.updatedAt = new Date().toISOString();

  logPermissionChange({
    actorId: actor.id,
    actorRole: actor.role,
    targetType: "ROLE",
    targetId: role.code,
    targetLabel: `${role.name} (${role.code})`,
    action: "ROLE_UPDATED",
    before,
    after: permissions,
    reason: "Role definition updated.",
    ip,
  });

  return { ...role, permissions: [...role.permissions] };
}

export function createRoleDefinition(actor: SessionUser, input: RoleCreateInput, ip?: string): RoleDefinition {
  assertAccessPermission(actor, "roles:manage");
  const store = getStore();
  if (!isProtectedSuperAdmin(actor.id) && input.rank > getRoleRank(actor.role)) {
    throw new ApiError(403, "RANK_EXCEEDED", "Role rank cannot exceed your own authority level.");
  }
  if (input.isGlobal && !isProtectedSuperAdmin(actor.id)) {
    throw new ApiError(403, "ADMIN_AUTHORITY_SEPARATION", "Only the protected Super Admin can create global roles.");
  }
  const code =
    input.code?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") ||
    input.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!code) throw new ApiError(422, "INVALID_CODE", "Provide a role name that produces a valid code.");
  if (store.roles.some((role) => role.code === code)) {
    throw new ApiError(409, "ROLE_EXISTS", "A role with this code already exists.");
  }
  const permissions = Array.from(new Set(input.permissions));
  const unknown = permissions.filter((permission) => !isKnownPermission(permission));
  if (unknown.length > 0) {
    throw new ApiError(422, "INVALID_PERMISSION", `Unknown permissions: ${unknown.join(", ")}`);
  }
  if (!isProtectedSuperAdmin(actor.id)) {
    const held = new Set(effectivePermissionsForUser(actor.id));
    const missing = permissions.filter((permission) => !held.has(permission));
    if (missing.length > 0) {
      throw new ApiError(403, "DELEGATION_EXCEEDED", "You cannot create a role with permissions you do not hold.");
    }
  }

  const now = new Date().toISOString();
  const role: RoleDefinition = {
    code,
    name: input.name.trim(),
    shortLabel: input.shortLabel.trim(),
    description: input.description.trim(),
    rank: input.rank,
    isSystem: false,
    isGlobal: input.isGlobal,
    permissions,
    createdAt: now,
    updatedAt: now,
  };
  store.roles.push(role);

  logPermissionChange({
    actorId: actor.id,
    actorRole: actor.role,
    targetType: "ROLE",
    targetId: role.code,
    targetLabel: `${role.name} (${role.code})`,
    action: "ROLE_CREATED",
    before: [],
    after: permissions,
    reason: "Custom role created.",
    ip,
  });

  return { ...role, permissions: [...role.permissions] };
}

export type UserScopeInput = {
  branchIds: string[];
  department: string;
  recordAccess: "BRANCH" | "ASSIGNED";
  reason: string;
};

export function updateUserScope(
  actor: SessionUser,
  userId: string,
  input: UserScopeInput,
  ip?: string,
): AccessUserSummary {
  assertAccessPermission(actor, "access:manage");
  if (input.reason.trim().length < 10) {
    throw new ApiError(422, "REASON_REQUIRED", "Explain the scope change (at least 10 characters).");
  }
  const store = getStore();
  const target = findUser(userId);
  assertTargetWithinAuthority(actor, target);

  const branchIds = Array.from(new Set(input.branchIds));
  if (branchIds.length === 0) {
    throw new ApiError(422, "INVALID_SCOPE", "Assign at least one branch.");
  }
  branchIds.forEach((branchId) => {
    if (!store.branches.some((branch) => branch.id === branchId)) {
      throw new ApiError(422, "INVALID_BRANCH", "One of the selected branches does not exist.");
    }
    if (!assertScopeWithinAuthority(actor.id, { scopeType: "BRANCH", branchId })) {
      throw new ApiError(403, "OUT_OF_SCOPE", "You cannot assign a branch outside your own scope.");
    }
  });
  if (
    !isProtectedSuperAdmin(actor.id) &&
    !roleIsGlobal(actor.role) &&
    input.department !== actor.department
  ) {
    throw new ApiError(403, "OUT_OF_SCOPE", "You cannot move a user into another department.");
  }
  if (!input.department.trim()) {
    throw new ApiError(422, "INVALID_SCOPE", "Select a department.");
  }

  const before = [
    `branches:${target.branchIds.join(",")}`,
    `department:${target.department}`,
    `recordAccess:${target.recordAccess}`,
  ];
  target.branchIds = branchIds;
  target.branchId = branchIds[0];
  target.department = input.department.trim();
  target.recordAccess = input.recordAccess;

  logPermissionChange({
    actorId: actor.id,
    actorRole: actor.role,
    targetType: "USER",
    targetId: target.id,
    targetLabel: `${target.name} · scope updated`,
    action: "SCOPE_UPDATED",
    before,
    after: [
      `branches:${target.branchIds.join(",")}`,
      `department:${target.department}`,
      `recordAccess:${target.recordAccess}`,
    ],
    reason: input.reason.trim(),
    ip,
  });

  return userSummary(target, actor);
}

export function getPermissionHistory(actor: SessionUser, targetId?: string): AuditView[] {
  assertAccessPermission(actor, "access:view");
  const store = getStore();
  const visibleIds = new Set(
    store.users.filter((user) => visibleUser(actor, user)).map((user) => user.id),
  );
  return store.permissionAudits
    .filter((entry) => (targetId ? entry.targetId === targetId : true))
    .filter((entry) => {
      if (isProtectedSuperAdmin(actor.id) || roleIsGlobal(actor.role)) return true;
      if (visibleIds.has(entry.targetId)) return true;
      const grant = store.accessGrants.find((item) => item.id === entry.targetId);
      return Boolean(grant && visibleIds.has(grant.subjectId));
    })
    .slice(0, 200)
    .map(auditView);
}

export function permissionModules() {
  return Array.from(new Set(ALL_PERMISSIONS.map((permission) => permission.split(":")[0]))).map((module) => ({
    module,
    permissions: ALL_PERMISSIONS.filter((permission) => permission.startsWith(`${module}:`)),
  }));
}
