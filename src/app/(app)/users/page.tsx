import { redirect } from "next/navigation";
import Link from "next/link";
import { Check, Minus, ScrollText, ShieldCheck, UserCheck, UserCog, UserX } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope } from "@/server/access";
import { listUsers } from "@/server/users";
import { getStore } from "@/server/store";
import { can } from "@/lib/rbac";
import type { Permission, RoleDefinition } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { PermissionDenied } from "@/components/ui/states";
import { UsersClient } from "./users-client";

export const metadata = { title: "Users & Roles" };

const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: "Overview", permissions: ["dashboard:view"] },
  { label: "Leads", permissions: ["leads:view", "leads:manage", "leads:assign"] },
  { label: "Applications", permissions: ["applications:view", "applications:manage"] },
  { label: "Credit", permissions: ["credit:view", "credit:decide"] },
  { label: "Sanctions", permissions: ["sanctions:view", "sanctions:decide"] },
  {
    label: "Disbursements",
    permissions: ["disbursements:view", "disbursements:process", "disbursements:approve"],
  },
  { label: "Collections", permissions: ["collections:view", "collections:manage"] },
  { label: "Tasks", permissions: ["tasks:view", "tasks:manage"] },
  { label: "Authorizations", permissions: ["authorizations:view", "authorizations:approve"] },
  { label: "Customers", permissions: ["customers:view"] },
  { label: "Users & access", permissions: ["users:view", "users:manage"] },
  { label: "Reports & MIS", permissions: ["reports:view", "reports:export"] },
  { label: "Audit", permissions: ["audit:view"] },
  { label: "Support operations", permissions: ["operations:view", "operations:manage"] },
];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "users:view")) {
    return <PermissionDenied className="mt-2" />;
  }

  const params = await searchParams;
  const value = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  const store = getStore();
  const roles = store.roles.slice().sort((a, b) => b.rank - a.rank);

  const roleParam = value("role");
  const statusParam = value("status");
  const filters = {
    q: value("q"),
    role: roles.some((role) => role.code === roleParam) ? (roleParam as string) : "",
    status: statusParam === "ACTIVE" || statusParam === "INACTIVE" ? statusParam : "",
    branchId: value("branch"),
  } as const;

  const scope = buildScope(user);
  const directory = listUsers(scope, filters);
  const canManage = can(user, "users:manage");
  const canAssignSuperAdmin = user.isSuperAdmin;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Users & roles"
        description={`Team directory, account status and role-based access across ${
          scope.isGlobal ? "all branches" : user.branchName
        }. Every mutation is permission-checked on the server and written to the audit trail.`}
        actions={
          <>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Demo directory
            </span>
            {can(user, "audit:view") ? (
              <Link
                href="/audit-logs"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-950 px-3.5 text-[12px] font-medium text-white transition hover:bg-ink-900"
              >
                <ScrollText className="h-3.5 w-3.5" /> Audit trail
              </Link>
            ) : null}
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Directory summary">
        <StatCard
          label="Team members"
          value={formatNumber(directory.summary.total)}
          hint={scope.isGlobal ? "All branches" : user.branchName}
          icon={<UserCog className="h-4 w-4" />}
        />
        <StatCard
          label="Active accounts"
          value={formatNumber(directory.summary.active)}
          hint="Can sign in"
          icon={<UserCheck className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Inactive accounts"
          value={formatNumber(directory.summary.inactive)}
          hint="Sign-in blocked"
          icon={<UserX className="h-4 w-4" />}
          accent="rose"
        />
        <StatCard
          label="Roles configured"
          value={formatNumber(roles.length)}
          hint={canManage ? "You can assign roles" : "Read-only for your role"}
          icon={<ShieldCheck className="h-4 w-4" />}
          accent="sky"
        />
      </section>

      <UsersClient
        items={directory.items}
        branches={directory.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        values={{ q: filters.q, role: filters.role || undefined, status: filters.status || undefined, branch: filters.branchId }}
        canManage={canManage}
        canAssignSuperAdmin={canAssignSuperAdmin}
        currentUserId={user.id}
        isGlobal={scope.isGlobal}
        protectedSuperAdminId={store.security.protectedSuperAdminId}
        roles={roles.map((role) => ({
          code: role.code,
          name: role.name,
          rank: role.rank,
          isSystem: role.isSystem,
          isGlobal: role.isGlobal,
        }))}
      />

      <Card>
        <CardHeader
          title="Role & permission matrix"
          description="Derived from the store-configured role catalogue. Server-side checks remain authoritative — this matrix is explanatory only."
          action={
            <span className="rounded-md bg-ink-100 px-2 py-1 text-[10px] font-medium text-ink-600">
              {roles.length} roles · {PERMISSION_GROUPS.reduce((acc, group) => acc + group.permissions.length, 0)} permissions
            </span>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/70">
                <th scope="col" className="sticky left-0 z-10 bg-ink-50/95 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Permission
                </th>
                {roles.map((role) => (
                  <th
                    key={role.code}
                    scope="col"
                    className="whitespace-nowrap px-2.5 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500"
                    title={role.description}
                  >
                    {role.shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((group) => (
                <RoleMatrixGroup key={group.label} group={group} roles={roles} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-ink-100 bg-ink-50/40 px-4 py-3 text-[10.5px] leading-relaxed text-ink-500">
          <span className="font-semibold text-ink-700">Demo password note:</span> every seeded and newly created account
          shares <span className="font-semibold text-ink-700">Fincloud@2026</span>, stored only as a scrypt hash. Roles
          drive navbar visibility and API authorization; branch scope restricts non-global roles to their own branch.
          {canManage ? "" : " Your role can view this directory but cannot modify accounts."}
        </div>
      </Card>
    </div>
  );
}

function RoleMatrixGroup({
  group,
  roles,
}: {
  group: { label: string; permissions: Permission[] };
  roles: RoleDefinition[];
}) {
  return (
    <>
      <tr className="border-b border-ink-100 bg-ink-50/40">
        <td
          colSpan={roles.length + 1}
          className="sticky left-0 z-10 bg-ink-50/95 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500"
        >
          {group.label}
        </td>
      </tr>
      {group.permissions.map((permission) => (
        <tr key={permission} className="border-b border-ink-100/70 last:border-0">
          <td className="sticky left-0 z-10 bg-white px-4 py-1.5">
            <code className="text-[11px] font-medium text-ink-700">{permission}</code>
          </td>
          {roles.map((role) => {
            const allowed = role.permissions.includes(permission);
            return (
              <td key={role.code} className="px-2.5 py-1.5 text-center">
                {allowed ? (
                  <Check className="mx-auto h-3.5 w-3.5 text-brand-600" aria-label="Allowed" />
                ) : (
                  <Minus className="mx-auto h-3.5 w-3.5 text-ink-200" aria-label="Not allowed" />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
