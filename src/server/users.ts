import { scryptSync } from "node:crypto";
import { z } from "zod";
import type { Branch, RoleCode, Scope, SessionUser, UserRecord } from "@/lib/types";
import { ROLE_CODES } from "@/lib/rbac";
import { DEMO_PASSWORD } from "./seed";
import { appendAudit, getStore, makeId } from "./store";
import { ApiError, assertBranchScope, inScope } from "./access";
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

const ROLE_VALUES = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH_MANAGER",
  "LOAN_OFFICER",
  "CREDIT_OFFICER",
  "COLLECTION_OFFICER",
] as const;

export const userFieldsSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name (at least 2 characters).").max(80, "Name is too long."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{8,16}$/, "Enter a valid phone number (digits, spaces, +, -)."),
  role: z.enum(ROLE_VALUES, { message: "Select a valid role." }),
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
  if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Only a Super Admin can modify Super Admin accounts.");
  }
}

function assertCanAssignRole(actor: SessionUser, role: RoleCode) {
  if (role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Only a Super Admin can grant the Super Admin role.");
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
  assertCanAssignRole(actor, input.role);
  assertEmailAvailable(input.email, record.id);

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

  appendAudit(
    store,
    actor.id,
    "USER_UPDATED",
    "User",
    record.id,
    `Updated ${record.name}: ${changes.join(", ")}.`,
  );

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

  return toDirectoryUser(record, actor.id);
}

export function roleCodes(): RoleCode[] {
  return ROLE_CODES;
}
