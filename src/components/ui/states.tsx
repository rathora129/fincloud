import type { ReactNode } from "react";
import { AlertTriangle, Lock, SearchX, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title = "Nothing here yet",
  description,
  icon,
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        {icon ?? <SearchX className="h-5 w-5" />}
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Unable to load this view",
  description = "The data could not be retrieved. Please refresh or try again shortly.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PermissionDenied({ className }: { className?: string }) {
  return (
    <div className={cn("surface flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-500">
        <Lock className="h-5 w-5" />
      </div>
      <p className="text-base font-semibold text-ink-900">You don’t have access to this area</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-500">
        Your role does not include permission for this module. If you believe this is incorrect, contact your branch
        administrator. Server-side authorization remains enforced.
      </p>
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1 text-[11px] text-ink-500 ring-1 ring-ink-100">
        <ShieldX className="h-3.5 w-3.5" /> Permission denied · 403
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg", className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-7" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function InlineNote({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
        tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-sky-200 bg-sky-50 text-sky-800",
      )}
    >
      {children}
    </p>
  );
}
