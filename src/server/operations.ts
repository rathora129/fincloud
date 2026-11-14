import { z } from "zod";
import type { BlacklistEntry, ESignRequest, Grievance, Scope, SessionUser } from "@/lib/types";
import { appendAudit, getStore, makeId } from "./store";
import { ApiError, assertBranchScope, inScope } from "./access";
import { sortBy } from "./query";

export type EsignRow = ESignRequest & {
  applicationRef: string;
  customerName: string;
  branchName: string;
};

export type BlacklistRow = BlacklistEntry & { addedByName: string };

export type GrievanceRow = Grievance & {
  customerName: string;
  assigneeName: string;
  branchName: string;
};

export type OperationsData = {
  esign: EsignRow[];
  blacklist: BlacklistRow[];
  grievances: GrievanceRow[];
  counts: { esignPending: number; esignSigned: number; blacklistActive: number; grievancesOpen: number };
};

export function getOperationsData(scope: Scope): OperationsData {
  const store = getStore();
  const branchById = new Map(store.branches.map((branch) => [branch.id, branch]));
  const userById = new Map(store.users.map((user) => [user.id, user]));
  const appById = new Map(store.applications.map((app) => [app.id, app]));
  const customerById = new Map(store.customers.map((customer) => [customer.id, customer]));

  const esign = sortBy(
    store.esign
      .map((request) => {
        const app = appById.get(request.applicationId);
        if (!app || !inScope(scope, app.branchId)) return null;
        return {
          ...request,
          applicationRef: app.ref,
          customerName: customerById.get(request.customerId)?.name ?? "—",
          branchName: branchById.get(app.branchId)?.name ?? "Unassigned",
        } satisfies EsignRow;
      })
      .filter((row): row is EsignRow => row !== null),
    (row) => new Date(row.initiatedAt ?? 0).getTime(),
    "desc",
  );

  const blacklist = sortBy(
    store.blacklist
      .map((entry) => {
        const author = userById.get(entry.addedBy);
        if (!author || !inScope(scope, author.branchId)) return null;
        return { ...entry, addedByName: author.name } satisfies BlacklistRow;
      })
      .filter((row): row is BlacklistRow => row !== null),
    (row) => new Date(row.addedAt).getTime(),
    "desc",
  );

  const grievances = sortBy(
    store.grievances
      .filter((grievance) => inScope(scope, grievance.branchId))
      .map((grievance) => ({
        ...grievance,
        customerName: customerById.get(grievance.customerId)?.name ?? "—",
        assigneeName: userById.get(grievance.assignedTo)?.name ?? "Unassigned",
        branchName: branchById.get(grievance.branchId)?.name ?? "Unassigned",
      })),
    (grievance) => new Date(grievance.createdAt).getTime(),
    "desc",
  );

  return {
    esign,
    blacklist,
    grievances,
    counts: {
      esignPending: esign.filter((row) => ["NOT_INITIATED", "INITIATED"].includes(row.status)).length,
      esignSigned: esign.filter((row) => row.status === "SIGNED").length,
      blacklistActive: blacklist.filter((row) => row.status === "ACTIVE").length,
      grievancesOpen: grievances.filter((row) => row.status !== "RESOLVED").length,
    },
  };
}

export function maskPan(pan: string | undefined | null) {
  const clean = (pan ?? "").replace(/\s+/g, "").toUpperCase();
  if (clean.length < 3) return "••••";
  if (clean.length <= 6) return `${clean.slice(0, 2)}••••`;
  return `${clean.slice(0, 5)}••••${clean.slice(-1)}`;
}

export function maskPhone(phone: string | undefined | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "••••••";
  return `••••••${digits.slice(-4)}`;
}

export const BLACKLIST_SOURCES = ["Internal review", "Collections", "Credit", "Operations", "Branch"] as const;

export const blacklistInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the entity or customer name.").max(80, "Name is too long."),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value), {
      message: "Enter a valid PAN format (synthetic demo values only).",
    })
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(\+91[\s-]?)?[6-9][0-9]{9}$/, "Enter a valid 10-digit Indian mobile number."),
  reason: z.string().trim().min(8, "Describe the reason (at least 8 characters).").max(240, "Reason is too long."),
  source: z.enum(BLACKLIST_SOURCES, { message: "Select a valid source." }),
});

export type BlacklistInput = z.infer<typeof blacklistInputSchema>;

export function addBlacklistEntry(scope: Scope, actor: SessionUser, input: BlacklistInput): BlacklistRow {
  const store = getStore();

  if (input.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(input.pan)) {
    throw new ApiError(422, "INVALID_PAN", "Enter a valid PAN format.");
  }

  const duplicate = store.blacklist.find(
    (entry) => entry.name.toLowerCase() === input.name.toLowerCase() && entry.status !== "REMOVED",
  );
  if (duplicate) {
    throw new ApiError(409, "DUPLICATE_ENTRY", "An active blacklist entry already exists for this name.");
  }

  const entry: BlacklistEntry = {
    id: makeId("blk"),
    name: input.name,
    panMasked: maskPan(input.pan),
    phone: maskPhone(input.phone),
    reason: input.reason,
    source: input.source,
    status: "ACTIVE",
    addedAt: new Date().toISOString(),
    addedBy: actor.id,
  };
  store.blacklist.unshift(entry);

  appendAudit(
    store,
    actor.id,
    "BLACKLIST_ADDED",
    "Blacklist",
    entry.id,
    `Added blacklist entry for ${entry.name} (${entry.source}); identifiers stored masked only. Branch scope: ${
      scope.isGlobal ? "all branches" : actor.branchName
    }.`,
  );

  return { ...entry, addedByName: actor.name };
}

export const grievanceStatusSchema = z.enum(["OPEN", "IN_REVIEW", "RESOLVED"], {
  message: "Select a valid grievance status.",
});

export const grievanceUpdateSchema = z.object({
  status: grievanceStatusSchema,
  note: z.string().trim().max(300, "Note must be 300 characters or fewer.").optional(),
});

export type GrievanceUpdateInput = z.infer<typeof grievanceUpdateSchema>;

export function updateGrievance(
  scope: Scope,
  actor: SessionUser,
  grievanceId: string,
  input: GrievanceUpdateInput,
): GrievanceRow {
  const store = getStore();
  const grievance = store.grievances.find((row) => row.id === grievanceId);
  if (!grievance) throw new ApiError(404, "NOT_FOUND", "This grievance no longer exists.");
  assertBranchScope(scope, grievance.branchId);

  const previous = grievance.status;
  grievance.status = input.status;
  grievance.resolvedAt =
    input.status === "RESOLVED" ? grievance.resolvedAt ?? new Date().toISOString() : null;

  const note = input.note?.trim();
  appendAudit(
    store,
    actor.id,
    "GRIEVANCE_UPDATED",
    "Grievance",
    grievance.id,
    `${grievance.ref} status ${previous} → ${input.status}${note ? ` · Note: ${note}` : ""}`,
  );

  const customer = store.customers.find((row) => row.id === grievance.customerId);
  const assignee = store.users.find((row) => row.id === grievance.assignedTo);
  const branch = store.branches.find((row) => row.id === grievance.branchId);

  return {
    ...grievance,
    customerName: customer?.name ?? "—",
    assigneeName: assignee?.name ?? "Unassigned",
    branchName: branch?.name ?? "Unassigned",
  };
}
