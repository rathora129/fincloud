"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { PRODUCT_LABELS } from "@/lib/labels";
import { formatDate, formatINR } from "@/lib/utils";
import type { ApplicationListItem } from "@/server/applications";

export function ApplicationTable({ items }: { items: ApplicationListItem[] }) {
  const router = useRouter();

  const columns: ColumnDef<ApplicationListItem, any>[] = [
    {
      id: "application",
      header: "Application",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-[12rem]">
          <p className="font-medium text-ink-900">{row.original.customerName}</p>
          <p className="mt-0.5 text-[11px] text-ink-400 tabular">
            {row.original.ref} · {row.original.customerRef}
          </p>
        </div>
      ),
    },
    {
      id: "product",
      header: "Product",
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="text-ink-700">{PRODUCT_LABELS[row.original.product] ?? row.original.product}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {row.original.tenureMonths} months · {row.original.interestRate}%
          </p>
        </div>
      ),
    },
    {
      accessorKey: "requestedAmount",
      header: "Requested",
      cell: ({ row }) => (
        <div>
          <p className="tabular font-medium text-ink-800">{formatINR(row.original.requestedAmount)}</p>
          {row.original.isAuto ? (
            <span className="mt-0.5 inline-flex rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
              Auto
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.original.status} />
          {row.original.riskBand ? (
            <span className="text-[10px] uppercase tracking-[0.06em] text-ink-400">Risk {row.original.riskBand}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "docs",
      header: "Documents",
      accessorFn: (row) => (row.requiredDocs ? row.verifiedDocs / row.requiredDocs : 0),
      cell: ({ row }) => {
        const { verifiedDocs, requiredDocs, verificationReady } = row.original;
        const complete = requiredDocs > 0 && verifiedDocs === requiredDocs;
        return (
          <div>
            <p className={`tabular text-sm ${complete ? "text-brand-700" : "text-ink-600"}`}>
              {verifiedDocs}/{requiredDocs} verified
            </p>
            <p className="mt-0.5 text-[11px] text-ink-400">{verificationReady ? "Verification complete" : "Verification pending"}</p>
          </div>
        );
      },
    },
    {
      id: "owner",
      header: "Owner",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.original.ownerName} color={row.original.ownerColor} size="xs" />
          <div>
            <p className="text-ink-700">{row.original.ownerName}</p>
            <p className="text-[11px] text-ink-400">{row.original.branchName}</p>
          </div>
        </div>
      ),
    },
    {
      id: "credit",
      header: "Credit officer",
      enableSorting: false,
      cell: ({ row }) => row.original.creditOfficerName ?? <span className="text-ink-400">Not assigned</span>,
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => <span className="tabular">{formatDate(row.original.createdAt)}</span>,
    },
  ];

  return (
    <DataTable
      data={items}
      columns={columns}
      getSearchText={(item) => `${item.ref} ${item.customerName} ${item.customerRef} ${item.ownerName} ${item.branchName}`}
      searchPlaceholder="Filter this list…"
      onRowClick={(item) => router.push(`/applications/${item.id}`)}
      emptyTitle="No applications match these filters"
      emptyDescription="Adjust the search, status, product, owner or date range to widen the result set."
      footer={<span>Click a row to open the loan file</span>}
    />
  );
}
