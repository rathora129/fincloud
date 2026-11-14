"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = {
  key: string;
  label: string;
  count?: number;
  href?: string;
};

export function LinkTabs({ items, className }: { items: TabItem[]; className?: string }) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-ink-100", className)}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href ?? "#"}
          className={cn(
            "relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
            item.count === -1
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800",
          )}
          aria-current={item.count === -1 ? "page" : undefined}
        >
          {item.label}
          {typeof item.count === "number" && item.count >= 0 ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular",
                item.count === -1 ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500",
              )}
            >
              {item.count}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

export function Tabs({
  tabs,
  defaultTab,
  className,
  panelClassName,
}: {
  tabs: { key: string; label: string; count?: number; content: ReactNode }[];
  defaultTab?: string;
  className?: string;
  panelClassName?: string;
}) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key);
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];
  return (
    <div className={className}>
      <div className="flex gap-1 overflow-x-auto border-b border-ink-100" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              "relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
              active === tab.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular",
                  active === tab.key ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" className={cn("pt-4", panelClassName)}>
        {current?.content}
      </div>
    </div>
  );
}
