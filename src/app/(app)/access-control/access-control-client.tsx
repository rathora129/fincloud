"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Check,
  Clock3,
  GitCompareArrows,
  History,
  KeyRound,
  Lock,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldHalf,
  Users,
} from "lucide-react";
import type { AccessScopeType, Permission, RecordType } from "@/lib/types";
import { errorMessage } from "@/lib/api";
import { cn, formatDateTime, formatNumber, formatRelative } from "@/lib/utils";
import {
  compareAccess,
  createAccessGrant,
  createAccessRole,
  fetchAccessCenter,
  fetchUserAccess,
  previewUserAccess,
  revokeAccessGrant,
  updateAccessRole,
  updateAccessScope,
  type AccessCenterData,
  type AccessComparison,
  type AccessPreview,
  type AccessUserSummary,
  type AuditView,
  type GrantView,
  type RoleSummary,
  type UserAccessDetail,
} from "@/services/access-control";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Checkbox } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const RECORD_TYPES: RecordType[] = [
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
];

const SCOPE_LABELS: Record<AccessScopeType, string> = {
  GLOBAL: "Global",
  BRANCH: "Branch",
  DEPARTMENT: "Department",
  RECORD: "Record",
};

function moduleOf(permission: string) {
  return permission.split(":")[0];
}

function permissionGroups(permissions: Permission[]) {
  const groups = new Map<string, Permission[]>();
  permissions.forEach((permission) => {
    const key = moduleOf(permission);
    groups.set(key, [...(groups.get(key) ?? []), permission]);
  });
  return Array.from(groups.entries()).map(([module, items]) => ({ module, permissions: items }));
}

function rolePill(role: string) {
  if (role === "SUPER_ADMIN") return "bg-violet-50 text-violet-700 ring-violet-200";
  if (role === "ADMIN") return "bg-brand-50 text-brand-700 ring-brand-200";
  if (role.includes("MANAGER")) return "bg-sky-50 text-sky-700 ring-sky-200";
  return "bg-ink-100 text-ink-600 ring-ink-200";
}

