import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  href,
  accent = "brand",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  trend?: { value: string; direction: "up" | "down" | "flat"; positive?: boolean };
  href?: string;
  accent?: "brand" | "ink" | "amber" | "rose" | "sky";
  className?: string;
}) {
  const accentClasses = {
    brand: "bg-brand-50 text-brand-700",
    ink: "bg-ink-100 text-ink-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    sky: "bg-sky-50 text-sky-700",
  }[accent];

  const content = (
    <div
      className={cn(
        "surface group relative flex h-full flex-col justify-between gap-4 overflow-hidden rounded-2xl p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-pop",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium leading-tight text-ink-500">{label}</p>
        {icon ? (
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", accentClasses)}>
            {icon}
          </span>
        ) : null}
      </div>
      <div>
        <div className="text-[22px] font-semibold tracking-[-0.02em] text-ink-950 tabular">{value}</div>
        <div className="mt-1 flex items-center gap-2">
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                trend.direction === "flat"
                  ? "bg-ink-100 text-ink-600"
                  : (trend.positive ?? trend.direction === "up")
                    ? "bg-brand-50 text-brand-700"
                    : "bg-rose-50 text-rose-700",
              )}
            >
              {trend.direction === "up" ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : trend.direction === "down" ? (
                <ArrowDownRight className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {trend.value}
            </span>
          ) : null}
          {hint ? <span className="truncate text-[11px] text-ink-400">{hint}</span> : null}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full rounded-2xl focus-visible:outline-brand-500">
        {content}
      </Link>
    );
  }
  return content;
}
