"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { PRODUCT_LABELS } from "@/lib/labels";
import { formatDateShort, formatINR } from "@/lib/utils";
import type { DisbursementRow } from "@/server/disbursements";

const columns: ColumnDef<DisbursementRow, any>[] = [
  {
    accessorKey: "ref",
    header: "Disbursement",
    cell: ({ row }) => (
      <div className="min-w-0">
        <Link
          href={`/disbursements/${row.original.id}`}
          className="font-medium text-brand-700 underline-offset-2 hover:underline"
        >
          {row.original.ref}
        </Link>
        <p className="mt-0.5 text-[10.5px] text-ink-400">{row.original.branchName}</p>
      </div>
    ),
  },
  {
    accessorKey: "customerName",
    header: "Customer",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="font-medium text-ink-900">{row.original.customerName}</p>
        <p className="mt-0.5 text-[10.5px] text-ink-400">
          {PRODUCT_LABELS[row.original.product] ?? row.original.product}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "applicationRef",
    header: "Application",
    cell: ({ row }) => (
      <Link
        href={`/applications/${row.original.applicationId}`}
        className="text-[12px] text-ink-600 underline-offset-2 hover:text-brand-700 hover:underline"
      >
        {row.original.applicationRef}
      </Link>
    ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => <span className="font-medium tabular text-ink-900">{formatINR(row.original.amount)}</span>,
  },
  {
    accessorKey: "mode",
    header: "Mode",
    cell: ({ row }) => (
      <span className="inline-flex items-center rounded-md bg-ink-50 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600 ring-1 ring-ink-100">
        {row.original.mode}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "requestedAt",
    header: "Requested",
    cell: ({ row }) => <span className="text-[12px] text-ink-600">{formatDateShort(row.original.requestedAt)}</span>,
  },
  {
    accessorKey: "processedByName",
    header: "Processed by",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="text-[12px] text-ink-700">{row.original.processedByName ?? "—"}</p>
        <p className="mt-0.5 text-[10.5px] text-ink-400">
          {row.original.processedAt
            ? formatDateShort(row.original.processedAt)
            : row.original.processedByName
              ? "In progress"
              : "Not started"}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "bankRef",
    header: "Bank ref",
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-ink-600">{row.original.bankRef ?? "—"}</span>
    ),
  },
  {
    id: "action",
    header: "",
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        href={`/disbursements/${row.original.id}`}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-brand-700 transition hover:bg-brand-50"
      >
        {["NEW", "IN_PROCESS", "RECOMMENDED", "PENDING"].includes(row.original.status) ? "Process" : "Open"}
        <ArrowRight className="h-3 w-3" />
      </Link>
    ),
  },
];

export function DisbursementTable({ rows, tabLabel }: { rows: DisbursementRow[]; tabLabel: string }) {
  return (
    <DataTable<DisbursementRow>
      data={rows}
      columns={columns}
      initialPageSize={10}
      searchPlaceholder="Search ref, customer, bank ref…"
      getSearchText={(row) =>
        [
          row.ref,
          row.applicationRef,
          row.customerName,
          row.processedByName,
          row.bankRef,
          row.mode,
          row.status,
          row.branchName,
        ]
          .filter(Boolean)
          .join(" ")
      }
      emptyTitle={`No disbursements in "${tabLabel}"`}
      emptyDescription="Disbursements are created from approved sanctions. Adjust the filters or check the sanctions desk."
    />
  );
}
