"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { CollectionFilterOptions } from "@/server/collections";

export function CollectionFilters({
  options,
  values,
  activeCount,
}: {
  options: CollectionFilterOptions;
  values: {
    bucket?: string;
    assignee?: string;
    branch?: string;
    dpdMin?: number;
    dpdMax?: number;
  };
  activeCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dpdMin, setDpdMin] = useState(values.dpdMin !== undefined ? String(values.dpdMin) : "");
  const [dpdMax, setDpdMax] = useState(values.dpdMax !== undefined ? String(values.dpdMax) : "");

  const replace = (params: URLSearchParams) => {
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  const update = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    replace(params);
  };

  const applyDpd = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (dpdMin) params.set("dpdMin", dpdMin);
    else params.delete("dpdMin");
    if (dpdMax) params.set("dpdMax", dpdMax);
    else params.delete("dpdMax");
    replace(params);
  };

  const reset = () => {
    setDpdMin("");
    setDpdMax("");
    router.replace(pathname, { scroll: false });
  };

  return (
    <FilterBar activeCount={activeCount} onReset={reset}>
      <FilterField label="Bucket">
        <Select
          value={values.bucket ?? ""}
          onChange={(event) => update("bucket", event.target.value || undefined)}
          className="h-9 min-w-[8.5rem] text-[11.5px]"
        >
          <option value="">All buckets</option>
          {options.buckets.map((bucket) => (
            <option key={bucket.key} value={bucket.key}>
              {bucket.label}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Assigned officer">
        <Select
          value={values.assignee ?? ""}
          onChange={(event) => update("assignee", event.target.value || undefined)}
          className="h-9 min-w-[9.5rem] text-[11.5px]"
        >
          <option value="">All officers</option>
          {options.assignees.map((assignee) => (
            <option key={assignee.id} value={assignee.id}>
              {assignee.name}
            </option>
          ))}
        </Select>
      </FilterField>

      {options.branches.length > 1 ? (
        <FilterField label="Branch">
          <Select
            value={values.branch ?? ""}
            onChange={(event) => update("branch", event.target.value || undefined)}
            className="h-9 min-w-[9.5rem] text-[11.5px]"
          >
            <option value="">All branches</option>
            {options.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </FilterField>
      ) : null}

      <FilterField label="DPD range">
        <div className="flex items-end gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Min"
            aria-label="Minimum DPD"
            value={dpdMin}
            onChange={(event) => setDpdMin(event.target.value)}
            className="h-9 w-[4.6rem] px-2 text-[11.5px]"
          />
          <span className="pb-2.5 text-[10px] text-ink-400">to</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Max"
            aria-label="Maximum DPD"
            value={dpdMax}
            onChange={(event) => setDpdMax(event.target.value)}
            className="h-9 w-[4.6rem] px-2 text-[11.5px]"
          />
          <Button size="sm" variant="outline" className="h-9 px-2" onClick={applyDpd} aria-label="Apply DPD range">
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      </FilterField>
    </FilterBar>
  );
}
