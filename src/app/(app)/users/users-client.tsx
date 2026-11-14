"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Pencil, Plus, Power, Search, ShieldCheck, UserPlus } from "lucide-react";
import type { RoleCode } from "@/lib/types";
import { cn, formatDate, formatRelative } from "@/lib/utils";
import { errorMessage } from "@/lib/api";
import { createUser, setUserStatus, updateUser, type UserDto, type UserFormInput } from "@/services/users";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/input";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { DataTable } from "@/components/ui/data-table";
import { InlineNote } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const formSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name (at least 2 characters).").max(80, "Name is too long."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{8,16}$/, "Enter a valid phone number."),
  role: z.string().trim().min(1, "Select a role."),
  designation: z.string().trim().min(2, "Enter a designation.").max(60, "Designation is too long."),
  branchId: z.string().min(1, "Select a branch."),
});

type FormValues = z.infer<typeof formSchema>;

type EditableUser = UserDto | null;

const rolePill: Record<string, string> = {
  SUPER_ADMIN: "bg-violet-50 text-violet-700 ring-violet-200",
  ADMIN: "bg-brand-50 text-brand-700 ring-brand-200",
  BRANCH_MANAGER: "bg-sky-50 text-sky-700 ring-sky-200",
  LOAN_OFFICER: "bg-ink-100 text-ink-700 ring-ink-200",
  CREDIT_OFFICER: "bg-amber-50 text-amber-700 ring-amber-200",
  COLLECTION_OFFICER: "bg-rose-50 text-rose-700 ring-rose-200",
};

type RoleOption = {
  code: RoleCode;
  name: string;
  rank: number;
  isSystem: boolean;
  isGlobal: boolean;
};