export function AccessControlClient({
  initialData,
  currentUserId,
  canManage,
  canDelegate,
  canManageRoles,
  isProtectedSuperAdmin,
}: {
  initialData: AccessCenterData;
  currentUserId: string;
  canManage: boolean;
  canDelegate: boolean;
  canManageRoles: boolean;
  isProtectedSuperAdmin: boolean;
}) {
  const toast = useToast();
  const [data, setData] = useState<AccessCenterData>(initialData);
  const [refreshing, setRefreshing] = useState(false);

  const reload = async () => {
    setRefreshing(true);
    try {
      const next = await fetchAccessCenter();
      setData(next);
    } catch (error) {
      toast.error("Could not refresh access data", errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const summary = data.summary;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Access summary">
        <StatCard
          label="Accounts governed"
          value={formatNumber(summary.totalUsers)}
          hint={`${summary.roleCount} roles · ${summary.permissionCount} permissions`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Active grants"
          value={formatNumber(summary.activeGrants)}
          hint={`${summary.temporaryGrants} temporary / expiring`}
          icon={<KeyRound className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Explicit restrictions"
          value={formatNumber(summary.restrictions)}
          hint="DENY grants override ordinary allow"
          icon={<Ban className="h-4 w-4" />}
          accent="rose"
        />
        <StatCard
          label="Protected authority"
          value={isProtectedSuperAdmin ? "You" : "Locked"}
          hint={data.protectedSuperAdminName}
          icon={<ShieldHalf className="h-4 w-4" />}
          accent="sky"
        />
      </section>

      <Card>
        <CardHeader
          title="Access Control Center"
          description="Effective permissions are computed centrally from account status, role, individual grants, explicit restrictions, record scope and expiry. DENY always wins."
          action={
            <div className="flex items-center gap-2">
              <span className="hidden rounded-md bg-ink-100 px-2 py-1 text-[10px] font-medium text-ink-600 sm:inline">
                {canManage ? "You can administer access" : "Read-only for your authority"}
              </span>
              <Button variant="outline" size="sm" onClick={reload} loading={refreshing}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
          }
        />
        <CardBody>
          <Tabs
            tabs={[
              {
                key: "users",
                label: "User access",
                count: data.users.length,
                content: (
                  <UsersPanel
                    data={data}
                    canManage={canManage}
                    canDelegate={canDelegate}
                    onChanged={reload}
                    currentUserId={currentUserId}
                  />
                ),
              },
              {
                key: "roles",
                label: "Roles & matrix",
                count: data.roles.length,
                content: (
                  <RolesPanel
                    data={data}
                    canManageRoles={canManageRoles}
                    canManage={canManage}
                    onChanged={reload}
                  />
                ),
              },
              {
                key: "grants",
                label: "Grants & delegation",
                count: data.grants.length,
                content: (
                  <GrantsPanel
                    data={data}
                    canManage={canManage}
                    canDelegate={canDelegate}
                    onChanged={reload}
                    currentUserId={currentUserId}
                  />
                ),
              },
              {
                key: "history",
                label: "Access history",
                count: data.audits.length,
                content: <HistoryPanel audits={data.audits} />,
              },
              {
                key: "compare",
                label: "Compare",
                content: <ComparePanel data={data} />,
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

function UsersPanel({
  data,
  canManage,
  canDelegate,
  onChanged,
  currentUserId,
}: {
  data: AccessCenterData;
  canManage: boolean;
  canDelegate: boolean;
  onChanged: () => Promise<void>;
  currentUserId: string;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(data.users[0]?.id ?? null);
  const [detail, setDetail] = useState<UserAccessDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchUserAccess(selectedId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setDetail(null);
          toast.error("Could not load user access", errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter((user) =>
      [user.name, user.email, user.roleName, user.department, ...user.branchNames]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data.users, query]);

  const refreshDetail = async (userId: string | null) => {
    await onChanged();
    if (!userId) return;
    try {
      setDetail(await fetchUserAccess(userId));
    } catch {
      // The list refresh already surfaced the state; detail stays as-is on failure.
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people, roles, departments"
            className="h-9 pl-8 text-xs"
            aria-label="Search users for access management"
          />
        </div>
        <div className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1" role="list">
          {filtered.map((user) => (
            <button
              key={user.id}
              type="button"
              role="listitem"
              onClick={() => setSelectedId(user.id)}
              aria-current={selectedId === user.id ? "true" : undefined}
              className={cn(
                "w-full rounded-xl border px-3 py-2.5 text-left transition",
                selectedId === user.id
                  ? "border-brand-300 bg-brand-50/60"
                  : "border-ink-100 bg-white hover:border-ink-200 hover:bg-ink-50/60",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-semibold text-ink-900">{user.name}</span>
                {user.isProtected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                    <Lock className="h-2.5 w-2.5" /> Protected
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-ink-500">
                {user.roleName} · {user.department}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-ink-500">
                <span className={cn("rounded-full px-1.5 py-0.5 font-medium ring-1 ring-inset", rolePill(user.role))}>
                  {user.effectiveCount} effective
                </span>
                <span>{user.directGrantCount} direct</span>
                <span>·</span>
                <span>{user.recordAccess === "ASSIGNED" ? "Assigned records only" : "Branch records"}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 ? (
            <EmptyState title="No matching people" description="Try a different name, role or department." />
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-xs text-ink-500">Loading effective access…</div>
        ) : detail ? (
          <UserAccessPanel
            key={detail.user.id}
            detail={detail}
            data={data}
            canManage={canManage}
            isSelf={detail.user.id === currentUserId}
            onOpenGrant={() => setGrantOpen(true)}
            onChanged={() => refreshDetail(detail.user.id)}
          />
        ) : (
          <EmptyState title="Select a person" description="Choose an account to inspect role, grants and effective permissions." />
        )}
      </div>

      <GrantDialog
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        data={data}
        canDelegate={canDelegate}
        initialSubjectId={detail?.user.id ?? selectedId ?? data.users[0]?.id}
        onSaved={async () => {
          setGrantOpen(false);
          await refreshDetail(detail?.user.id ?? selectedId);
        }}
      />
    </div>
  );
}

function UserAccessPanel({
  detail,
  data,
  canManage,
  isSelf,
  onOpenGrant,
  onChanged,
}: {
  detail: UserAccessDetail;
  data: AccessCenterData;
  canManage: boolean;
  isSelf: boolean;
  onOpenGrant: () => void;
  onChanged: () => Promise<void>;
}) {
  const groups = permissionGroups(detail.effective.map((entry) => entry.permission));
  const allowed = detail.effective.filter((entry) => entry.allowed).length;
  const restricted = detail.effective.filter((entry) => entry.deniedBy.length > 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink-100 bg-ink-50/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink-900">{detail.user.name}</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", rolePill(detail.user.role))}>
                {detail.user.roleName}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                  detail.user.status === "ACTIVE"
                    ? "bg-brand-50 text-brand-700 ring-brand-200"
                    : "bg-rose-50 text-rose-700 ring-rose-200",
                )}
              >
                {detail.user.status}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] text-ink-500">
              {detail.user.email} · {detail.user.department} · {detail.user.branchNames.join(", ") || "No branch"}
            </p>
            <p className="mt-1 text-[11px] text-ink-500">
              Record access: <span className="font-medium text-ink-700">{detail.user.recordAccess === "ASSIGNED" ? "Assigned records only" : "All records in authorized branches"}</span>
              {" · "}Effective permissions: <span className="font-medium text-ink-700">{allowed}</span>
            </p>
          </div>
          {canManage ? (
            <Button size="sm" onClick={onOpenGrant} disabled={isSelf || detail.user.isProtected}>
              <Plus className="h-3.5 w-3.5" /> Grant or restrict
            </Button>
          ) : null}
        </div>
        {isSelf ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10.5px] text-amber-700 ring-1 ring-inset ring-amber-200">
            You cannot modify your own access. Ask another authorized administrator.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ink-100">
          <div className="border-b border-ink-100 px-4 py-3">
            <h4 className="text-[12px] font-semibold text-ink-900">Effective permission preview</h4>
            <p className="mt-0.5 text-[10.5px] text-ink-500">Role + individual grants, after explicit restrictions and expiry.</p>
          </div>
          <div className="max-h-[320px] space-y-3 overflow-y-auto p-4">
            {groups.map((group) => (
              <div key={group.module}>
                <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">{group.module}</p>
                <div className="space-y-1">
                  {group.permissions.map((permission) => {
                    const entry = detail.effective.find((item) => item.permission === permission);
                    const denied = entry?.deniedBy.length ? entry.deniedBy : [];
                    return (
                      <div key={permission} className="flex items-center justify-between gap-2 text-[11px]">
                        <code className="text-ink-600">{permission}</code>
                        {entry?.allowed ? (
                          <span className="inline-flex items-center gap-1 text-brand-700">
                            <Check className="h-3 w-3" /> allowed
                          </span>
                        ) : denied.length ? (
                          <span className="inline-flex items-center gap-1 text-rose-700">
                            <Ban className="h-3 w-3" /> denied
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-ink-400">
                            <Minus className="h-3 w-3" /> no grant
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {restricted.length ? (
            <div className="border-t border-rose-100 bg-rose-50/50 px-4 py-2.5 text-[10.5px] text-rose-700">
              {restricted.length} explicit restriction{restricted.length === 1 ? "" : "s"} applied — ordinary role and user grants cannot bypass them.
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <PreviewCard userId={detail.user.id} data={data} />
          <ScopeEditor detail={detail} data={data} canManage={canManage} onChanged={onChanged} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ink-100">
          <div className="border-b border-ink-100 px-4 py-3">
            <h4 className="text-[12px] font-semibold text-ink-900">Individual & delegated grants</h4>
            <p className="mt-0.5 text-[10.5px] text-ink-500">Direct grants, temporary grants and record-scoped access.</p>
          </div>
          <div className="divide-y divide-ink-100">
            {detail.grants.length === 0 ? (
              <p className="px-4 py-5 text-[11px] text-ink-500">No individual grants. Role permissions apply.</p>
            ) : (
              detail.grants.map((grant) => (
                <div key={grant.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-medium text-ink-800">
                      <span className={grant.effect === "DENY" ? "text-rose-700" : "text-brand-700"}>{grant.effect}</span>{" "}
                      <code className="text-[11px]">{grant.permission}</code>
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-ink-500">
                      {SCOPE_LABELS[grant.scopeType]}
                      {grant.scopeType === "BRANCH" && grant.branchId
                        ? ` · ${data.branches.find((branch) => branch.id === grant.branchId)?.name ?? grant.branchId}`
                        : ""}
                      {grant.scopeType === "DEPARTMENT" ? ` · ${grant.department ?? "—"}` : ""}
                      {grant.scopeType === "RECORD" ? ` · ${grant.recordType} ${grant.recordId}` : ""}
                      {" · "}
                      {grant.mode === "DELEGATED" ? "delegated" : "direct"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {grant.grantedByName} · {formatRelative(grant.grantedAt)}
                      {grant.expiresAt ? ` · expires ${formatDateTime(grant.expiresAt)}` : ""}
                    </p>
                  </div>
                  <GrantStatusPill status={grant.status} />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-ink-100">
          <div className="border-b border-ink-100 px-4 py-3">
            <h4 className="text-[12px] font-semibold text-ink-900">Permission change history</h4>
            <p className="mt-0.5 text-[10.5px] text-ink-500">Who changed what, with reason, IP and before/after values.</p>
          </div>
          <div className="max-h-[320px] divide-y divide-ink-100 overflow-y-auto">
            {detail.history.length === 0 ? (
              <p className="px-4 py-5 text-[11px] text-ink-500">No permission changes recorded for this account.</p>
            ) : (
              detail.history.slice(0, 20).map((entry) => <AuditRow key={entry.id} entry={entry} compact />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({ userId, data }: { userId: string; data: AccessCenterData }) {
  const toast = useToast();
  const [branchId, setBranchId] = useState("");
  const [recordType, setRecordType] = useState<RecordType | "">("");
  const [recordId, setRecordId] = useState("");
  const [result, setResult] = useState<AccessPreview | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      setResult(
        await previewUserAccess(userId, {
          branchId: branchId || undefined,
          recordType: recordType || undefined,
          recordId: recordId || undefined,
        }),
      );
    } catch (error) {
      toast.error("Preview failed", errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const allowed = result?.effective.filter((entry) => entry.allowed).length ?? 0;

  return (
    <div className="rounded-xl border border-ink-100">
      <div className="border-b border-ink-100 px-4 py-3">
        <h4 className="text-[12px] font-semibold text-ink-900">Context preview</h4>
        <p className="mt-0.5 text-[10.5px] text-ink-500">Evaluate effective permissions for a branch or a specific record.</p>
      </div>
      <div className="space-y-2.5 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-9 text-xs" aria-label="Preview branch">
            <option value="">Any branch</option>
            {data.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
          <Select
            value={recordType}
            onChange={(event) => setRecordType(event.target.value as RecordType | "")}
            className="h-9 text-xs"
            aria-label="Preview record type"
          >
            <option value="">No record</option>
            {RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Input
            value={recordId}
            onChange={(event) => setRecordId(event.target.value)}
            placeholder="Record ID (optional)"
            className="h-9 text-xs"
            aria-label="Preview record ID"
          />
          <Button size="sm" variant="outline" onClick={run} loading={loading}>
            Evaluate
          </Button>
        </div>
        {result ? (
          <div className="rounded-lg bg-ink-50 px-3 py-2 text-[10.5px] text-ink-600">
            <span className="font-semibold text-ink-800">{allowed}</span> of {result.effective.length} permissions allowed
            {result.context?.recordType ? ` for ${result.context.recordType} ${result.context.recordId ?? ""}` : ""}.
            {result.effective.some((entry) => entry.allowed && entry.deniedBy.length === 0 && entry.sources.some((source) => source.kind === "RECORD"))
              ? " Record-scoped grant detected."
              : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScopeEditor({
  detail,
  data,
  canManage,
  onChanged,
}: {
  detail: UserAccessDetail;
  data: AccessCenterData;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const initialBranches = data.branches.filter((branch) => detail.user.branchNames.includes(branch.name)).map((branch) => branch.id);
  const [branchIds, setBranchIds] = useState<string[]>(initialBranches.length ? initialBranches : [data.branches[0]?.id].filter(Boolean));
  const [department, setDepartment] = useState(detail.user.department);
  const [recordAccess, setRecordAccess] = useState<"BRANCH" | "ASSIGNED">(detail.user.recordAccess);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleBranch = (branchId: string) => {
    setBranchIds((current) =>
      current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId],
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateAccessScope(detail.user.id, { branchIds, department, recordAccess, reason });
      toast.success("Scope updated", "Branch, department and record access were saved and audited.");
      setReason("");
      await onChanged();
    } catch (error) {
      toast.error("Scope update failed", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-ink-100">
      <div className="border-b border-ink-100 px-4 py-3">
        <h4 className="text-[12px] font-semibold text-ink-900">Branch & record scope</h4>
        <p className="mt-0.5 text-[10.5px] text-ink-500">Restrict which branches and records this account can act on.</p>
      </div>
      <div className="space-y-2.5 p-4">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-400">Branches</p>
          <div className="flex flex-wrap gap-1.5">
            {data.branches.map((branch) => {
              const active = branchIds.includes(branch.id);
              return (
                <button
                  key={branch.id}
                  type="button"
                  disabled={!canManage}
                  onClick={() => toggleBranch(branch.id)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                    active
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                  )}
                >
                  {branch.code}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Department" htmlFor="scope-department">
            <Select
              id="scope-department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              disabled={!canManage}
              className="h-9 text-xs"
            >
              {Array.from(new Set([...data.departments, department])).filter(Boolean).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Record access" htmlFor="scope-record-access">
            <Select
              id="scope-record-access"
              value={recordAccess}
              onChange={(event) => setRecordAccess(event.target.value as "BRANCH" | "ASSIGNED")}
              disabled={!canManage}
              className="h-9 text-xs"
            >
              <option value="BRANCH">All records in branches</option>
              <option value="ASSIGNED">Only assigned records</option>
            </Select>
          </Field>
        </div>
        <Field label="Reason" htmlFor="scope-reason" hint="At least 10 characters. Stored with the audit record.">
          <Input
            id="scope-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={!canManage}
            placeholder="Why is this scope changing?"
            className="h-9 text-xs"
          />
        </Field>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} loading={saving} disabled={!canManage || reason.trim().length < 10 || branchIds.length === 0}>
            Save scope
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

function RolesPanel({
  data,
  canManageRoles,
  canManage,
  onChanged,
}: {
  data: AccessCenterData;
  canManageRoles: boolean;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<RoleSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const groups = permissionGroups(data.permissions);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-500">
          {data.roles.length} configurable roles. Custom roles can be added without code changes; the server still validates every assignment.
        </p>
        {canManageRoles ? (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> New role
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {data.roles.map((role) => (
          <div key={role.code} className="rounded-xl border border-ink-100 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h4 className="truncate text-[12.5px] font-semibold text-ink-900">{role.name}</h4>
                  {role.isSystem ? (
                    <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[9px] font-semibold text-ink-600">system</span>
                  ) : null}
                  {role.isGlobal ? (
                    <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">global</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[10.5px] text-ink-500">{role.description}</p>
              </div>
              {canManageRoles ? (
                <Button size="icon" variant="ghost" aria-label={`Edit ${role.name}`} onClick={() => setEditing(role)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-500">
              <span className="rounded-md bg-ink-50 px-1.5 py-0.5 font-medium text-ink-600">rank {role.rank}</span>
              <span>{role.permissions.length} permissions</span>
              <span>·</span>
              <span>{role.userCount} user{role.userCount === 1 ? "" : "s"}</span>
            </div>
          </div>
        ))}
      </div>

      <Card className="border border-ink-100 shadow-none">
        <CardHeader
          title="Module permission matrix"
          description="Role configuration snapshot. Runtime decisions always come from the centralized permission engine."
          action={
            <span className="rounded-md bg-ink-100 px-2 py-1 text-[10px] font-medium text-ink-600">
              {data.permissions.length} permissions × {data.roles.length} roles
            </span>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/70">
                <th scope="col" className="sticky left-0 z-10 bg-ink-50/95 px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Permission
                </th>
                {data.roles.map((role) => (
                  <th key={role.code} scope="col" className="px-1.5 py-2 text-center text-[9.5px] font-semibold uppercase tracking-[0.05em] text-ink-500" title={role.name}>
                    {role.shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={`group-${group.module}`}>
                  <tr className="border-b border-ink-100 bg-ink-50/40">
                    <td colSpan={data.roles.length + 1} className="sticky left-0 z-10 bg-ink-50/95 px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                      {group.module}
                    </td>
                  </tr>
                  {group.permissions.map((permission) => (
                    <tr key={permission} className="border-b border-ink-100/60 last:border-0">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                        <code className="text-[10.5px] text-ink-700">{permission}</code>
                      </td>
                      {data.roles.map((role) => (
                        <td key={`${role.code}-${permission}`} className="px-1.5 py-1.5 text-center">
                          {role.permissions.includes(permission) ? (
                            <Check className="mx-auto h-3 w-3 text-brand-600" aria-label="Allowed" />
                          ) : (
                            <Minus className="mx-auto h-3 w-3 text-ink-200" aria-label="Not allowed" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <RoleDialog
        open={Boolean(editing) || creating}
        role={editing}
        permissions={data.permissions}
        canManage={canManageRoles}
        canManageUsers={canManage}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={async () => {
          setEditing(null);
          setCreating(false);
          await onChanged();
        }}
      />
    </div>
  );
}

function RoleDialog({
  open,
  role,
  permissions,
  canManage,
  onClose,
  onSaved,
}: {
  open: boolean;
  role: RoleSummary | null;
  permissions: Permission[];
  canManage: boolean;
  canManageUsers: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [shortLabel, setShortLabel] = useState("");
  const [description, setDescription] = useState("");
  const [rank, setRank] = useState(50);
  const [isGlobal, setIsGlobal] = useState(false);
  const [selected, setSelected] = useState<Permission[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(role?.code ?? "");
    setName(role?.name ?? "");
    setShortLabel(role?.shortLabel ?? "");
    setDescription(role?.description ?? "");
    setRank(role?.rank ?? 50);
    setIsGlobal(role?.isGlobal ?? false);
    setSelected(role ? [...role.permissions] : []);
  }, [open, role]);

  const groups = permissionGroups(permissions);

  const toggle = (permission: Permission) => {
    setSelected((current) =>
      current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission],
    );
  };

  const submit = async () => {
    setSaving(true);
    try {
      const payload = { name, shortLabel, description, rank, isGlobal, permissions: selected };
      if (role) {
        await updateAccessRole(role.code, payload);
        toast.success("Role updated", `${name} now has ${selected.length} permissions.`);
      } else {
        await createAccessRole({ ...payload, code });
        toast.success("Role created", `${name} is available for assignment immediately.`);
      }
      await onSaved();
    } catch (error) {
      toast.error(role ? "Role update failed" : "Role creation failed", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={role ? `Edit role · ${role.name}` : "Create custom role"}
      description="Roles are data, not code. Every assignment is still validated against your own authority."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={submit}
            loading={saving}
            disabled={!canManage || name.trim().length < 2 || shortLabel.trim().length < 2 || description.trim().length < 10 || selected.length === 0}
          >
            {role ? "Save role" : "Create role"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {!role ? (
          <Field label="Role code" htmlFor="role-code" hint="Optional. Derived from the name when blank.">
            <Input id="role-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="REGIONAL_AUDITOR" />
          </Field>
        ) : null}
        <Field label="Role name" htmlFor="role-name" required>
          <Input id="role-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Regional Auditor" />
        </Field>
        <Field label="Short label" htmlFor="role-short" hint="Shown in compact matrices." required>
          <Input id="role-short" value={shortLabel} onChange={(event) => setShortLabel(event.target.value)} maxLength={18} placeholder="Auditor" />
        </Field>
        <Field label="Rank" htmlFor="role-rank" hint="Higher rank = greater authority. 1–100." required>
          <Input
            id="role-rank"
            type="number"
            min={1}
            max={100}
            value={rank}
            onChange={(event) => setRank(Number(event.target.value) || 1)}
          />
        </Field>
        <label className="flex items-center gap-2 text-[12px] text-ink-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={isGlobal}
            onChange={(event) => setIsGlobal(event.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          Global role — access spans all branches (only the protected Super Admin may create global roles)
        </label>
      </div>
      <Field label="Description" htmlFor="role-description" className="mt-3" required>
        <Input id="role-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this role is responsible for" />
      </Field>

      <div className="mt-4 rounded-xl border border-ink-100">
        <div className="flex items-center justify-between border-b border-ink-100 px-3.5 py-2.5">
          <p className="text-[12px] font-semibold text-ink-900">Permissions</p>
          <span className="text-[10px] text-ink-500">{selected.length} selected</span>
        </div>
        <div className="max-h-[300px] space-y-3 overflow-y-auto p-3.5">
          {groups.map((group) => (
            <div key={group.module}>
              <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">{group.module}</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {group.permissions.map((permission) => (
                  <Checkbox
                    key={permission}
                    label={permission}
                    checked={selected.includes(permission)}
                    onChange={() => toggle(permission)}
                    disabled={!canManage}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Grants                                                              */
/* ------------------------------------------------------------------ */

function GrantsPanel({
  data,
  canManage,
  canDelegate,
  onChanged,
  currentUserId,
}: {
  data: AccessCenterData;
  canManage: boolean;
  canDelegate: boolean;
  onChanged: () => Promise<void>;
  currentUserId: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState<GrantView | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const revoke = async () => {
    if (!revoking) return;
    setSaving(true);
    try {
      await revokeAccessGrant(revoking.id, reason);
      toast.success("Grant revoked", `${revoking.permission} was revoked for ${revoking.subjectName}.`);
      setRevoking(null);
      setReason("");
      await onChanged();
    } catch (error) {
      toast.error("Revocation failed", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-500">
          {data.grants.length} grants. Delegated grants cannot exceed the grantor’s own permissions; DENY always overrides ALLOW.
        </p>
        {canManage ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New grant
          </Button>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-xl border border-ink-100">
        <table className="w-full min-w-[900px] border-collapse text-left text-[11.5px]">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/70 text-[9.5px] uppercase tracking-[0.06em] text-ink-500">
              <th scope="col" className="px-3 py-2.5">Subject</th>
              <th scope="col" className="px-3 py-2.5">Permission</th>
              <th scope="col" className="px-3 py-2.5">Effect</th>
              <th scope="col" className="px-3 py-2.5">Scope</th>
              <th scope="col" className="px-3 py-2.5">Mode</th>
              <th scope="col" className="px-3 py-2.5">Granted by</th>
              <th scope="col" className="px-3 py-2.5">Expiry</th>
              <th scope="col" className="px-3 py-2.5">Status</th>
              <th scope="col" className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.grants.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[11px] text-ink-500">No individual grants recorded.</td>
              </tr>
            ) : (
              data.grants.map((grant) => (
                <tr key={grant.id} className="border-b border-ink-100/70 last:border-0">
                  <td className="px-3 py-2">{grant.subjectName}</td>
                  <td className="px-3 py-2"><code className="text-[11px]">{grant.permission}</code></td>
                  <td className="px-3 py-2">
                    <span className={cn("font-semibold", grant.effect === "DENY" ? "text-rose-700" : "text-brand-700")}>{grant.effect}</span>
                  </td>
                  <td className="px-3 py-2">
                    {SCOPE_LABELS[grant.scopeType]}
                    {grant.scopeType === "RECORD" ? ` · ${grant.recordType}` : ""}
                    {grant.scopeType === "BRANCH" && grant.branchId
                      ? ` · ${data.branches.find((branch) => branch.id === grant.branchId)?.code ?? grant.branchId}`
                      : ""}
                  </td>
                  <td className="px-3 py-2">{grant.mode === "DELEGATED" ? "Delegated" : "Direct"}</td>
                  <td className="px-3 py-2">{grant.grantedByName}</td>
                  <td className="px-3 py-2 text-[10.5px] text-ink-500">{grant.expiresAt ? formatDateTime(grant.expiresAt) : "—"}</td>
                  <td className="px-3 py-2"><GrantStatusPill status={grant.status} /></td>
                  <td className="px-3 py-2 text-right">
                    {canManage && grant.status === "ACTIVE" && grant.subjectId !== currentUserId ? (
                      <Button size="sm" variant="ghost" onClick={() => setRevoking(grant)}>
                        Revoke
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <GrantDialog
        open={open}
        onClose={() => setOpen(false)}
        data={data}
        canDelegate={canDelegate}
        initialSubjectId={data.users[0]?.id}
        onSaved={async () => {
          setOpen(false);
          await onChanged();
        }}
      />

      <Modal
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        title="Revoke access grant"
        description={revoking ? `${revoking.permission} for ${revoking.subjectName}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setRevoking(null)} disabled={saving}>Cancel</Button>
            <Button variant="danger" onClick={revoke} loading={saving} disabled={reason.trim().length < 10}>Revoke grant</Button>
          </>
        }
      >
        <Field label="Revocation reason" htmlFor="revoke-reason" hint="At least 10 characters. Stored in the permission audit trail." required>
          <Input id="revoke-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this grant being removed?" />
        </Field>
      </Modal>
    </div>
  );
}

function GrantDialog({
  open,
  onClose,
  data,
  canDelegate,
  initialSubjectId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  data: AccessCenterData;
  canDelegate: boolean;
  initialSubjectId?: string;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? data.users[0]?.id ?? "");
  const [permission, setPermission] = useState<Permission>(data.permissions[0] ?? "dashboard:view");
  const [effect, setEffect] = useState<"ALLOW" | "DENY">("ALLOW");
  const [scopeType, setScopeType] = useState<AccessScopeType>("GLOBAL");
  const [branchId, setBranchId] = useState(data.branches[0]?.id ?? "");
  const [department, setDepartment] = useState(data.departments[0] ?? "");
  const [recordType, setRecordType] = useState<RecordType>("APPLICATION");
  const [recordId, setRecordId] = useState("");
  const [mode, setMode] = useState<"DIRECT" | "DELEGATED">("DIRECT");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSubjectId(initialSubjectId ?? data.users[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSubjectId]);

  const submit = async () => {
    setSaving(true);
    try {
      await createAccessGrant({
        subjectId,
        permission,
        effect,
        scopeType,
        branchId: scopeType === "BRANCH" ? branchId : null,
        department: scopeType === "DEPARTMENT" ? department : null,
        recordType: scopeType === "RECORD" ? recordType : null,
        recordId: scopeType === "RECORD" ? recordId : null,
        mode,
        reason,
        expiresAt: expiresAt || null,
      });
      toast.success("Grant saved", `${effect} ${permission} recorded and audited.`);
      setReason("");
      setExpiresAt("");
      await onSaved();
    } catch (error) {
      toast.error("Grant failed", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const groups = permissionGroups(data.permissions);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Grant or restrict access"
      description="Individual grants layer on top of the role. Explicit DENY cannot be bypassed by ordinary role or user grants."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!subjectId || reason.trim().length < 10 || (scopeType === "RECORD" && !recordId.trim())}>
            Save grant
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Person" htmlFor="grant-subject" required>
          <Select id="grant-subject" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            {data.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.roleName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Permission" htmlFor="grant-permission" required>
          <Select id="grant-permission" value={permission} onChange={(event) => setPermission(event.target.value as Permission)}>
            {groups.map((group) => (
              <optgroup key={group.module} label={group.module}>
                {group.permissions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Effect" htmlFor="grant-effect" required>
          <Select id="grant-effect" value={effect} onChange={(event) => setEffect(event.target.value as "ALLOW" | "DENY")}>
            <option value="ALLOW">ALLOW — add permission</option>
            <option value="DENY">DENY — explicit restriction</option>
          </Select>
        </Field>
        <Field label="Scope" htmlFor="grant-scope" required>
          <Select id="grant-scope" value={scopeType} onChange={(event) => setScopeType(event.target.value as AccessScopeType)}>
            <option value="GLOBAL">Global</option>
            <option value="BRANCH">Branch</option>
            <option value="DEPARTMENT">Department</option>
            <option value="RECORD">Specific record (ID)</option>
          </Select>
        </Field>
        {scopeType === "BRANCH" ? (
          <Field label="Branch" htmlFor="grant-branch">
            <Select id="grant-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              {data.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        {scopeType === "DEPARTMENT" ? (
          <Field label="Department" htmlFor="grant-department">
            <Select id="grant-department" value={department} onChange={(event) => setDepartment(event.target.value)}>
              {data.departments.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        {scopeType === "RECORD" ? (
          <>
            <Field label="Record type" htmlFor="grant-record-type">
              <Select id="grant-record-type" value={recordType} onChange={(event) => setRecordType(event.target.value as RecordType)}>
                {RECORD_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </Select>
            </Field>
            <Field label="Record ID" htmlFor="grant-record-id" hint="Must be an existing synthetic record ID." required>
              <Input id="grant-record-id" value={recordId} onChange={(event) => setRecordId(event.target.value)} placeholder="e.g. appl-0001" />
            </Field>
          </>
        ) : null}
        <Field label="Grant mode" htmlFor="grant-mode">
          <Select
            id="grant-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as "DIRECT" | "DELEGATED")}
            disabled={!canDelegate}
          >
            <option value="DIRECT">Direct</option>
            <option value="DELEGATED">Delegated</option>
          </Select>
        </Field>
        <Field label="Expires at" htmlFor="grant-expiry" hint="Leave blank for a permanent grant.">
          <Input id="grant-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        </Field>
      </div>
      <Field
        label="Reason"
        htmlFor="grant-reason"
        className="mt-3"
        hint="At least 10 characters. Recorded with grantor, recipient, previous/new permissions and source IP."
        required
      >
        <Input id="grant-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Business justification for this access change" />
      </Field>
      {!canDelegate ? (
        <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-[10.5px] text-ink-500">
          Delegated grants require <code className="text-ink-700">access:delegate</code>. Direct grants remain available subject to your own authority.
        </p>
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* History & compare                                                   */
/* ------------------------------------------------------------------ */

function HistoryPanel({ audits }: { audits: AuditView[] }) {
  return (
    <div className="rounded-xl border border-ink-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-900">
            <History className="h-3.5 w-3.5" /> Permission audit history
          </h4>
          <p className="mt-0.5 text-[10.5px] text-ink-500">Administrator, target, before/after, reason, IP and expiry for every sensitive change.</p>
        </div>
        <span className="rounded-md bg-ink-50 px-2 py-1 text-[10px] font-medium text-ink-600">Append-only in this demo</span>
      </div>
      <div className="divide-y divide-ink-100">
        {audits.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-ink-500">No access changes recorded yet.</p>
        ) : (
          audits.map((entry) => <AuditRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}

function ComparePanel({ data }: { data: AccessCenterData }) {
  const toast = useToast();
  const [left, setLeft] = useState(data.users[0]?.id ?? "");
  const [right, setRight] = useState(data.users[1]?.id ?? data.users[0]?.id ?? "");
  const [result, setResult] = useState<AccessComparison | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await compareAccess(left, right));
    } catch (error) {
      toast.error("Comparison failed", errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Select value={left} onChange={(event) => setLeft(event.target.value)} aria-label="Left user">
          {data.users.map((user) => (
            <option key={user.id} value={user.id}>{user.name} · {user.roleName}</option>
          ))}
        </Select>
        <Select value={right} onChange={(event) => setRight(event.target.value)} aria-label="Right user">
          {data.users.map((user) => (
            <option key={user.id} value={user.id}>{user.name} · {user.roleName}</option>
          ))}
        </Select>
        <Button onClick={run} loading={loading} disabled={!left || !right || left === right}>
          <GitCompareArrows className="h-3.5 w-3.5" /> Compare
        </Button>
      </div>
      {result ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-100 px-3 py-2.5 text-[11px]">
              <p className="font-semibold text-ink-800">{result.left.name}</p>
              <p className="text-ink-500">{result.left.effectiveCount} effective · only here: {result.onlyLeft.length}</p>
            </div>
            <div className="rounded-xl border border-ink-100 px-3 py-2.5 text-[11px]">
              <p className="font-semibold text-ink-800">{result.right.name}</p>
              <p className="text-ink-500">{result.right.effectiveCount} effective · only here: {result.onlyRight.length}</p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[560px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/70 text-[9.5px] uppercase tracking-[0.06em] text-ink-500">
                  <th scope="col" className="px-3 py-2">Permission</th>
                  <th scope="col" className="px-3 py-2 text-center">{result.left.name}</th>
                  <th scope="col" className="px-3 py-2 text-center">{result.right.name}</th>
                  <th scope="col" className="px-3 py-2">Diff</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.permission} className={cn("border-b border-ink-100/70 last:border-0", row.difference === "DIFFERENT" && "bg-amber-50/40")}>
                    <td className="px-3 py-1.5"><code className="text-[10.5px]">{row.permission}</code></td>
                    <td className="px-3 py-1.5 text-center">{row.left ? <Check className="mx-auto h-3 w-3 text-brand-600" /> : <Minus className="mx-auto h-3 w-3 text-ink-300" />}</td>
                    <td className="px-3 py-1.5 text-center">{row.right ? <Check className="mx-auto h-3 w-3 text-brand-600" /> : <Minus className="mx-auto h-3 w-3 text-ink-300" />}</td>
                    <td className="px-3 py-1.5 text-[10px] text-ink-500">{row.difference === "DIFFERENT" ? "Different" : "Same"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AuditRow({ entry, compact = false }: { entry: AuditView; compact?: boolean }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-ink-600">
            {entry.targetType}
          </span>
          <span className="font-semibold text-ink-800">{entry.action.replaceAll("_", " ")}</span>
          <span className="text-ink-500">by {entry.actorName}</span>
        </div>
        <span className="text-[10px] text-ink-400">{formatRelative(entry.at)}</span>
      </div>
      <p className="mt-1 text-[10.5px] text-ink-600">{entry.targetLabel}</p>
      {!compact ? (
        <>
          <div className="mt-1 grid gap-1 text-[10px] text-ink-500 sm:grid-cols-2">
            <p className="truncate"><span className="font-medium text-ink-600">Before:</span> {entry.before.join(", ") || "—"}</p>
            <p className="truncate"><span className="font-medium text-ink-600">After:</span> {entry.after.join(", ") || "—"}</p>
          </div>
          <p className="mt-1 text-[10px] text-ink-500">
            Reason: {entry.reason} · IP {entry.ip}
            {entry.expiresAt ? ` · expiry ${formatDateTime(entry.expiresAt)}` : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}

function GrantStatusPill({ status }: { status: GrantView["status"] }) {
  const styles: Record<GrantView["status"], string> = {
    ACTIVE: "bg-brand-50 text-brand-700 ring-brand-200",
    EXPIRED: "bg-amber-50 text-amber-700 ring-amber-200",
    REVOKED: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ring-1 ring-inset", styles[status])}>
      {status === "ACTIVE" ? <ShieldCheck className="h-2.5 w-2.5" /> : status === "EXPIRED" ? <Clock3 className="h-2.5 w-2.5" /> : <Ban className="h-2.5 w-2.5" />}
      {status}
    </span>
  );
}
