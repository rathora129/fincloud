"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, FileSearch } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { PRODUCT_LABELS } from "@/lib/labels";
import { formatDateShort, formatINR, formatINRCompact } from "@/lib/utils";
import type { CreditRow } from "@/server/credit";

const columns: ColumnDef<CreditRow, any>[] = [
  {
    accessorKey: "ref",
    header: "Application",
    cell: ({ row }) => (
      <div className="min-w-0">
        <Link
          href={`/credit/${row.original.id}`}
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
    cell: ({ row }) => <p className="font-medium text-ink-900">{row.original.customerName}</p>,
  },
  {
    accessorKey: "product",
    header: "Product",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-ink-800">
          {PRODUCT_LABELS[row.original.product] ?? row.original.product}
        </p>
        <p className="mt-0.5 text-[10.5px] text-ink-400">
          {row.original.tenureMonths}m · {row.original.interestRate}%
        </p>
      </div>
    ),
  },
  {
    accessorKey: "requestedAmount",
    header: "Requested",
    cell: ({ row }) => (
      <div className="text-right">
        <p className="font-medium tabular text-ink-900">{formatINR(row.original.requestedAmount)}</p>
        {row.original.approvedAmount !== null ? (
          <p className="mt-0.5 text-[10.5px] text-brand-700">Approved {formatINRCompact(row.original.approvedAmount)}</p>
        ) : (
          <p className="mt-0.5 text-[10.5px] text-ink-400">No approval yet</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "verificationLabel",
    header: "Risk / verification",
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        <StatusBadge status={row.original.riskBand ?? "PENDING"} label={row.original.riskBand ? `${row.original.riskBand} risk` : "Risk not set"} dot={false} />
        <span className="text-[10.5px] text-ink-500">{row.original.verificationLabel}</span>
      </div>
    ),
  },
  {
    accessorKey: "ownerName",
    header: "Owner",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="text-ink-800">{row.original.ownerName}</p>
        <p className="mt-0.5 text-[10.5px] text-ink-400">
          {row.original.creditOfficerName ? `Credit: ${row.original.creditOfficerName}` : "Credit not assigned"}
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
    accessorKey: "submittedAt",
    header: "Submitted",
    cell: ({ row }) => <span className="text-[12px] text-ink-600">{formatDateShort(row.original.submittedAt)}</span>,
  },
  {
    id: "action",
    header: "",
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        href={`/credit/${row.original.id}`}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-brand-700 transition hover:bg-brand-50"
      >
        {row.original.status === "RECOMMENDED" ? "Review" : "Open"}
        <ArrowRight className="h-3 w-3" />
      </Link>
    ),
  },
];

export function CreditTable({ rows, tabLabel }: { rows: CreditRow[]; tabLabel: string }) {
  return (
    <DataTable<CreditRow>
      data={rows}
      columns={columns}
      initialPageSize={10}
      searchPlaceholder="Search ref, customer, owner…"
      getSearchText={(row) =>
        [
          row.ref,
          row.customerName,
          row.ownerName,
          row.creditOfficerName,
          PRODUCT_LABELS[row.product],
          row.status,
          row.branchName,
          row.verificationLabel,
        ]
          .filter(Boolean)
          .join(" ")
      }
      emptyTitle={`No applications in "${tabLabel}"`}
      emptyDescription="Adjust the date, branch or product filters, or clear the search text."
      emptyAction={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1 text-[11px] text-ink-500 ring-1 ring-ink-100">
          <FileSearch className="h-3.5 w-3.5" /> Server-side scope applied
        </span>
      }
    />
  );
}
