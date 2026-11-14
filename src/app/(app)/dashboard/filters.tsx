"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Check } from "lucide-react";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Select, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PRODUCT_LABELS, ROLE_LABELS, STATUS_META } from "@/lib/labels";
import type { RoleCode } from "@/lib/types";

const STATUS_OPTIONS = [
  "NEW",
  "IN_PROCESS",
  "RECOMMENDED",
  "SENT_BACK",
  "CREDIT_APPROVED",
  "CREDIT_REJECTED",
  "SANCTIONED",
  "DISBURSEMENT_PENDING",
  "DISBURSED",
  "CLOSED",
];

export function DashboardFilters({
  branches,
  employees,
  values,
  activeCount,
}: {
  branches: { id: string; name: string }[];
  employees: { id: string; name: string; role: RoleCode }[];
  values: {
    branch?: string;
    employee?: string;
    product?: string;
    status?: string;
    from?: string;
    to?: string;
  };
  activeCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(values.from ?? "");
  const [to, setTo] = useState(values.to ?? "");

  const update = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === "branch") params.delete("employee");
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  const reset = () => {
    setFrom("");
    setTo("");
    router.replace(pathname, { scroll: false });
  };

  return (
    <FilterBar activeCount={activeCount} onReset={reset}>
      <FilterField label="Date range">
        <div className="flex items-end gap-1.5">
          <div className="relative">
            <Input
              type="date"
              aria-label="From date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
              className="h-9 w-[8.9rem] px-2 text-[11px]"
            />
          </div>
          <span className="pb-2.5 text-[10px] text-ink-400">to</span>
          <Input
            type="date"
            aria-label="To date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 w-[8.9rem] px-2 text-[11px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-2"
            onClick={() => {
              update("from", from || undefined);
              const params = new URLSearchParams(searchParams.toString());
              if (to) params.set("to", to);
              else params.delete("to");
              router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
            }}
            aria-label="Apply date range"
          >
            {from || to ? <Check className="h-3.5 w-3.5" /> : <CalendarRange className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </FilterField>

      {branches.length > 1 ? (
        <FilterField label="Branch">
          <Select
            value={values.branch ?? ""}
            onChange={(event) => update("branch", event.target.value || undefined)}
            className="h-9 min-w-[9.5rem] text-[11.5px]"
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

      <FilterField label="Employee">
        <Select
          value={values.employee ?? ""}
          onChange={(event) => update("employee", event.target.value || undefined)}
          className="h-9 min-w-[9.5rem] text-[11.5px]"
        >
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name} · {ROLE_LABELS[employee.role]?.split(" ")[0]}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Loan type">
        <Select
          value={values.product ?? ""}
          onChange={(event) => update("product", event.target.value || undefined)}
          className="h-9 min-w-[8.5rem] text-[11.5px]"
        >
          <option value="">All products</option>
          {Object.entries(PRODUCT_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Application status">
        <Select
          value={values.status ?? ""}
          onChange={(event) => update("status", event.target.value || undefined)}
          className="h-9 min-w-[9.5rem] text-[11.5px]"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status]?.label ?? status}
            </option>
          ))}
        </Select>
      </FilterField>
    </FilterBar>
  );
}
