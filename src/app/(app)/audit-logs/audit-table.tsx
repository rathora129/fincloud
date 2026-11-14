"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Lock, ScrollText } from "lucide-react";
import { ROLE_LABELS } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/utils";
import type { AuditEntry } from "@/server/audit";
import { Avatar } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";

export function AuditTable({ items }: { items: AuditEntry[] }) {
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const columns: ColumnDef<AuditEntry, any>[] = [
    {
      id: "at",
      header: "Timestamp",
      accessorFn: (row) => row.at,
      cell: ({ row }) => (
        <div className="leading-tight">
          <p className="text-[12px] font-medium text-ink-800">{formatDateTime(row.original.at)}</p>
          <p className="text-[10px] text-ink-400">{formatRelative(row.original.at)}</p>
        </div>
      ),
    },
    {
      id: "actor",
      header: "Actor",
      accessorFn: (row) => row.actorName,
      cell: ({ row }) => {
        const actor = row.original;
        return (
          <div className="flex items-center gap-2">
            <Avatar name={actor.actorName} color={actor.actorColor} size="xs" />
            <div className="min-w-0 leading-tight">
              <p className="max-w-[10rem] truncate text-[12px] font-medium text-ink-800">{actor.actorName}</p>
              <p className="max-w-[11rem] truncate text-[10px] text-ink-400">
                {actor.actorRole ? ROLE_LABELS[actor.actorRole] ?? actor.actorRole : "System"}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "action",
      header: "Action",
      accessorFn: (row) => row.action,
      cell: ({ row }) => (
        <span className="inline-flex whitespace-nowrap rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-ink-700">
          {row.original.action}
        </span>
      ),
    },
    {
      id: "entity",
      header: "Entity",
      accessorFn: (row) => `${row.entityType} ${row.entityId}`,
      cell: ({ row }) => (
        <div className="leading-tight">
          <p className="text-[11.5px] text-ink-700">{row.original.entityType}</p>
          <p className="max-w-[9rem] truncate font-mono text-[10px] text-ink-400">{row.original.entityId}</p>
        </div>
      ),
    },
    {
      id: "summary",
      header: "Summary",
      accessorFn: (row) => row.summary,
      cell: ({ row }) => <p className="max-w-[18rem] truncate text-[11.5px] text-ink-600">{row.original.summary}</p>,
    },
    {
      id: "branch",
      header: "Branch",
      accessorFn: (row) => row.branchName,
      cell: ({ row }) => <span className="text-[11px] text-ink-500">{row.original.branchName}</span>,
    },
    {
      id: "ip",
      header: "IP",
      accessorFn: (row) => row.ip,
      cell: ({ row }) => <span className="font-mono text-[10.5px] text-ink-500">{row.original.ip}</span>,
    },
  ];

  return (
    <>
      <DataTable
        data={items}
        columns={columns}
        hideSearch
        initialPageSize={10}
        onRowClick={(row) => setSelected(row)}
        getSearchText={(row) => `${row.action} ${row.summary} ${row.entityId} ${row.actorName}`}
        emptyTitle="No audit records in scope"
        emptyDescription="Adjust the filters or widen the date range. Non-global roles only see activity from their own branch."
        toolbar={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[10.5px] font-medium text-ink-500">
            <Lock className="h-3 w-3" /> Read-only · append-only
          </span>
        }
        footer={<span>{items.length} record{items.length === 1 ? "" : "s"} · click a row for raw fields</span>}
      />

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Audit record"
        description="Immutable DEMO audit entry. Fields are shown exactly as stored."
        size="md"
        footer={
          <span className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-400">
            <ScrollText className="h-3.5 w-3.5" /> Audit entries cannot be edited or deleted in this demo.
          </span>
        }
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {[
                { label: "Record ID", value: selected.id },
                { label: "Action", value: selected.action },
                { label: "Entity type", value: selected.entityType },
                { label: "Entity ID", value: selected.entityId },
                { label: "Actor", value: `${selected.actorName}${selected.actorRole ? ` · ${ROLE_LABELS[selected.actorRole] ?? selected.actorRole}` : ""}` },
                { label: "Branch", value: selected.branchName },
                { label: "Timestamp", value: `${formatDateTime(selected.at)} (${selected.at})` },
                { label: "Source IP", value: selected.ip },
              ].map((field) => (
                <div key={field.label} className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">{field.label}</dt>
                  <dd className="mt-0.5 break-words font-mono text-[11.5px] text-ink-800">{field.value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Summary</p>
              <p className="mt-1 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2 text-[12px] leading-relaxed text-ink-700">
                {selected.summary}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Raw fields</p>
              <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-brand-100">
                {JSON.stringify(
                  {
                    id: selected.id,
                    at: selected.at,
                    actorId: selected.actorId,
                    action: selected.action,
                    entityType: selected.entityType,
                    entityId: selected.entityId,
                    summary: selected.summary,
                    ip: selected.ip,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