export function UsersClient({
  items,
  branches,
  values,
  canManage,
  canAssignSuperAdmin,
  currentUserId,
  isGlobal,
  roles,
  protectedSuperAdminId,
}: {
  items: UserDto[];
  branches: { id: string; name: string }[];
  values: { q?: string; role?: string; status?: string; branch?: string };
  canManage: boolean;
  canAssignSuperAdmin: boolean;
  currentUserId: string;
  isGlobal: boolean;
  roles: RoleOption[];
  protectedSuperAdminId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [search, setSearch] = useState(values.q ?? "");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditableUser>(null);
  const [roleConfirm, setRoleConfirm] = useState<{ next: FormValues; previousRole: RoleCode | null } | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<UserDto | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeFilterCount = [values.q, values.role, values.status, values.branch].filter(Boolean).length;

  const navigate = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  const reset = () => {
    setSearch("");
    router.replace(pathname, { scroll: false });
  };

  const roleOptions = useMemo(
    () => roles.filter((role) => role.code !== "SUPER_ADMIN" || canAssignSuperAdmin),
    [roles, canAssignSuperAdmin],
  );
  const roleName = (code: string) => roles.find((role) => role.code === code)?.name ?? code.replaceAll("_", " ");

  const submitForm = async (payload: FormValues, target: EditableUser) => {
    setSubmitting(true);
    try {
      if (target) {
        await updateUser(target.id, { action: "UPDATE", ...payload });
        toast.success("User updated", `${payload.name}'s profile was saved.`);
      } else {
        await createUser(payload);
        toast.success("User created", `${payload.name} can sign in with the demo password.`);
      }
      setRoleConfirm(null);
      setFormOpen(false);
      setEditing(null);
      router.refresh();
    } catch (error) {
      toast.error("Could not save user", errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormSubmit = (payload: FormValues) => {
    const previousRole = editing?.role ?? null;
    const baseline = editing?.role ?? "LOAN_OFFICER";
    if (payload.role !== baseline) {
      setRoleConfirm({ next: payload, previousRole });
      return;
    }
    void submitForm(payload, editing);
  };

  const confirmStatusChange = async () => {
    if (!statusConfirm) return;
    const next = statusConfirm.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setSubmitting(true);
    try {
      await setUserStatus(statusConfirm.id, next);
      toast.success(next === "ACTIVE" ? "User activated" : "User deactivated", `${statusConfirm.name} is now ${next.toLowerCase()}.`);
      setStatusConfirm(null);
      router.refresh();
    } catch (error) {
      toast.error("Could not update status", errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<UserDto, any>[]>(
    () => [
      {
        id: "user",
        header: "Team member",
        accessorFn: (row) => `${row.name} ${row.email}`,
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={row.original.name} color={row.original.avatarColor} size="sm" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-900">
                <span className="max-w-[13rem] truncate">{row.original.name}</span>
                {row.original.isSelf ? (
                  <span className="rounded bg-brand-50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-700">
                    You
                  </span>
                ) : null}
              </p>
              <p className="max-w-[15rem] truncate text-[10.5px] text-ink-400">{row.original.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: "role",
        header: "Role",
        accessorFn: (row) => roleName(row.role),
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              rolePill[row.original.role] ?? "bg-ink-100 text-ink-700 ring-ink-200",
            )}
          >
            {roleName(row.original.role)}
          </span>
        ),
      },
      {
        id: "branch",
        header: "Branch",
        accessorFn: (row) => row.branchName,
        cell: ({ row }) => <span className="text-[12px] text-ink-700">{row.original.branchName}</span>,
      },
      {
        id: "designation",
        header: "Designation",
        accessorFn: (row) => row.designation,
        cell: ({ row }) => <span className="text-[12px] text-ink-600">{row.original.designation}</span>,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "lastLogin",
        header: "Last login",
        accessorFn: (row) => row.lastLoginAt ?? "",
        cell: ({ row }) =>
          row.original.lastLoginAt ? (
            <div className="leading-tight">
              <p className="text-[12px] text-ink-700">{formatRelative(row.original.lastLoginAt)}</p>
              <p className="text-[10px] text-ink-400">{formatDate(row.original.lastLoginAt)}</p>
            </div>
          ) : (
            <span className="text-[12px] text-ink-400">Never</span>
          ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const target = row.original;
          const protectedIdentity = target.id === protectedSuperAdminId;
          const protectSuperAdmin = target.role === "SUPER_ADMIN" && !canAssignSuperAdmin;
          const selfDeactivate = target.isSelf && target.status === "ACTIVE";
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!canManage || protectSuperAdmin || protectedIdentity}
                title={
                  !canManage
                    ? "You do not have permission to edit users"
                    : protectedIdentity
                      ? "The protected Super Admin identity is locked"
                      : protectSuperAdmin
                        ? "Only a Super Admin can modify Super Admin accounts"
                        : "Edit user"
                }
                onClick={() => {
                  setEditing(target);
                  setFormOpen(true);
                }}
                aria-label={`Edit ${target.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7", target.status === "ACTIVE" ? "text-rose-600 hover:bg-rose-50" : "text-brand-700 hover:bg-brand-50")}
                disabled={!canManage || protectSuperAdmin || protectedIdentity || selfDeactivate}
                title={
                  selfDeactivate
                    ? "You cannot deactivate your own account"
                    : protectedIdentity
                      ? "The protected Super Admin identity is locked"
                      : protectSuperAdmin
                        ? "Only a Super Admin can modify Super Admin accounts"
                        : target.status === "ACTIVE"
                          ? "Deactivate user"
                          : "Activate user"
                }
                onClick={() => setStatusConfirm(target)}
                aria-label={target.status === "ACTIVE" ? `Deactivate ${target.name}` : `Activate ${target.name}`}
              >
                <Power className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        },
      },
    ],
    [canAssignSuperAdmin, canManage, protectedSuperAdminId, roles],
  );

  return (
    <div className="space-y-4">
      <FilterBar activeCount={activeFilterCount} onReset={reset}>
        <FilterField label="Search">
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              navigate({ q: search.trim() || undefined });
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, designation…"
              aria-label="Search team members"
              className="h-9 w-full min-w-[11rem] pl-8 text-[11.5px]"
            />
          </form>
        </FilterField>

        <FilterField label="Role">
          <Select
            value={values.role ?? ""}
            onChange={(event) => navigate({ role: event.target.value || undefined })}
            className="h-9 min-w-[9rem] text-[11.5px]"
          >
            <option value="">All roles</option>
            {roles.map((role) => (
              <option key={role.code} value={role.code}>
                {role.name}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Status">
          <Select
            value={values.status ?? ""}
            onChange={(event) => navigate({ status: event.target.value || undefined })}
            className="h-9 min-w-[7.5rem] text-[11.5px]"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </FilterField>

        {branches.length > 1 ? (
          <FilterField label="Branch">
            <Select
              value={values.branch ?? ""}
              onChange={(event) => navigate({ branch: event.target.value || undefined })}
              className="h-9 min-w-[10rem] text-[11.5px]"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </FilterField>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          className="h-9 px-2.5"
          onClick={() => navigate({ q: search.trim() || undefined })}
        >
          <Search className="h-3.5 w-3.5" /> Apply
        </Button>
      </FilterBar>

      <DataTable
        data={items}
        columns={columns}
        hideSearch
        initialPageSize={10}
        getSearchText={(row) => `${row.name} ${row.email} ${row.designation} ${row.role}`}
        emptyTitle="No team members match these filters"
        emptyDescription={
          isGlobal
            ? "Try a different role, status or branch, or create a new team member."
            : "Only team members from your branch are visible. Try clearing the filters."
        }
        toolbar={
          canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add user
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[10.5px] font-medium text-ink-500">
              <ShieldCheck className="h-3 w-3" /> Read-only access
            </span>
          )
        }
        footer={<span>{items.length} team member{items.length === 1 ? "" : "s"} shown</span>}
      />

      <p className="text-[10.5px] leading-relaxed text-ink-500">
        Password hashes are never returned by the API. Status changes and role edits are written to the append-only
        audit trail with your actor identity. Super Admin accounts can only be modified by a Super Admin.
      </p>

      <UserFormModal
        open={formOpen && !roleConfirm}
        editing={editing}
        branches={branches}
        roleOptions={roleOptions}
        submitting={submitting}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleFormSubmit}
      />

      <ConfirmDialog
        open={Boolean(roleConfirm)}
        onClose={() => setRoleConfirm(null)}
        onConfirm={() => {
          if (roleConfirm) void submitForm(roleConfirm.next, editing);
        }}
        title="Confirm role assignment"
        description={
          roleConfirm
            ? `Assign the ${roleName(roleConfirm.next.role)} role to ${
                roleConfirm.next.name
              }? This changes their permissions immediately${
                roleConfirm.previousRole
                  ? ` (previously ${roleName(roleConfirm.previousRole)})`
                  : ""
              }.`
            : ""
        }
        confirmLabel="Assign role"
        loading={submitting}
      />

      <ConfirmDialog
        open={Boolean(statusConfirm)}
        onClose={() => setStatusConfirm(null)}
        onConfirm={() => void confirmStatusChange()}
        title={statusConfirm?.status === "ACTIVE" ? "Deactivate user" : "Activate user"}
        description={
          statusConfirm
            ? statusConfirm.status === "ACTIVE"
              ? `${statusConfirm.name} will be signed out of any active session and cannot sign in until reactivated.`
              : `${statusConfirm.name} will be able to sign in again with the demo password.`
            : ""
        }
        confirmLabel={statusConfirm?.status === "ACTIVE" ? "Deactivate" : "Activate"}
        destructive={statusConfirm?.status === "ACTIVE"}
        loading={submitting}
      />
    </div>
  );
}

function UserFormModal({
  open,
  editing,
  branches,
  roleOptions,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: EditableUser;
  branches: { id: string; name: string }[];
  roleOptions: RoleOption[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const defaultValues = useMemo<FormValues>(
    () => ({
      name: editing?.name ?? "",
      email: editing?.email ?? "",
      phone: editing?.phone ?? "",
      role: editing?.role ?? roleOptions[0]?.code ?? "LOAN_OFFICER",
      designation: editing?.designation ?? "",
      branchId: editing?.branchId ?? branches[0]?.id ?? "",
    }),
    [editing, branches, roleOptions],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit team member" : "Add team member"}
      description={
        editing
          ? "Update directory details. Role changes require confirmation."
          : "New users are created ACTIVE with the shared demo password."
      }
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={submitting}>
            {editing ? "Save changes" : "Create user"}
          </Button>
        </>
      }
    >
      <UserForm
        key={editing?.id ?? "new"}
        defaultValues={defaultValues}
        branches={branches}
        roleOptions={roleOptions}
        onSubmit={onSubmit}
        submitting={submitting}
      />
    </Modal>
  );
}

function UserForm({
  defaultValues,
  branches,
  roleOptions,
  onSubmit,
  submitting,
}: {
  defaultValues: FormValues;
  branches: { id: string; name: string }[];
  roleOptions: RoleOption[];
  onSubmit: (values: FormValues) => void;
  submitting: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues });

  return (
    <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="user-name" required error={errors.name?.message}>
          <Input id="user-name" placeholder="e.g. Neha Kulkarni" {...register("name")} />
        </Field>
        <Field label="Email" htmlFor="user-email" required error={errors.email?.message} hint="Stored lowercase; must be unique.">
          <Input id="user-email" type="email" placeholder="name@fincloud.demo" {...register("email")} />
        </Field>
        <Field label="Phone" htmlFor="user-phone" required error={errors.phone?.message}>
          <Input id="user-phone" placeholder="+91 98765 43210" {...register("phone")} />
        </Field>
        <Field label="Designation" htmlFor="user-designation" required error={errors.designation?.message}>
          <Input id="user-designation" placeholder="e.g. Credit Analyst" {...register("designation")} />
        </Field>
        <Field label="Role" htmlFor="user-role" required error={errors.role?.message}>
          <Select id="user-role" {...register("role")}>
            {roleOptions.map((role) => (
              <option key={role.code} value={role.code}>
                {role.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Branch" htmlFor="user-branch" required error={errors.branchId?.message}>
          <Select id="user-branch" {...register("branchId")}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <InlineNote tone="warning">
        Demo password: <span className="font-semibold">Fincloud@2026</span>. It is stored as a scrypt hash and is never
        returned by the API. Share it with the team member through your usual onboarding process (no email is sent in
        this demo).
      </InlineNote>

      {submitting ? (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-500">
          <KeyRound className="h-3.5 w-3.5" /> Saving to the synthetic store and writing an audit entry…
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
          <UserPlus className="h-3.5 w-3.5" /> All mutations are audited with your actor identity.
        </p>
      )}
    </form>
  );
}
