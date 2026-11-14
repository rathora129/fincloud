import type { Permission, Scope, SessionUser } from "@/lib/types";
import { isGlobalRole } from "@/lib/rbac";
import { getSessionUser } from "./session";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  return user;
}

export function assertPermission(user: SessionUser, permission: Permission) {
  if (!user.permissions.includes(permission)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
}

export function buildScope(user: SessionUser): Scope {
  const global = isGlobalRole(user.role);
  return { user, isGlobal: global, branchIds: global ? null : [user.branchId] };
}

export function inScope(scope: Scope, branchId: string) {
  return scope.isGlobal || scope.branchIds?.includes(branchId) === true;
}

export function assertBranchScope(scope: Scope, branchId: string) {
  if (!inScope(scope, branchId)) {
    throw new ApiError(403, "OUT_OF_SCOPE", "This record belongs to another branch.");
  }
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function isISODate(value: string | undefined) {
  return Boolean(value && !Number.isNaN(new Date(value).getTime()));
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error("[fincloud-api]", error);
  return Response.json(
    { error: { code: "INTERNAL", message: "Something went wrong. Please retry." } },
    { status: 500 },
  );
}
