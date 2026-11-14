"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { LEAD_TYPE_LABELS, SOURCE_LABELS } from "@/lib/labels";
import { formatDate, formatINR, formatRelative } from "@/lib/utils";
import type { LeadListItem } from "@/server/leads";

export function LeadTable({ items, canManage }: { items: LeadListItem[]; canManage: boolean }) {
  const router = useRouter();

  const columns: ColumnDef<LeadListItem, any>[] = [
    {
      id: "lead",
      header: "Lead",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-[11rem]">
          <p className="font-medium text-ink-900">{row.original.customerName}</p>
          <p className="mt-0.5 text-[11px] text-ink-400 tabular">{row.original.ref}</p>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="tabular text-ink-700">{row.original.phone}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">{row.original.city}</p>
        </div>
      ),
    },
    {
      id: "context",
      header: "Type / Source",
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="text-ink-700">{LEAD_TYPE_LABELS[row.original.type] ?? row.original.type}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">{SOURCE_LABELS[row.original.source] ?? row.original.source}</p>
        </div>
      ),
    },
    {
      id: "income",
      header: "Monthly income",
      accessorFn: (row) => row.monthlyIncome,
      cell: ({ getValue }) => <span className="tabular">{formatINR(getValue() as number)}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "owner",
      header: "Owner",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.original.ownerName} color={row.original.ownerColor} size="xs" />
          <span className="text-ink-700">{row.original.ownerName}</span>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => <span className="tabular">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: "followUp",
      header: "Next follow-up",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.nextFollowUpAt ? (
          <div>
            <p className="tabular text-ink-700">{formatDate(row.original.nextFollowUpAt)}</p>
            <p className="mt-0.5 text-[11px] text-ink-400">{formatRelative(row.original.nextFollowUpAt)}</p>
          </div>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      id: "application",
      header: "Application",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.applicationRef && row.original.applicationId ? (
          <Link
            href={`/applications/${row.original.applicationId}`}
            onClick={(event) => event.stopPropagation()}
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            {row.original.applicationRef}
          </Link>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
  ];

  return (
    <DataTable
      data={items}
      columns={columns}
      getSearchText={(lead) => `${lead.customerName} ${lead.ref} ${lead.phone} ${lead.email} ${lead.city}`}
      searchPlaceholder="Filter this list…"
      initialPageSize={10}
      onRowClick={(lead) => router.push(`/leads/${lead.id}`)}
      emptyTitle={canManage ? "No leads match these filters" : "No leads available"}
      emptyDescription="Adjust the search, status, owner or date range to widen the result set."
      footer={<span>Click a row to open the lead workspace</span>}
    />
  );
}
