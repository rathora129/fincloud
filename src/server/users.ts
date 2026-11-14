import { scryptSync } from "node:crypto";
import { z } from "zod";
import type { Branch, RoleCode, Scope, SessionUser, UserRecord } from "@/lib/types";
import { DEMO_PASSWORD, departmentForRole } from "./seed";
import { appendAudit, getStore, makeId } from "./store";
import { ApiError, assertBranchScope, inScope } from "./access";
import { effectivePermissionsForUser, getRoleDefinition, getRoleRank, isProtectedIdentity } from "./permissions";
import { logPermissionChange } from "./access-log";
import { matchesText, sortBy } from "./query";

/** A user record with the password hash stripped. Never ship hashes to the client. */
export type DirectoryUser = Omit<UserRecord, "passwordHash"> & {
  branchName: string;
  isSelf: boolean;
};

export type UserListFilters = {
  q?: string;
  role?: RoleCode | "";
  status?: "ACTIVE" | "INACTIVE" | "";
  branchId?: string;
};

export type UserDirectory = {
  items: DirectoryUser[];
  branches: Branch[];
  summary: {
    total: number;
    active: number;
    inactive: number;
    selfId: string;
  };
};

export const userFieldsSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name (at least 2 characters).").max(80, "Name is too long."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{8,16}$/, "Enter a valid phone number (digits, spaces, +, -)."),
  role: z.string().trim().min(1, "Select a valid role."),
  designation: z.string().trim().min(2, "Enter a designation.").max(60, "Designation is too long."),
  branchId: z.string().trim().min(1, "Select a branch."),
});

export const createUserSchema = userFieldsSchema;

export const updateUserSchema = z.discriminatedUnion("action", [
  userFieldsSchema.extend({ action: z.literal("UPDATE") }),
  z.object({
    action: z.literal("SET_STATUS"),
    status: z.enum(["ACTIVE", "INACTIVE"], { message: "Select a valid status." }),
  }),
]);

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

const AVATAR_COLORS = ["#0f766e", "#0e7490", "#4338ca", "#7c3aed", "#b45309", "#be123c", "#15803d", "#0369a1"];

export function hashDemoPassword(password = DEMO_PASSWORD) {
  return scryptSync(password, "fincloud-demo-salt", 64).toString("hex");
}

function toDirectoryUser(record: UserRecord, viewerId: string): DirectoryUser {
  const store = getStore();
  const branch = store.branches.find((b) => b.id === record.branchId);
  const { passwordHash: _passwordHash, ...safe } = record;
  return {
    ...safe,
    branchName: branch?.name ?? "Unassigned",
    isSelf: record.id === viewerId,
  };
}

export function listUsers(scope: Scope, filters: UserListFilters = {}): UserDirectory {
  const store = getStore();
  const scopedBranch = scope.isGlobal ? filters.branchId : scope.user.branchId;

  const items = sortBy(
    store.users
      .filter((user) => inScope(scope, user.branchId))
      .filter((user) => (scopedBranch ? user.branchId === scopedBranch : true))
      .filter((user) => (filters.role ? user.role === filters.role : true))
      .filter((user) => (filters.status ? user.status === filters.status : true))
      .filter((user) => matchesText(filters.q, [user.name, user.email, user.phone, user.designation, user.id]))
      .map((user) => toDirectoryUser(user, scope.user.id)),
    (user) => user.name,
    "asc",
  );

  const all = store.users.filter((user) => inScope(scope, user.branchId));

  return {
    items,
    branches: store.branches.filter((branch) => inScope(scope, branch.id)),
    summary: {
      total: all.length,
      active: all.filter((user) => user.status === "ACTIVE").length,
      inactive: all.filter((user) => user.status === "INACTIVE").length,
      selfId: scope.user.id,
    },
  };
}

