"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, FileSignature, Plus, ShieldAlert, ShieldCheck, PencilLine } from "lucide-react";
import { humanize } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/utils";
import { errorMessage } from "@/lib/api";
import type { BlacklistRow, EsignRow, GrievanceRow } from "@/server/operations";
import {
  addBlacklistEntry,
  updateGrievance,
  type GrievanceStatus,
} from "@/services/operations";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { InlineNote } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const blacklistSchema = z.object({
  name: z.string().trim().min(2, "Enter the entity or customer name.").max(80, "Name is too long."),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value), {
      message: "Use PAN format ABCDE1234F (synthetic values only).",
    }),
  phone: z
    .string()
    .trim()
    .regex(/^(\+91[\s-]?)?[6-9][0-9]{9}$/, "Enter a valid 10-digit Indian mobile number."),
  reason: z.string().trim().min(8, "Describe the reason (at least 8 characters).").max(240, "Reason is too long."),
  source: z.enum(["Internal review", "Collections", "Credit", "Operations", "Branch"]),
});

type BlacklistForm = z.infer<typeof blacklistSchema>;

const STATUS_OPTIONS: GrievanceStatus[] = ["OPEN", "IN_REVIEW", "RESOLVED"];

export function OperationsBoard({
  esign,
  blacklist,
  grievances,
  canManage,
}: {
  esign: EsignRow[];
  blacklist: BlacklistRow[];
  grievances: GrievanceRow[];
  canManage: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [grievanceTarget, setGrievanceTarget] = useState<GrievanceRow | null>(null);

  return (
    <div className="space-y-4">
      <Tabs
        defaultTab="esign"
        tabs={[
          { key: "esign", label: "eSign", count: esign.length, content: <EsignTable rows={esign} /> },
          {
            key: "blacklist",
            label: "Blacklist",
            count: blacklist.length,
            content: (
              <BlacklistTable
                rows={blacklist}
                canManage={canManage}
                onAdd={() => setAddOpen(true)}
              />
            ),
          },
          {
            key: "grievances",
            label: "Grievances",
            count: grievances.length,
            content: (
              <GrievanceTable
                rows={grievances}
                canManage={canManage}
                onUpdate={(row) => setGrievanceTarget(row)}
              />
            ),
          },
        ]}
      />

      <BlacklistModal open={addOpen} onClose={() => setAddOpen(false)} />

      <GrievanceModal target={grievanceTarget} onClose={() => setGrievanceTarget(null)} />
    </div>
  );
}

function EsignTable({ rows }: { rows: EsignRow[] }) {
  const columns: ColumnDef<EsignRow, any>[] = [
    {
      id: "application",
      header: "Application",
      accessorFn: (row) => `${row.applicationRef} ${row.customerName}`,
      cell: ({ row }) => (
        <Link
          href={`/applications/${row.original.applicationId}`}
          className="inline-flex items-center gap-1 font-mono text-[11.5px] font-medium text-brand-700 hover:text-brand-800"
        >
          {row.original.applicationRef} <ExternalLink className="h-3 w-3" />
        </Link>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      accessorFn: (row) => row.customerName,
      cell: ({ row }) => <span className="text-[12px] text-ink-700">{row.original.customerName}</span>,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => row.status,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "provider",
      header: "Provider",
      accessorFn: (row) => row.provider,
      cell: ({ row }) => (
        <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">
          {row.original.provider}
        </span>
      ),
    },
    {
      id: "initiated",
      header: "Initiated",
      accessorFn: (row) => row.initiatedAt ?? "",
      cell: ({ row }) =>
        row.original.initiatedAt ? (
          <span className="text-[11.5px] text-ink-600">{formatDate(row.original.initiatedAt)}</span>
        ) : (
          <span className="text-[11.5px] text-ink-300">—</span>
        ),
    },
    {
      id: "completed",
      header: "Completed",
      accessorFn: (row) => row.completedAt ?? "",
      cell: ({ row }) =>
        row.original.completedAt ? (
          <span className="text-[11.5px] text-ink-600">{formatDate(row.original.completedAt)}</span>
        ) : (
          <span className="text-[11.5px] text-ink-300">—</span>
        ),
    },
    {
      id: "branch",
      header: "Branch",
      accessorFn: (row) => row.branchName,
      cell: ({ row }) => <span className="text-[11px] text-ink-500">{row.original.branchName}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <InlineNote tone="warning">
        eSign is a DEMO placeholder and is not connected to any provider. Links, statuses and dates are synthetic;
        nothing is sent to a signing service.
      </InlineNote>
      <DataTable
        data={rows}
        columns={columns}
        hideSearch
        initialPageSize={10}
        getSearchText={(row) => `${row.applicationRef} ${row.customerName} ${row.status}`}
        emptyTitle="No eSign requests in scope"
        emptyDescription="eSign requests appear once an application reaches sanction. Only your branch is visible."
        footer={<span>{rows.length} request{rows.length === 1 ? "" : "s"}</span>}
      />
    </div>
  );
}

function BlacklistTable({ rows, canManage, onAdd }: { rows: BlacklistRow[]; canManage: boolean; onAdd: () => void }) {
  const columns: ColumnDef<BlacklistRow, any>[] = [
    {
      id: "name",
      header: "Entity",
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <ShieldAlert className="h-3.5 w-3.5" />
          </span>
          <span className="text-[12px] font-medium text-ink-800">{row.original.name}</span>
        </div>
      ),
    },
    {
      id: "pan",
      header: "PAN (masked)",
      accessorFn: (row) => row.panMasked,
      cell: ({ row }) => <span className="font-mono text-[11.5px] text-ink-700">{row.original.panMasked}</span>,
    },
    {
      id: "phone",
      header: "Phone (masked)",
      accessorFn: (row) => row.phone,
      cell: ({ row }) => <span className="font-mono text-[11.5px] text-ink-700">{row.original.phone}</span>,
    },
    {
      id: "reason",
      header: "Reason",
      accessorFn: (row) => row.reason,
      cell: ({ row }) => <p className="max-w-[16rem] truncate text-[11.5px] text-ink-600">{row.original.reason}</p>,
    },
    {
      id: "source",
      header: "Source",
      accessorFn: (row) => row.source,
      cell: ({ row }) => <span className="text-[11.5px] text-ink-600">{row.original.source}</span>,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => row.status,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "added",
      header: "Added",
      accessorFn: (row) => row.addedAt,
      cell: ({ row }) => (
        <div className="leading-tight">
          <p className="text-[11.5px] text-ink-700">{formatDate(row.original.addedAt)}</p>
          <p className="text-[10px] text-ink-400">by {row.original.addedByName}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <InlineNote>
        Identifiers are stored masked only — no full PAN, Aadhaar or phone numbers are persisted, and no bureau or
        fraud-network integration is called. Entries are scoped to the branch of the officer who added them.
      </InlineNote>
      <DataTable
        data={rows}
        columns={columns}
        hideSearch
        initialPageSize={10}
        getSearchText={(row) => `${row.name} ${row.reason} ${row.source}`}
        emptyTitle="No blacklist entries in scope"
        emptyDescription="Add a synthetic entry to test the negative-list workflow for your branch."
        toolbar={
          canManage ? (
            <Button size="sm" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" /> Add entry
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[10.5px] font-medium text-ink-500">
              <ShieldCheck className="h-3 w-3" /> Read-only access
            </span>
          )
        }
        footer={<span>{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span>}
      />
    </div>
  );
}

function GrievanceTable({
  rows,
  canManage,
  onUpdate,
}: {
  rows: GrievanceRow[];
  canManage: boolean;
  onUpdate: (row: GrievanceRow) => void;
}) {
  const columns: ColumnDef<GrievanceRow, any>[] = [
    {
      id: "ref",
      header: "Grievance",
      accessorFn: (row) => row.ref,
      cell: ({ row }) => <span className="font-mono text-[11.5px] font-medium text-ink-800">{row.original.ref}</span>,
    },
    {
      id: "customer",
      header: "Customer",
      accessorFn: (row) => row.customerName,
      cell: ({ row }) => (
        <div className="leading-tight">
          <p className="text-[12px] text-ink-700">{row.original.customerName}</p>
          <p className="text-[10px] text-ink-400">{row.original.branchName}</p>
        </div>
      ),
    },
    {
      id: "category",
      header: "Category",
      accessorFn: (row) => row.category,
      cell: ({ row }) => <span className="text-[11.5px] text-ink-600">{humanize(row.original.category)}</span>,
    },
    {
      id: "priority",
      header: "Priority",
      accessorFn: (row) => row.priority,
      cell: ({ row }) => <StatusBadge status={row.original.priority} dot={false} />,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => row.status,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "assignee",
      header: "Assignee",
      accessorFn: (row) => row.assigneeName,
      cell: ({ row }) => <span className="text-[11.5px] text-ink-600">{row.original.assigneeName}</span>,
    },
    {
      id: "dates",
      header: "Created / resolved",
      accessorFn: (row) => row.createdAt,
      cell: ({ row }) => (
        <div className="leading-tight">
          <p className="text-[11px] text-ink-600">{formatDate(row.original.createdAt)}</p>
          <p className="text-[10px] text-ink-400">
            {row.original.resolvedAt ? `Resolved ${formatDate(row.original.resolvedAt)}` : "Not resolved"}
          </p>
        </div>
      ),
    },
    {
      id: "action",
      header: "Action",
      enableSorting: false,
      cell: ({ row }) =>
        canManage ? (
          <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onUpdate(row.original)}>
            <PencilLine className="h-3 w-3" /> Update
          </Button>
        ) : (
          <span className="text-[10.5px] text-ink-400">Read-only</span>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <InlineNote>
        Grievances are synthetic service requests. Status changes and notes are audited; no customer communication is
        actually sent in this demo.
      </InlineNote>
      <DataTable
        data={rows}
        columns={columns}
        hideSearch
        initialPageSize={10}
        getSearchText={(row) => `${row.ref} ${row.customerName} ${row.category} ${row.status}`}
        emptyTitle="No grievances in scope"
        emptyDescription="Grievances raised for customers in your branch will appear here."
        footer={<span>{rows.length} grievance{rows.length === 1 ? "" : "s"}</span>}
      />
    </div>
  );
}

function BlacklistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BlacklistForm>({
    resolver: zodResolver(blacklistSchema),
    defaultValues: { name: "", pan: "", phone: "", reason: "", source: "Internal review" },
  });

  const submit = async (values: BlacklistForm) => {
    setSubmitting(true);
    try {
      await addBlacklistEntry({
        name: values.name,
        pan: values.pan || undefined,
        phone: values.phone,
        reason: values.reason,
        source: values.source,
      });
      toast.success("Blacklist entry added", "Identifiers were masked before storage and the action was audited.");
      reset();
      onClose();
      router.refresh();
    } catch (error) {
      toast.error("Could not add entry", errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add blacklist entry"
      description="Negative-list entries are stored with masked identifiers only."
      size="md"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="blacklist-form" loading={submitting}>
            Add entry
          </Button>
        </>
      }
    >
      <form id="blacklist-form" onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field label="Entity / customer name" htmlFor="bl-name" required error={errors.name?.message}>
          <Input id="bl-name" placeholder="e.g. Synthetic Entity E" {...register("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PAN (optional)" htmlFor="bl-pan" error={errors.pan?.message} hint="Masked before storage.">
            <Input id="bl-pan" placeholder="ABCDE1234F" className="uppercase" {...register("pan")} />
          </Field>
          <Field label="Mobile number" htmlFor="bl-phone" required error={errors.phone?.message} hint="Masked to last 4 digits.">
            <Input id="bl-phone" placeholder="9876543210" {...register("phone")} />
          </Field>
        </div>
        <Field label="Source" htmlFor="bl-source" required error={errors.source?.message}>
          <Select id="bl-source" {...register("source")}>
            {["Internal review", "Collections", "Credit", "Operations", "Branch"].map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" htmlFor="bl-reason" required error={errors.reason?.message}>
          <Textarea
            id="bl-reason"
            placeholder="Synthetic fraud or risk signal observed in DEMO checks…"
            {...register("reason")}
          />
        </Field>
        <InlineNote tone="warning">
          Do not enter real personal data. Only masked identifiers are persisted and the entry is audited as
          BLACKLIST_ADDED.
        </InlineNote>
      </form>
    </Modal>
  );
}

function GrievanceModal({ target, onClose }: { target: GrievanceRow | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<GrievanceStatus>("OPEN");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setStatus(target.status);
      setNote("");
      setError(null);
    }
  }, [target]);

  const open = Boolean(target);

  const submit = async () => {
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateGrievance(target.id, { status, note: note.trim() || undefined });
      toast.success("Grievance updated", `${target.ref} moved to ${status.replaceAll("_", " ").toLowerCase()}.`);
      setNote("");
      onClose();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={target ? `Update ${target.ref}` : "Update grievance"}
      description={target ? `${target.customerName} · ${humanize(target.category)} · ${target.branchName}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={submitting} disabled={!target}>
            Save update
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Status" htmlFor="gr-status" required>
          <Select
            id="gr-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as GrievanceStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Note (optional)"
          htmlFor="gr-note"
          error={error ?? undefined}
          hint="Recorded in the audit trail with your actor identity."
        >
          <Textarea
            id="gr-note"
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Resolution summary, callback outcome or escalation detail…"
          />
        </Field>
        <div className="flex items-center justify-between text-[10.5px] text-ink-400">
          <span>{note.length}/300 characters</span>
          <span className="inline-flex items-center gap-1">
            <FileSignature className="h-3 w-3" /> Audited action
          </span>
        </div>
        {target?.description ? (
          <div className="rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Reported issue</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{target.description}</p>
            <p className="mt-1 text-[10px] text-ink-400">
              Raised {formatDateTime(target.createdAt)} · Assigned to {target.assigneeName}
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
