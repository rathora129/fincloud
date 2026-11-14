import {
  ALL_PERMISSIONS,
} from "@/lib/rbac";
import type {
  AccessContext,
  AccessGrant,
  EffectivePermission,
  GrantSource,
  Permission,
  RecordType,
  RoleDefinition,
  SessionUser,
  UserRecord,
} from "@/lib/types";
import { getStore } from "./store";

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isKnownPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export function getRoleDefinition(roleCode: string): RoleDefinition | null {
  return getStore().roles.find((role) => role.code === roleCode) ?? null;
}

export function getRoleRank(roleCode: string): number {
  return getRoleDefinition(roleCode)?.rank ?? 0;
}

export function roleIsGlobal(roleCode: string): boolean {
  return getRoleDefinition(roleCode)?.isGlobal ?? false;
}

export function getProtectedUser(): UserRecord | null {
  const store = getStore();
  const user = store.users.find((item) => item.id === store.security.protectedSuperAdminId) ?? null;
  return user && user.status === "ACTIVE" ? user : null;
}

/** The bypass is deliberately tied to one protected, active identity — never to a role name alone. */
export function isProtectedSuperAdmin(userId: string): boolean {
  const store = getStore();
  const user = store.users.find((item) => item.id === userId);
  return Boolean(
    user &&
      user.id === store.security.protectedSuperAdminId &&
      user.role === "SUPER_ADMIN" &&
      user.status === "ACTIVE",
  );
}

export function isProtectedIdentity(userId: string): boolean {
  return getStore().security.protectedSuperAdminId === userId;
}

export function activeGrantsFor(subjectId: string, at = Date.now()): AccessGrant[] {
  return getStore().accessGrants.filter(
    (grant) =>
      grant.subjectId === subjectId &&
      !grant.revokedAt &&
      (!grant.expiresAt || new Date(grant.expiresAt).getTime() > at),
  );
}

function grantApplies(grant: AccessGrant, context: AccessContext | undefined): boolean {
  if (grant.scopeType === "GLOBAL") return true;
  if (grant.scopeType === "BRANCH") {
    return context?.branchId ? grant.branchId === context.branchId : true;
  }
  if (grant.scopeType === "DEPARTMENT") {
    return context?.department ? grant.department === context.department : true;
  }
  if (grant.scopeType === "RECORD") {
    return Boolean(
      context?.recordType &&
        context.recordId &&
        grant.recordType === context.recordType &&
        grant.recordId === context.recordId,
    );
  }
  return false;
}

function grantSource(grant: AccessGrant): GrantSource {
  if (grant.scopeType === "RECORD") {
    return {
      kind: "RECORD",
      label: `${grant.recordType} ${grant.recordId}`,
      grantId: grant.id,
      expiresAt: grant.expiresAt,
      recordType: grant.recordType ?? undefined,
      recordId: grant.recordId ?? undefined,
    };
  }
  if (grant.scopeType === "BRANCH") {
    return {
      kind: "BRANCH",
      label: grant.branchId ?? "Branch",
      grantId: grant.id,
      expiresAt: grant.expiresAt,
    };
  }
  if (grant.scopeType === "DEPARTMENT") {
    return {
      kind: "DEPARTMENT",
      label: grant.department ?? "Department",
      grantId: grant.id,
      expiresAt: grant.expiresAt,
    };
  }
  return {
    kind: grant.mode === "DELEGATED" ? "USER" : "USER",
    label: grant.mode === "DELEGATED" ? "Delegated grant" : "Direct grant",
    grantId: grant.id,
    expiresAt: grant.expiresAt,
  };
}

export function evaluatePermission(
  user: UserRecord,
  permission: Permission,
  context?: AccessContext,
): EffectivePermission {
  const empty: EffectivePermission = { permission, allowed: false, sources: [], deniedBy: [] };
  if (!user || user.status !== "ACTIVE" || !isKnownPermission(permission)) return empty;

  if (isProtectedSuperAdmin(user.id)) {
    return {
      permission,
      allowed: true,
      sources: [{ kind: "SUPER_ADMIN", label: "Protected Super Admin bypass" }],
      deniedBy: [],
    };
  }

  const role = getRoleDefinition(user.role);
  if (!role) return empty;

  const grants = activeGrantsFor(user.id).filter(
    (grant) => grant.permission === permission && grantApplies(grant, context),
  );

  const deniedBy = grants.filter((grant) => grant.effect === "DENY").map(grantSource);
  if (deniedBy.length > 0) return { permission, allowed: false, sources: [], deniedBy };

  const sources: GrantSource[] = [];
  if (role.permissions.includes(permission)) {
    sources.push({ kind: "ROLE", label: role.name });
  }
  grants
    .filter((grant) => grant.effect === "ALLOW")
    .forEach((grant) => sources.push(grantSource(grant)));

  return { permission, allowed: sources.length > 0, sources, deniedBy: [] };
}