export function getUserById(scope: Scope, id: string): DirectoryUser {
  const store = getStore();
  const record = store.users.find((user) => user.id === id);
  if (!record) throw new ApiError(404, "NOT_FOUND", "This user no longer exists.");
  assertBranchScope(scope, record.branchId);
  return toDirectoryUser(record, scope.user.id);
}

function findRecord(id: string): UserRecord {
  const store = getStore();
  const record = store.users.find((user) => user.id === id);
  if (!record) throw new ApiError(404, "NOT_FOUND", "This user no longer exists.");
  return record;
}

function assertCanManageTarget(actor: SessionUser, target: UserRecord) {
  if (isProtectedIdentity(target.id)) {
    throw new ApiError(
      403,
      "PROTECTED_IDENTITY",
      "The protected Super Admin identity is locked. Use a separate delegated grant record instead of changing it.",
    );
  }
  if (target.id === actor.id) return;
  if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Only a Super Admin can modify Super Admin accounts.");
  }
  if (!isProtectedIdentity(actor.id) && getRoleRank(target.role) >= getRoleRank(actor.role)) {
    throw new ApiError(403, "RANK_EXCEEDED", "You cannot modify an account at or above your own authority level.");
  }
}

function assertCanAssignRole(actor: SessionUser, role: RoleCode) {
  const targetRole = getRoleDefinition(role);
  if (!targetRole) {
    throw new ApiError(422, "INVALID_ROLE", "Select a configured role.");
  }
  if (isProtectedIdentity(actor.id)) return;
  if (targetRole.code === "SUPER_ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Only the protected Super Admin can grant the Super Admin role.");
  }
  if (targetRole.rank > getRoleRank(actor.role)) {
    throw new ApiError(403, "RANK_EXCEEDED", "You cannot assign a role with higher authority than your own.");
  }
  const held = new Set(effectivePermissionsForUser(actor.id));
  const missing = targetRole.permissions.filter((permission) => !held.has(permission));
  if (missing.length > 0) {
    throw new ApiError(
      403,
      "DELEGATION_EXCEEDED",
      `You cannot assign a role containing permissions you do not hold (${missing.slice(0, 3).join(", ")}).`,
    );
  }
}

function assertBranchExists(branchId: string) {
  const store = getStore();
  if (!store.branches.some((branch) => branch.id === branchId)) {
    throw new ApiError(422, "INVALID_BRANCH", "Select a valid branch.");
  }
}

function assertEmailAvailable(email: string, exceptId?: string) {
  const store = getStore();
  const clash = store.users.find(
    (user) => user.id !== exceptId && user.email.toLowerCase() === email.toLowerCase(),
  );
  if (clash) {
    throw new ApiError(409, "EMAIL_TAKEN", "This email is already used by another team member.");
  }
}

export function createUserRecord(actor: SessionUser, scope: Scope, input: CreateUserInput): DirectoryUser {
  const store = getStore();
  assertBranchScope(scope, input.branchId);
  assertBranchExists(input.branchId);
  assertCanAssignRole(actor, input.role);
  assertEmailAvailable(input.email);

  const record: UserRecord = {
    id: makeId("usr"),
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    role: input.role,
    designation: input.designation,
    branchId: input.branchId,
    branchIds: [input.branchId],
    department: departmentForRole(input.role),
    recordAccess: "BRANCH",
    status: "ACTIVE",
    avatarColor: AVATAR_COLORS[store.users.length % AVATAR_COLORS.length],
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    passwordHash: hashDemoPassword(),
  };
  store.users.push(record);

  appendAudit(
    store,
    actor.id,
    "USER_CREATED",
    "User",
    record.id,
    `Created ${record.name} (${record.role.replaceAll("_", " ")}) in ${input.branchId} with the demo password.`,
  );
  logPermissionChange({
    actorId: actor.id,
    actorRole: actor.role,
    targetType: "USER",
    targetId: record.id,
    targetLabel: `${record.name} · ${record.role}`,
    action: "USER_CREATED",
    before: [],
    after: getRoleDefinition(record.role)?.permissions ?? [],
    reason: "User account created with role assignment.",
  });

  return toDirectoryUser(record, actor.id);
}

