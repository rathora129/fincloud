import type { Store } from "@/lib/types";
import { storeAdapter } from "./env";
import { buildSeed } from "./seed";

const globalForStore = globalThis as unknown as { __fincloudLmsStore?: Store };

export function getStore(): Store {
  if (!globalForStore.__fincloudLmsStore) {
    // Fail closed: production must explicitly declare its adapter and acknowledge ephemeral mode.
    storeAdapter();
    globalForStore.__fincloudLmsStore = buildSeed();
  }
  return globalForStore.__fincloudLmsStore;
}

export function resetStore() {
  globalForStore.__fincloudLmsStore = buildSeed();
}

export function nextSequence(prefix: string, existing: string[]) {
  const max = existing.reduce((acc, ref) => {
    const parts = ref.split("-");
    const value = Number(parts[parts.length - 1]);
    return Number.isFinite(value) ? Math.max(acc, value) : acc;
  }, 0);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(max + 1).padStart(4, "0")}`;
}

export function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function appendAudit(
  store: Store,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  ip = "system",
) {
  store.auditLogs.unshift({
    id: makeId("aud"),
    at: new Date().toISOString(),
    actorId,
    action,
    entityType,
    entityId,
    summary,
    ip,
  });
  if (store.auditLogs.length > 500) store.auditLogs.length = 500;
}
