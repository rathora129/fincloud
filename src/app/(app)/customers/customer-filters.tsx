"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Input, Select } from "@/components/ui/input";
import { EMPLOYMENT_LABELS, STATUS_META } from "@/lib/labels";

const KYC_STATES = ["VERIFIED", "PENDING", "REJECTED"] as const;
const EMPLOYMENT_TYPES = ["SALARIED", "SELF_EMPLOYED", "BUSINESS_OWNER"] as const;

export function CustomerFilters({
  values,
  branches,
  activeCount,
}: {
  values: { q?: string; kyc?: string; branch?: string; employment?: string };
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
            placeholder="Name, customer ref, phone, city or PAN"
            className="pl-9"
            aria-label="Search customers"
          />
        </span>
      </label>

      <FilterField label="KYC state">
        <Select value={values.kyc ?? ""} onChange={(event) => setParam("kyc", event.target.value || undefined)}>
          <option value="">All KYC states</option>
          {KYC_STATES.map((state) => (
            <option key={state} value={state}>
              {STATUS_META[state]?.label ?? state}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Employment">
        <Select
          value={values.employment ?? ""}
          onChange={(event) => setParam("employment", event.target.value || undefined)}
        >
          <option value="">All employment types</option>
          {EMPLOYMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {EMPLOYMENT_LABELS[type]}
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
    </FilterBar>
  );
}
