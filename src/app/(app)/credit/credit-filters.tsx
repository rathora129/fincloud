"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Check } from "lucide-react";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PRODUCT_LABELS, ROLE_LABELS } from "@/lib/labels";
import type { RoleCode } from "@/lib/types";

export type FilterValues = {
  branch?: string;
  owner?: string;
  product?: string;
  from?: string;
  to?: string;
};

export function CreditFilters({
  branches,
  employees,
  values,
  activeCount,
}: {
  branches: { id: string; name: string }[];
  employees: { id: string; name: string; role: RoleCode }[];
  values: FilterValues;
  activeCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(values.from ?? "");
  const [to, setTo] = useState(values.to ?? "");

  const replace = (params: URLSearchParams) => {
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  const update = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === "branch") params.delete("owner");
    params.delete("page");
    replace(params);
  };

  const applyDates = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("from", from);
    else params.delete("from");
    if (to) params.set("to", to);
    else params.delete("to");
    params.delete("page");
    replace(params);
  };

  const reset = () => {
    setFrom("");
    setTo("");
    const params = new URLSearchParams();
    const tab = searchParams.get("tab");
    if (tab) params.set("tab", tab);
    replace(params);
  };

  return (
    <FilterBar activeCount={activeCount} onReset={reset}>
      <FilterField label="Submitted">
        <div className="flex items-end gap-1.5">
          <Input
            type="date"
            aria-label="Submitted from"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 w-[8.4rem] px-2 text-[11px]"
          />
          <span className="pb-2.5 text-[10px] text-ink-400">to</span>
          <Input
            type="date"
            aria-label="Submitted to"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 w-[8.4rem] px-2 text-[11px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-2"
            onClick={applyDates}
            aria-label="Apply submitted date range"
          >
            {values.from || values.to ? <Check className="h-3.5 w-3.5" /> : <CalendarRange className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </FilterField>

      {branches.length > 1 ? (
        <FilterField label="Branch">
          <Select
            value={values.branch ?? ""}
            onChange={(event) => update("branch", event.target.value || undefined)}
            className="h-9 min-w-[9rem] text-[11.5px]"
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

      <FilterField label="Owner">
        <Select
          value={values.owner ?? ""}
          onChange={(event) => update("owner", event.target.value || undefined)}
          className="h-9 min-w-[9.5rem] text-[11.5px]"
        >
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name} · {ROLE_LABELS[employee.role] ?? employee.role}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Product">
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
    </FilterBar>
  );
}
