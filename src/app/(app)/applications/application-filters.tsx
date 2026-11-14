"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Input, Select } from "@/components/ui/input";
import { PRODUCT_LABELS, STATUS_META } from "@/lib/labels";

const STATUSES = [
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
] as const;
const PRODUCTS = ["PERSONAL", "BUSINESS", "HOME", "VEHICLE", "GOLD"] as const;

export function ApplicationFilters({
  values,
  owners,
  branches,
  activeCount,
}: {
  values: { q?: string; status?: string; product?: string; owner?: string; branch?: string; from?: string; to?: string };
  owners: { id: string; name: string; branchId: string }[];
  branches: { id: string; name: string }[];
  activeCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(values.q ?? "");
  const initial = useRef(true);

  const setParam = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === "branch") params.delete("owner");
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    const timer = window.setTimeout(() => setParam("q", q.trim() || undefined), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const visibleOwners = values.branch ? owners.filter((owner) => owner.branchId === values.branch) : owners;

  return (
    <FilterBar
      activeCount={activeCount}
      onReset={() => {
        setQ("");
        router.replace(pathname, { scroll: false });
      }}
    >
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Search</span>
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Application, customer or purpose"
            className="pl-9"
            aria-label="Search applications"
          />
        </span>
      </label>

      <FilterField label="Status">
        <Select value={values.status ?? ""} onChange={(event) => setParam("status", event.target.value || undefined)}>
          <option value="">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status]?.label ?? status}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Product">
        <Select value={values.product ?? ""} onChange={(event) => setParam("product", event.target.value || undefined)}>
          <option value="">All products</option>
          {PRODUCTS.map((product) => (
            <option key={product} value={product}>
              {PRODUCT_LABELS[product]}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Owner">
        <Select value={values.owner ?? ""} onChange={(event) => setParam("owner", event.target.value || undefined)}>
          <option value="">All owners</option>
          {visibleOwners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </Select>
      </FilterField>

      {branches.length > 1 ? (
        <FilterField label="Branch">
          <Select value={values.branch ?? ""} onChange={(event) => setParam("branch", event.target.value || undefined)}>
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </FilterField>
      ) : null}

      <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
        <FilterField label="Created from" className="min-w-0">
          <Input
            type="date"
            value={values.from ?? ""}
            onChange={(event) => setParam("from", event.target.value || undefined)}
            className="w-full"
            aria-label="Created from"
          />
        </FilterField>
        <FilterField label="To" className="min-w-0">
          <Input
            type="date"
            value={values.to ?? ""}
            onChange={(event) => setParam("to", event.target.value || undefined)}
            className="w-full"
            aria-label="Created to"
          />
        </FilterField>
      </div>
    </FilterBar>
  );
}
