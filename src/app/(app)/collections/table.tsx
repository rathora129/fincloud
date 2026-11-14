"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, ChevronRight } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { BUCKET_LABELS } from "@/lib/labels";
import { formatDate, formatINR, maskPhone } from "@/lib/utils";
import type { CollectionBucket } from "@/lib/types";
import type { CollectionRow } from "@/server/collections";

const BUCKET_TONE: Record<CollectionBucket, string> = {
  PRE_DUE: "bg-sky-50 text-sky-700 ring-sky-200",
  BUCKET_1: "bg-amber-50 text-amber-700 ring-amber-200",
  BUCKET_2: "bg-orange-50 text-orange-700 ring-orange-200",
  BUCKET_3: "bg-rose-50 text-rose-700 ring-rose-200",
  NPA: "bg-violet-50 text-violet-700 ring-violet-200",
};

function isPast(value: string | null) {
  return Boolean(value && new Date(value).getTime() < Date.now());
}

const columns: ColumnDef<CollectionRow, unknown>[] = [
  {
    accessorKey: "ref",
    header: "Case",
    cell: ({ row }) => (
      <Link
        href={`/collections/${row.original.id}`}
        className="font-mono text-[11.5px] font-semibold text-brand-700 hover:text-brand-800 hover:underline"
      >
        {row.original.ref}
      </Link>
    ),
  },
  {
    id: "customer",
    accessorFn: (row) => row.customerName,
    header: "Customer",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-ink-900">{row.original.customerName}</p>
        <p className="mt-0.5 text-[10.5px] text-ink-400">{maskPhone(row.original.customerPhone)}</p>
      </div>
    ),
  },
  {
    accessorKey: "loanRef",
    header: "Loan",
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-ink-500">{row.original.loanRef}</span>
    ),
  },
  {
    accessorKey: "bucket",
    header: "Bucket",
    cell: ({ row }) => (
      <span
        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${BUCKET_TONE[row.original.bucket]}`}
      >
        {BUCKET_LABELS[row.original.bucket]}
      </span>
    ),
  },
  {
    accessorKey: "overdueAmount",
    header: "Overdue",
    cell: ({ row }) =>
      row.original.overdueAmount > 0 ? (
        <span className="tabular text-[12.5px] font-semibold text-ink-900">
          {formatINR(row.original.overdueAmount)}
        </span>
      ) : (
        <span className="tabular text-[11px] text-ink-400">
          Upcoming · {formatINR(row.original.emiAmount)}
        </span>
      ),
  },
  {
    accessorKey: "daysPastDue",
    header: "DPD",
    cell: ({ row }) =>
      row.original.daysPastDue > 0 ? (
        <span
          className={`tabular text-[12px] font-medium ${
            row.original.daysPastDue >= 60 ? "text-rose-600" : "text-ink-700"
          }`}
        >
          {row.original.daysPastDue}d
        </span>
      ) : (
        <span className="text-[11px] text-ink-400">—</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: "assignee",
    accessorFn: (row) => row.assignedToName,
    header: "Officer",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Avatar name={row.original.assignedToName} color={row.original.assignedToColor} size="xs" />
        <span className="text-[11.5px] text-ink-700">{row.original.assignedToName}</span>
      </div>
    ),
  },
  {
    id: "nextAction",
    accessorFn: (row) => row.nextActionAt ?? "",
    header: "Next action",
    cell: ({ row }) => {
      const overdue = row.original.status !== "RESOLVED" && isPast(row.original.nextActionAt);
      return row.original.nextActionAt ? (
        <span
          className={`inline-flex items-center gap-1 text-[11px] ${
            overdue ? "font-medium text-rose-600" : "text-ink-600"
          }`}
        >
          <CalendarClock className="h-3 w-3" />
          {formatDate(row.original.nextActionAt)}
        </span>
      ) : (
        <span className="text-[11px] text-ink-400">Not set</span>
      );
    },
  },
  {
    id: "ptp",
    accessorFn: (row) => row.ptpAmount ?? 0,
    header: "PTP",
    cell: ({ row }) =>
      row.original.ptpAmount !== null && row.original.ptpDate ? (
        <div>
          <p className="tabular text-[11.5px] font-medium text-ink-800">{formatINR(row.original.ptpAmount)}</p>
          <p
            className={`mt-0.5 text-[10px] ${
              isPast(row.original.ptpDate) ? "font-medium text-rose-600" : "text-ink-400"
            }`}
          >
            {formatDate(row.original.ptpDate)}
          </p>
        </div>
      ) : (
        <span className="text-[11px] text-ink-400">—</span>
      ),
  },
  {
    id: "open",
    header: "",
    cell: ({ row }) => (
      <Link
        href={`/collections/${row.original.id}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-300 transition hover:bg-ink-100 hover:text-ink-700"
        aria-label={`Open ${row.original.ref}`}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    ),
    enableSorting: false,
  },
];

export function CollectionsTable({ rows }: { rows: CollectionRow[] }) {
  const router = useRouter();

  return (
    <DataTable
      data={rows}
      columns={columns}
      searchPlaceholder="Search case, customer, loan or officer…"
      getSearchText={(row) =>
        [
          row.ref,
          row.customerName,
          row.customerPhone,
          row.loanRef,
          BUCKET_LABELS[row.bucket],
          row.status,
          row.assignedToName,
          row.recoveryStage,
        ].join(" ")
      }
      onRowClick={(row) => router.push(`/collections/${row.id}`)}
      initialPageSize={10}
      emptyTitle="No collection cases in this view"
      emptyDescription="Adjust the bucket, officer or DPD filters, or select another workflow tab."
      footer={<span>DEMO data · dates in IST</span>}
    />
  );
}
