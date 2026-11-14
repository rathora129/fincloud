"use client";

import type { ReactNode } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterBar({
  children,
  onReset,
  activeCount = 0,
  className,
}: {
  children: ReactNode;
  onReset?: () => void;
  activeCount?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface flex flex-col gap-3 rounded-2xl px-4 py-3 md:flex-row md:flex-wrap md:items-end",
        className,
      )}
    >
      <div className="flex items-center gap-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 md:pb-2.5">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
        {activeCount > 0 ? (
          <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] text-brand-700">{activeCount}</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-wrap items-end gap-2.5">{children}</div>
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      ) : null}
    </div>
  );
}

export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-[8.5rem] flex-col gap-1", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">{label}</span>
      {children}
    </label>
  );
}
