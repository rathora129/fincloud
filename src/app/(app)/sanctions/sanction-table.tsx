"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { PRODUCT_LABELS } from "@/lib/labels";
import { formatDateShort, formatINR } from "@/lib/utils";
import type { SanctionRow } from "@/server/sanctions";

const columns: ColumnDef<SanctionRow, any>[] = [
  {
    accessorKey: "ref",
    header: "Sanction",
    cell: ({ row }) => (
      <div className="min-w-0">
        <Link
          href={`/sanctions/${row.original.id}`}
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
          {PRODUCT_LABELS[row.original.product] ?? row.original.product} · {row.original.tenureMonths}m
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
    accessorKey: "approvedAmount",
    header: "Approved amount",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="font-medium tabular text-ink-900">{formatINR(row.original.approvedAmount)}</p>
        <p className="mt-0.5 text-[10.5px] text-ink-400">
          {row.original.interestRate}% · {row.original.disbursementMode}
        </p>
      </div>
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
    accessorKey: "approverName",
    header: "Approver",
    cell: ({ row }) => (
      <span className="text-[12px] text-ink-600">{row.original.approverName ?? "Pending"}</span>
    ),
  },
  {
    id: "action",
    header: "",
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        href={`/sanctions/${row.original.id}`}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-brand-700 transition hover:bg-brand-50"
      >
        {row.original.status === "PENDING_ACCEPTANCE" || row.original.status === "PROCESSING" ? "Action" : "Open"}
        <ArrowRight className="h-3 w-3" />
      </Link>
    ),
  },
];

export function SanctionTable({ rows, tabLabel }: { rows: SanctionRow[]; tabLabel: string }) {
  return (
    <DataTable<SanctionRow>
      data={rows}
      columns={columns}
      initialPageSize={10}
      searchPlaceholder="Search ref, customer, approver…"
      getSearchText={(row) =>
        [row.ref, row.applicationRef, row.customerName, row.approverName, row.status, row.branchName, row.disbursementMode]
          .filter(Boolean)
          .join(" ")
      }
      emptyTitle={`No sanctions in "${tabLabel}"`}
      emptyDescription="Sanctions are raised from credit-approved applications. Adjust the filters or review the credit queue."
    />
  );
}
