import type { Notification, SessionUser, ShellCounts } from "@/lib/types";
import { buildScope, canViewRecord, inScope } from "./access";
import { getStore } from "./store";

export function getShellData(user: SessionUser): { notifications: Notification[]; counts: ShellCounts } {
  const store = getStore();
  const scope = buildScope(user);

  const notifications = store.notifications
    .filter((n) => {
      if (n.userId) return n.userId === user.id;
      if (n.role) return n.role === user.role;
      return true;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  const counts: ShellCounts = {
    credit: store.applications.filter(
      (a) =>
        inScope(scope, a.branchId) &&
        a.status === "RECOMMENDED" &&
        canViewRecord(user, "APPLICATION", a.id, "credit:view", a.branchId, a.ownerId),
    ).length,
    sanctions: store.sanctions.filter(
      (s) =>
        inScope(scope, s.branchId) &&
        ["PENDING_ACCEPTANCE", "PROCESSING"].includes(s.status) &&
        canViewRecord(
          user,
          "SANCTION",
          s.id,
          "sanctions:view",
          s.branchId,
          store.applications.find((a) => a.id === s.applicationId)?.ownerId,
        ),
    ).length,
    tasks: store.tasks.filter(
      (t) =>
        t.assigneeId === user.id &&
        !["COMPLETED", "CANCELLED"].includes(t.status) &&
        canViewRecord(user, "TASK", t.id, "tasks:view", t.branchId, t.assigneeId),
    ).length,
    collections: store.collectionCases.filter(
      (c) =>
        inScope(scope, c.branchId) &&
        ["PENDING", "RECOVERY", "LEGAL"].includes(c.status) &&
        canViewRecord(user, "COLLECTION", c.id, "collections:view", c.branchId, c.assignedTo),
    ).length,
    authorizations: store.authorizations.filter(
      (a) => inScope(scope, a.branchId) && a.status === "PENDING",
    ).length,
  };

  return { notifications, counts };
}