export function updateUserRecord(
  actor: SessionUser,
  scope: Scope,
  targetId: string,
  input: Omit<Extract<UpdateUserInput, { action: "UPDATE" }>, "action">,
): DirectoryUser {
  const store = getStore();
  const record = findRecord(targetId);
  assertBranchScope(scope, record.branchId);
  assertBranchScope(scope, input.branchId);
  assertBranchExists(input.branchId);
  assertCanManageTarget(actor, record);
  if (record.id === actor.id && input.role !== record.role) {
    throw new ApiError(403, "SELF_ROLE_CHANGE", "You cannot change your own role. Ask another authorized administrator.");
  }
  assertCanAssignRole(actor, input.role);
  assertEmailAvailable(input.email, record.id);

  const previousRole = record.role;
  const previousPermissions = getRoleDefinition(previousRole)?.permissions ?? [];
  const changes: string[] = [];
  if (record.name !== input.name) changes.push("name");
  if (record.email.toLowerCase() !== input.email.toLowerCase()) changes.push("email");
  if (record.phone !== input.phone) changes.push("phone");
  if (record.role !== input.role) changes.push(`role ${record.role} → ${input.role}`);
  if (record.designation !== input.designation) changes.push("designation");
  if (record.branchId !== input.branchId) changes.push("branch");
  if (changes.length === 0) {
    return toDirectoryUser(record, actor.id);
  }

  record.name = input.name;
  record.email = input.email.toLowerCase();
  record.phone = input.phone;
  record.role = input.role;
  record.designation = input.designation;
  record.branchId = input.branchId;
  record.branchIds = [input.branchId];
  record.department = departmentForRole(input.role);

  appendAudit(
    store,
    actor.id,
    "USER_UPDATED",
    "User",
    record.id,
    `Updated ${record.name}: ${changes.join(", ")}.`,
  );
  if (previousRole !== record.role) {
    logPermissionChange({
      actorId: actor.id,
      actorRole: actor.role,
      targetType: "USER",
      targetId: record.id,
      targetLabel: `${record.name} · ${previousRole} → ${record.role}`,
      action: "ROLE_CHANGED",
      before: previousPermissions,
      after: getRoleDefinition(record.role)?.permissions ?? [],
      reason: `Role reassigned from ${previousRole} to ${record.role}.`,
    });
  }

  return toDirectoryUser(record, actor.id);
}

export function setUserStatus(
  actor: SessionUser,
  scope: Scope,
  targetId: string,
  status: "ACTIVE" | "INACTIVE",
): DirectoryUser {
  const store = getStore();
  const record = findRecord(targetId);
  assertBranchScope(scope, record.branchId);
  assertCanManageTarget(actor, record);

  if (status === "INACTIVE" && record.id === actor.id) {
    throw new ApiError(422, "SELF_DEACTIVATION", "You cannot deactivate your own account.");
  }

  if (record.status === status) {
    return toDirectoryUser(record, actor.id);
  }

  record.status = status;
  appendAudit(
    store,
    actor.id,
    "USER_STATUS_CHANGED",
    "User",
    record.id,
    `${record.name} set to ${status === "ACTIVE" ? "active" : "inactive"}.`,
  );
  logPermissionChange({
    actorId: actor.id,
    actorRole: actor.role,
    targetType: "USER",
    targetId: record.id,
    targetLabel: `${record.name} · account ${status.toLowerCase()}`,
    action: "ACCOUNT_STATUS_CHANGED",
    before: [`status:${status === "ACTIVE" ? "INACTIVE" : "ACTIVE"}`],
    after: [`status:${status}`],
    reason: "Account status changed, which changes effective permissions immediately.",
  });

  return toDirectoryUser(record, actor.id);
}

export function roleCodes(): RoleCode[] {
  return getStore()
    .roles.slice()
    .sort((a, b) => b.rank - a.rank)
    .map((role) => role.code);
}
