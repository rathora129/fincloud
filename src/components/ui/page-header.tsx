import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-xs text-ink-500", className)}>
      <Link href="/dashboard" className="rounded p-0.5 transition hover:text-brand-700" aria-label="Dashboard">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-ink-300" />
          {item.href && index < items.length - 1 ? (
            <Link href={item.href} className="rounded transition hover:text-brand-700">
              {item.label}
            </Link>
          ) : (
            <span className={index === items.length - 1 ? "font-medium text-ink-700" : ""}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  breadcrumbs,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  breadcrumbs?: Crumb[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">{eyebrow}</p>
          ) : null}
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink-950 sm:text-2xl">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
