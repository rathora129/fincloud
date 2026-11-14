"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { EMPLOYMENT_LABELS } from "@/lib/labels";
import { formatINR, formatRelative, maskPhone } from "@/lib/utils";
import type { CustomerListItem } from "@/server/customers";

export function CustomerTable({ items }: { items: CustomerListItem[] }) {
  const router = useRouter();

  const columns: ColumnDef<CustomerListItem, any>[] = [
    {
      id: "customer",
      header: "Customer",
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <div className="flex min-w-[13rem] items-center gap-2.5">
          <Avatar name={row.original.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{row.original.name}</p>
            <p className="mt-0.5 text-[11px] text-ink-400 tabular">
              {row.original.ref} · {row.original.kycStatus === "VERIFIED" ? "KYC verified" : `KYC ${row.original.kycStatus.toLowerCase()}`}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-[11rem]">
          <p className="tabular text-ink-700">{maskPhone(row.original.phone)}</p>
          <p className="mt-0.5 truncate text-[11px] text-ink-400">{row.original.email}</p>
        </div>
      ),
    },
    {
      id: "location",
      header: "Location",
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="text-ink-700">{row.original.city}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {row.original.state} · {row.original.branchName}
          </p>
        </div>
      ),
    },
    {
      id: "profile",
      header: "Profile",
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="text-ink-700">{EMPLOYMENT_LABELS[row.original.employmentType] ?? row.original.employmentType}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {formatINR(row.original.monthlyIncome)}/mo · {row.original.employer}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "kycStatus",
      header: "KYC",
      cell: ({ row }) => <StatusBadge status={row.original.kycStatus} />,
    },
    {
      id: "portfolio",
      header: "Portfolio",
      accessorFn: (row) => row.outstanding,
      cell: ({ row }) => (
        <div>
          <p className="tabular font-medium text-ink-800">{formatINR(row.original.outstanding)}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {row.original.applications} application{row.original.applications === 1 ? "" : "s"} ·{" "}
            {row.original.activeLoans} active loan{row.original.activeLoans === 1 ? "" : "s"}
          </p>
        </div>
      ),
    },
    {
      id: "lastActivity",
      header: "Last activity",
      accessorFn: (row) => row.lastActivityAt ?? "",
      cell: ({ row }) => (
        <div>
          <p className="tabular text-ink-700">{formatRelative(row.original.lastActivityAt)}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">Since {formatRelative(row.original.relationshipSince)}</p>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={items}
      columns={columns}
      getSearchText={(item) =>
        `${item.ref} ${item.name} ${item.phone} ${item.email} ${item.city} ${item.state} ${item.employer} ${item.branchName}`
      }
      searchPlaceholder="Filter this list…"
      onRowClick={(item) => router.push(`/customers/${item.id}`)}
      emptyTitle="No customers match these filters"
      emptyDescription="Adjust the search, KYC state, employment type or branch to widen the result set."
      footer={<span>Click a row to open Customer 360</span>}
    />
  );
}
