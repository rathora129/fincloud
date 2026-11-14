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
  "access:view",
  "access:manage",
  "access:delegate",
  "roles:manage",
];

const OPERATIONAL_PERMISSIONS = ALL_PERMISSIONS.filter((permission) => permission !== "roles:manage");

export const DEFAULT_ROLES: RoleDefinitionSeed[] = [
  {
    code: "SUPER_ADMIN",
    name: "Super Admin",
    shortLabel: "Super Admin",
    description: "Protected system authority over roles, access, operations and audit.",
    permissions: ALL_PERMISSIONS,
    rank: 100,
    isSystem: true,
    isGlobal: true,
  },
  {
    code: "ADMIN",
    name: "Admin",
    shortLabel: "Admin",
    description: "Cross-branch operations, approvals, delegation and reporting.",
    permissions: OPERATIONAL_PERMISSIONS,
    rank: 90,
    isSystem: true,
    isGlobal: true,
  },
  {
    code: "BRANCH_MANAGER",
    name: "Branch Manager",
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
    rank: 60,
    isSystem: true,
    isGlobal: false,
  },
  {
    code: "TEAM_LEADER",
    name: "Team Leader",
    shortLabel: "Team Lead",
    description: "Leads a sourcing pod, assigns work and monitors pipeline quality.",
    permissions: [
      "dashboard:view",
      "leads:view",
      "leads:manage",
      "leads:assign",
      "applications:view",
      "applications:manage",
      "sanctions:view",
      "disbursements:view",
      "collections:view",
      "tasks:view",
      "tasks:manage",
      "customers:view",
      "reports:view",
    ],
    rank: 55,
    isSystem: false,
    isGlobal: false,
  },
  {
    code: "SENIOR_LOAN_OFFICER",
    name: "Senior Loan Officer",
    shortLabel: "Sr. Officer",
    description: "Handles complex files and can assign work within the branch.",
    permissions: [
      "dashboard:view",
      "leads:view",
      "leads:manage",
      "leads:assign",
      "applications:view",
      "applications:manage",
      "sanctions:view",
      "disbursements:view",
      "tasks:view",
      "tasks:manage",
      "customers:view",
      "reports:view",
    ],
    rank: 40,
    isSystem: false,
    isGlobal: false,
  },
  {
    code: "LOAN_OFFICER",
    name: "Loan Officer",
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
    rank: 35,
    isSystem: true,
    isGlobal: false,
  },
  {
    code: "JUNIOR_LOAN_OFFICER",
    name: "Junior Loan Officer",
    shortLabel: "Jr. Officer",
    description: "Files applications and coordinates documents under supervision.",
    permissions: [
      "dashboard:view",
      "leads:view",
      "applications:view",
      "applications:manage",
      "tasks:view",
      "tasks:manage",
      "customers:view",
    ],
    rank: 25,
    isSystem: false,
    isGlobal: false,
  },
  {
    code: "CREDIT_MANAGER",
    name: "Credit Manager",
    shortLabel: "Credit Mgr",
    description: "Owns credit policy, decisions and sanction approvals.",
    permissions: [
      "dashboard:view",
      "leads:view",
      "applications:view",
      "credit:view",
      "credit:decide",
      "sanctions:view",
      "sanctions:decide",
      "tasks:view",
      "tasks:manage",
      "customers:view",
      "reports:view",
      "reports:export",
    ],
    rank: 55,
    isSystem: false,
    isGlobal: false,
  },
  {
    code: "CREDIT_OFFICER",
    name: "Credit Officer",
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
    rank: 35,
    isSystem: true,
    isGlobal: false,
  },
  {
    code: "COLLECTION_MANAGER",
    name: "Collection Manager",
    shortLabel: "Collections Mgr",
    description: "Runs recovery strategy, agency escalations and collection MIS.",
    permissions: [
      "dashboard:view",
      "collections:view",
      "collections:manage",
      "tasks:view",
      "tasks:manage",
      "authorizations:view",
      "authorizations:approve",
      "customers:view",
      "reports:view",
      "reports:export",
    ],
    rank: 55,
    isSystem: false,
    isGlobal: false,
  },
  {
    code: "COLLECTION_OFFICER",
    name: "Collection Officer",
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
    rank: 30,
    isSystem: true,
    isGlobal: false,
  },
  {
    code: "ACCOUNTS_OFFICER",
    name: "Accounts Officer",
    shortLabel: "Accounts",
    description: "Processes payouts, reconciles disbursements and exports finance MIS.",
    permissions: [
      "dashboard:view",
      "disbursements:view",
      "disbursements:process",
      "tasks:view",
      "tasks:manage",
      "customers:view",
      "reports:view",
      "reports:export",
    ],
    rank: 35,
    isSystem: false,
    isGlobal: false,
  },
  {
    code: "MIS_EXECUTIVE",
    name: "MIS Executive",
    shortLabel: "MIS",
    description: "Builds and exports portfolio, productivity and collection reporting.",
    permissions: [
      "dashboard:view",
      "customers:view",
      "reports:view",
      "reports:export",
      "tasks:view",
    ],
    rank: 30,
    isSystem: false,
    isGlobal: false,
  },
];

type RoleDefinitionSeed = {
  code: RoleCode;
  name: string;
  shortLabel: string;
  description: string;
  permissions: Permission[];
  rank: number;
  isSystem: boolean;
  isGlobal: boolean;
};

export const ROLE_DEFINITIONS = Object.fromEntries(
  DEFAULT_ROLES.map((role) => [role.code, role]),
) as Record<string, RoleDefinitionSeed>;

export const ROLE_CODES = DEFAULT_ROLES.map((role) => role.code);

export const GLOBAL_ROLES: RoleCode[] = DEFAULT_ROLES.filter((role) => role.isGlobal).map((role) => role.code);

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
  return DEFAULT_ROLES.find((item) => item.code === role)?.isGlobal ?? false;
}
