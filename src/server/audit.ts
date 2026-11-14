import type { AuditLog, RoleCode, Scope } from "@/lib/types";
import { getStore } from "./store";
import { inDateRange, matchesText, sortBy } from "./query";
import { inScope } from "./access";

export type AuditEntry = AuditLog & {
  actorName: string;
  actorRole: RoleCode | null;
  actorColor: string;
  branchName: string;
};

export type AuditFilters = {
  q?: string;
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
};

export type AuditDirectory = {
  items: AuditEntry[];
  actions: string[];
  actors: { id: string; name: string }[];
  summary: { total: number; distinctActions: number; actors: number; latestAt: string | null };
};

export function listAuditLogs(scope: Scope, filters: AuditFilters = {}): AuditDirectory {
  const store = getStore();
  const branchById = new Map(store.branches.map((branch) => [branch.id, branch]));
  const userById = new Map(store.users.map((user) => [user.id, user]));

  const scoped = store.auditLogs
    .map((log): AuditEntry | null => {
      const actor = userById.get(log.actorId);
      if (!actor) return null;
      if (!inScope(scope, actor.branchId)) return null;
      return {
        ...log,
        actorName: actor.name,
        actorRole: actor.role,
        actorColor: actor.avatarColor,
        branchName: branchById.get(actor.branchId)?.name ?? "Unassigned",
      };
    })
    .filter((entry): entry is AuditEntry => entry !== null);

  const filtered = scoped
    .filter((entry) => (filters.action ? entry.action === filters.action : true))
    .filter((entry) => (filters.actorId ? entry.actorId === filters.actorId : true))
    .filter((entry) => (filters.from || filters.to ? inDateRange(entry.at, filters.from, filters.to) : true))
    .filter((entry) => matchesText(filters.q, [entry.action, entry.summary, entry.entityId, entry.entityType]));

  const items = sortBy(filtered, (entry) => new Date(entry.at).getTime(), "desc");
  const actions = [...new Set(scoped.map((entry) => entry.action))].sort((a, b) => a.localeCompare(b));
  const actorMap = new Map<string, string>();
  scoped.forEach((entry) => actorMap.set(entry.actorId, entry.actorName));

  return {
    items,
    actions,
    actors: [...actorMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    summary: {
      total: scoped.length,
      distinctActions: actions.length,
      actors: actorMap.size,
      latestAt: items[0]?.at ?? null,
    },
  };
}

/** Convenience for detail views that need the actor's display data. */
export function auditActorName(actorId: string) {
  return getStore().users.find((user) => user.id === actorId)?.name ?? "Unknown actor";
}
