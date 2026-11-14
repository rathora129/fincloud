"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AuditFilters({
  actions,
  actors,
  values,
  activeCount,
}: {
  actions: string[];
  actors: { id: string; name: string }[];
  values: { q?: string; action?: string; actor?: string; from?: string; to?: string };
  activeCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(values.q ?? "");
  const [from, setFrom] = useState(values.from ?? "");
  const [to, setTo] = useState(values.to ?? "");

  const replace = (params: URLSearchParams) => {
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  const update = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    replace(params);
  };

  const applySearchAndDates = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (search.trim()) params.set("q", search.trim());
    else params.delete("q");
    if (from) params.set("from", from);
    else params.delete("from");
    if (to) params.set("to", to);
    else params.delete("to");
    replace(params);
  };

  const reset = () => {
    setSearch("");
    setFrom("");
    setTo("");
    router.replace(pathname, { scroll: false });
  };

  return (
    <FilterBar activeCount={activeCount} onReset={reset}>
      <FilterField label="Search">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            applySearchAndDates();
          }}
          className="relative"
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Action, summary or entity ref…"
            aria-label="Search audit records"
            className="h-9 w-full min-w-[12rem] pl-8 text-[11.5px]"
          />
        </form>
      </FilterField>

      <FilterField label="Action">
        <Select
          value={values.action ?? ""}
          onChange={(event) => update("action", event.target.value || undefined)}
          className="h-9 min-w-[10rem] text-[11.5px]"
        >
          <option value="">All actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Actor">
        <Select
          value={values.actor ?? ""}
          onChange={(event) => update("actor", event.target.value || undefined)}
          className="h-9 min-w-[10rem] text-[11.5px]"
        >
          <option value="">All actors</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="From">
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => setFrom(event.target.value)}
          aria-label="From date"
          className="h-9 w-[9rem] px-2 text-[11px]"
        />
      </FilterField>

      <FilterField label="To">
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => setTo(event.target.value)}
          aria-label="To date"
          className="h-9 w-[9rem] px-2 text-[11px]"
        />
      </FilterField>

      <Button size="sm" className="h-9" onClick={applySearchAndDates}>
        <Search className="h-3.5 w-3.5" /> Apply
      </Button>
    </FilterBar>
  );
}