export function evaluateAllPermissions(user: UserRecord, context?: AccessContext): EffectivePermission[] {
  return ALL_PERMISSIONS.map((permission) => evaluatePermission(user, permission, context));
}

export function effectivePermissionsForUser(userId: string, context?: AccessContext): Permission[] {
  try {
    const user = getStore().users.find((item) => item.id === userId);
    if (!user || user.status !== "ACTIVE") return [];
    return evaluateAllPermissions(user, context)
      .filter((entry) => entry.allowed)
      .map((entry) => entry.permission);
  } catch {
    return [];
  }
}

/** Fail closed: any evaluation error means denied. */
export function hasPermission(userId: string, permission: Permission, context?: AccessContext): boolean {
  try {
    const user = getStore().users.find((item) => item.id === userId);
    if (!user || user.status !== "ACTIVE") return false;
    return evaluatePermission(user, permission, context).allowed;
  } catch {
    return false;
  }
}

export function hasPermissionForSession(
  user: SessionUser,
  permission: Permission,
  context?: AccessContext,
): boolean {
  return hasPermission(user.id, permission, context);
}

export function canAccessRecord(
  userId: string,
  recordType: RecordType,
  recordId: string,
  permission: Permission,
  branchId?: string,
  ownerId?: string,
): boolean {
  try {
    const store = getStore();
    const user = store.users.find((item) => item.id === userId);
    if (!user || user.status !== "ACTIVE") return false;

    if (isProtectedSuperAdmin(user.id)) return true;

    const context: AccessContext = { branchId, recordType, recordId };
    const evaluation = evaluatePermission(user, permission, context);
    if (!evaluation.allowed || evaluation.deniedBy.length > 0) return false;

    const role = getRoleDefinition(user.role);
    if (role?.isGlobal) return true;

    const hasScopedAllow = activeGrantsFor(user.id).some(
      (grant) =>
        grant.permission === permission &&
        grant.effect === "ALLOW" &&
        ((grant.scopeType === "RECORD" &&
          grant.recordType === recordType &&
          grant.recordId === recordId) ||
          (grant.scopeType === "BRANCH" && branchId && grant.branchId === branchId) ||
          (grant.scopeType === "DEPARTMENT" && grant.department === user.department)),
    );

    if (branchId && user.branchIds.includes(branchId)) {
      if (user.recordAccess === "ASSIGNED" && ownerId !== user.id) return hasScopedAllow;
      return true;
    }
    return hasScopedAllow;
  } catch {
    return false;
  }
}

export function recordFilter<T extends { id: string; branchId: string }>(
  userId: string,
  recordType: RecordType,
  permission: Permission,
  ownerOf?: (record: T) => string | null | undefined,
) {
  return (record: T) =>
    canAccessRecord(userId, recordType, record.id, permission, record.branchId, ownerOf?.(record) ?? undefined);
}

export function assertScopeWithinAuthority(
  actorId: string,
  scope: {
    scopeType: AccessGrant["scopeType"];
    branchId?: string | null;
    department?: string | null;
    recordType?: RecordType | null;
    recordId?: string | null;
  },
) {
  const store = getStore();
  const actor = store.users.find((item) => item.id === actorId);
  if (!actor) return false;
  if (isProtectedSuperAdmin(actor.id)) return true;
  const role = getRoleDefinition(actor.role);
  if (scope.scopeType === "GLOBAL") return role?.isGlobal === true;
  if (scope.scopeType === "BRANCH") return Boolean(scope.branchId && actor.branchIds.includes(scope.branchId));
  if (scope.scopeType === "DEPARTMENT") return Boolean(scope.department && actor.department === scope.department);
  if (scope.scopeType === "RECORD") {
    if (!scope.recordType || !scope.recordId) return false;
    return canAccessRecord(actor.id, scope.recordType, scope.recordId, "access:view");
  }
  return false;
}

/** Detect grantor -> recipient cycles across active delegation grants for the same permission. */
export function wouldCreateDelegationCycle(grantorId: string, recipientId: string, permission: Permission) {
  if (grantorId === recipientId) return true;
  const grants = getStore().accessGrants.filter(
    (grant) =>
      !grant.revokedAt &&
      (!grant.expiresAt || new Date(grant.expiresAt).getTime() > Date.now()) &&
      grant.permission === permission &&
      grant.effect === "ALLOW",
  );
  const children = new Map<string, string[]>();
  grants.forEach((grant) => {
    const list = children.get(grant.grantedBy) ?? [];
    list.push(grant.subjectId);
    children.set(grant.grantedBy, list);
  });
  const visited = new Set<string>();
  const stack = [recipientId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === grantorId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    (children.get(current) ?? []).forEach((child) => stack.push(child));
  }
  return false;
}

export function permissionCatalogue() {
  return ALL_PERMISSIONS;
}
