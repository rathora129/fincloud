import type { PermissionAudit } from "@/lib/types";
import { getStore, makeId } from "./store";

type PermissionChangeInput = {
  actorId: string;
  actorRole: string;
  targetType: PermissionAudit["targetType"];
  targetId: string;
  targetLabel: string;
  action: string;
  before?: string[];
  after?: string[];
  reason: string;
  expiresAt?: string | null;
  ip?: string;
};

/** Append-only permission history — there is no update or delete path for these records. */
export function logPermissionChange(input: PermissionChangeInput) {
  const store = getStore();
  store.permissionAudits.unshift({
    id: makeId("paud"),
    at: new Date().toISOString(),
    actorId: input.actorId,
    actorRole: input.actorRole,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    action: input.action,
    before: input.before ?? [],
    after: input.after ?? [],
    reason: input.reason,
    ip: input.ip ?? "10.24.0.10",
    expiresAt: input.expiresAt ?? null,
  });
  if (store.permissionAudits.length > 1000) store.permissionAudits.length = 1000;
}
