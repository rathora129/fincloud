import type { Notification, SessionUser } from "@/lib/types";
import { requireSession, buildScope, inScope } from "./access";
import { getStore } from "./store";
import { can } from "@/lib/rbac";
import type { SearchGroup } from "@/lib/types";

export async function getNotifications(): Promise<{ user: SessionUser; items: Notification[] }> {
  const user = await requireSession();
  const store = getStore();
  const items = store.notifications
    .filter((n) => (n.userId ? n.userId === user.id : n.role ? n.role === user.role : true))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 20);
  return { user, items };
}

export async function markNotificationsRead(id?: string) {
  const user = await requireSession();
  const store = getStore();
  store.notifications.forEach((n) => {
    const visible = n.userId ? n.userId === user.id : n.role ? n.role === user.role : true;
    if (!visible) return;
    if (id ? n.id === id : true) n.read = true;
  });
}

export async function searchAll(query: string): Promise<{ groups: SearchGroup[] }> {
  const user = await requireSession();
  const scope = buildScope(user);
  const store = getStore();
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { groups: [] };

  const limit = 5;
  const groups: SearchGroup[] = [];

  const leads = store.leads
    .filter(
      (l) =>
        inScope(scope, l.branchId) &&
        [l.ref, l.customerName, l.phone, l.city].some((value) => value.toLowerCase().includes(q)),
    )
    .slice(0, limit)
    .map((l) => ({
      id: l.id,
      title: l.customerName,
      subtitle: `${l.ref} · ${l.city} · ${l.status.replaceAll("_", " ")}`,
      href: `/leads/${l.id}`,
    }));
  if (leads.length) groups.push({ label: "Leads", type: "lead", items: leads });

  const appIds = new Set(
    store.applications.filter((a) => inScope(scope, a.branchId)).map((a) => a.id),
  );
  const applications = store.applications
    .filter(
      (a) =>
        appIds.has(a.id) &&
        [a.ref, store.customers.find((c) => c.id === a.customerId)?.name ?? "", a.product, a.status].some(
          (value) => value.toLowerCase().includes(q),
        ),
    )
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      title: `${a.ref} · ${store.customers.find((c) => c.id === a.customerId)?.name ?? "Synthetic customer"}`,
      subtitle: `${a.product} · ${a.status.replaceAll("_", " ")} · ₹${a.requestedAmount.toLocaleString("en-IN")}`,
      href: `/applications/${a.id}`,
    }));
  if (applications.length) groups.push({ label: "Applications", type: "application", items: applications });

  const customers = store.customers
    .filter(
      (c) =>
        inScope(scope, c.branchId) &&
        [c.name, c.ref, c.phone, c.city, c.panMasked].some((value) => value.toLowerCase().includes(q)),
    )
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: `${c.ref} · ${c.city} · KYC ${c.kycStatus.toLowerCase()}`,
      href: `/customers/${c.id}`,
    }));
  if (customers.length) groups.push({ label: "Customers", type: "customer", items: customers });

  const loans = store.loanAccounts
    .filter((l) => inScope(scope, l.branchId) && [l.ref].some((value) => value.toLowerCase().includes(q)))
    .slice(0, limit)
    .map((l) => ({
      id: l.id,
      title: l.ref,
      subtitle: `${l.status} · Outstanding ₹${l.outstanding.toLocaleString("en-IN")} · ${l.dpd} DPD`,
      href: `/customers/${l.customerId}`,
    }));
  if (loans.length) groups.push({ label: "Loan Accounts", type: "loan", items: loans });

  const tasks = store.tasks
    .filter(
      (t) =>
        inScope(scope, t.branchId) &&
        [t.ref, t.title, t.category].some((value) => value.toLowerCase().includes(q)),
    )
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      title: t.title,
      subtitle: `${t.ref} · ${t.category} · ${t.status.replaceAll("_", " ")}`,
      href: `/tasks?q=${encodeURIComponent(t.ref)}`,
    }));
  if (tasks.length) groups.push({ label: "Tasks", type: "task", items: tasks });

  const allowed = new Set<SearchGroup["type"]>();
  if (can(user, "leads:view")) allowed.add("lead");
  if (can(user, "applications:view")) allowed.add("application");
  if (can(user, "customers:view")) {
    allowed.add("customer");
    allowed.add("loan");
  }
  if (can(user, "tasks:view")) allowed.add("task");

  return { groups: groups.filter((group) => allowed.has(group.type)) };
}
