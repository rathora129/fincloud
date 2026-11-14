import { z } from "zod";

const RECORD_TYPES = [
  "CUSTOMER",
  "LEAD",
  "APPLICATION",
  "SANCTION",
  "LOAN",
  "DISBURSEMENT",
  "COLLECTION",
  "TASK",
  "BRANCH",
  "DEPARTMENT",
  "ORGANIZATION",
] as const;

const isoOrEmpty = z
  .string()
  .trim()
  .refine((value) => value === "" || !Number.isNaN(new Date(value).getTime()), "Enter a valid date and time.")
  .optional()
  .nullable();

export const grantSchema = z.object({
  subjectId: z.string().trim().min(1, "Select a user."),
  permission: z.string().trim().min(1, "Select a permission."),
  effect: z.enum(["ALLOW", "DENY"]),
  scopeType: z.enum(["GLOBAL", "BRANCH", "DEPARTMENT", "RECORD"]),
  branchId: z.string().trim().optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  recordType: z.enum(RECORD_TYPES).optional().nullable(),
  recordId: z.string().trim().max(120).optional().nullable(),
  mode: z.enum(["DIRECT", "DELEGATED"]),
  reason: z.string().trim().min(10, "Provide a reason of at least 10 characters.").max(300, "Reason is too long."),
  expiresAt: isoOrEmpty,
});

export const revokeGrantSchema = z.object({
  reason: z.string().trim().min(10, "Provide a reason of at least 10 characters.").max(300, "Reason is too long."),
});

export const userScopeSchema = z.object({
  branchIds: z.array(z.string().trim().min(1)).min(1, "Assign at least one branch."),
  department: z.string().trim().min(2, "Select a department.").max(80),
  recordAccess: z.enum(["BRANCH", "ASSIGNED"]),
  reason: z.string().trim().min(10, "Provide a reason of at least 10 characters.").max(300, "Reason is too long."),
});

const roleFields = z.object({
  name: z.string().trim().min(2, "Enter a role name.").max(60, "Role name is too long."),
  shortLabel: z.string().trim().min(2, "Enter a short label.").max(18, "Short label is too long."),
  description: z.string().trim().min(10, "Describe the role.").max(240, "Description is too long."),
  rank: z.number().int().min(1, "Rank must be at least 1.").max(100, "Rank cannot exceed 100."),
  isGlobal: z.boolean(),
  permissions: z.array(z.string()).min(1, "Select at least one permission."),
});

export const roleUpdateSchema = roleFields;
export const roleCreateSchema = roleFields.extend({
  code: z.string().trim().max(48).optional(),
});

export type GrantPayload = z.infer<typeof grantSchema>;
export type RoleUpdatePayload = z.infer<typeof roleUpdateSchema>;
export type RoleCreatePayload = z.infer<typeof roleCreateSchema>;
