import type { Permission, RoleCode, SessionUser } from "./types";

export const ALL_PERMISSIONS: Permission[] = [
  "dashboard:view",
  "leads:view",
  "leads:manage",
  "leads:assign",
  "applications:view",
  "applications:manage",
  "credit:view",
  "credit:decide",
  "sanctions:view",
  "sanctions:decide",
  "disbursements:view",
  "disbursements:process",
  "disbursements:approve",
  "collections:view",
  "collections:manage",
  "tasks:view",
  "tasks:manage",
  "authorizations:view",
  "authorizations:approve",
  "customers:view",
  "users:view",
  "users:manage",
  "reports:view",
  "reports:export",
  "audit:view",
  "operations:view",
  "operations:manage",
];

export const ROLE_DEFINITIONS: Record<
  RoleCode,
  { label: string; shortLabel: string; description: string; permissions: Permission[] }
> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    shortLabel: "Super Admin",
    description: "Full platform control including users, operations and audit.",
    permissions: ALL_PERMISSIONS,
  },
  ADMIN: {
    label: "Admin",
    shortLabel: "Admin",
    description: "Cross-branch operations, approvals and reporting.",
    permissions: ALL_PERMISSIONS,
  },
  BRANCH_MANAGER: {
    label: "Branch Manager",
    shortLabel: "Branch Mgr",
    description: "Owns branch pipeline, sanctions and collection performance.",
    permissions: [
      "dashboard:view",
      "leads:view",
      "leads:manage",
      "leads:assign",
      "applications:view",
      "applications:manage",
      "credit:view",
      "sanctions:view",
      "sanctions:decide",
      "disbursements:view",
      "disbursements:approve",
      "collections:view",
      "collections:manage",
      "tasks:view",
      "tasks:manage",
      "authorizations:view",
      "authorizations:approve",
      "customers:view",
      "users:view",
      "reports:view",
      "reports:export",
      "audit:view",
      "operations:view",
    ],
  },
  LOAN_OFFICER: {
    label: "Loan Officer",
    shortLabel: "Loan Officer",
    description: "Sources leads, files applications and coordinates follow-ups.",
    permissions: [
      "dashboard:view",
      "leads:view",
      "leads:manage",
      "applications:view",
      "applications:manage",
      "sanctions:view",
      "disbursements:view",
      "tasks:view",
      "tasks:manage",
      "customers:view",
      "reports:view",
    ],
  },
  CREDIT_OFFICER: {
    label: "Credit Officer",
    shortLabel: "Credit Officer",
    description: "Reviews applications, recommends decisions and manages credit risk.",
    permissions: [
      "dashboard:view",
      "leads:view",
      "applications:view",
      "credit:view",
      "credit:decide",
      "sanctions:view",
      "tasks:view",
      "tasks:manage",
      "customers:view",
      "reports:view",
    ],
  },
  COLLECTION_OFFICER: {
    label: "Collection Officer",
    shortLabel: "Collections",
    description: "Works overdue buckets, recovery follow-ups and field tasks.",
    permissions: [
      "dashboard:view",
      "collections:view",
      "collections:manage",
      "tasks:view",
      "tasks:manage",
      "customers:view",
      "reports:view",
    ],
  },
};

export const ROLE_CODES = Object.keys(ROLE_DEFINITIONS) as RoleCode[];

export const GLOBAL_ROLES: RoleCode[] = ["SUPER_ADMIN", "ADMIN"];

export function permissionsForRole(role: RoleCode): Permission[] {
  return ROLE_DEFINITIONS[role]?.permissions ?? [];
}

export function can(user: Pick<SessionUser, "permissions"> | null | undefined, permission: Permission) {
  return Boolean(user?.permissions.includes(permission));
}

export function hasAny(user: Pick<SessionUser, "permissions">, permissions: Permission[]) {
  return permissions.some((p) => user.permissions.includes(p));
}

export function isGlobalRole(role: RoleCode) {
  return GLOBAL_ROLES.includes(role);
}
