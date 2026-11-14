import { cn, initials } from "@/lib/utils";
import { statusMeta, type Tone } from "@/lib/labels";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-600 ring-ink-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  success: "bg-brand-50 text-brand-700 ring-brand-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function StatusBadge({
  status,
  label,
  tone,
  dot = true,
  className,
}: {
  status?: string;
  label?: string;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  const meta = statusMeta(status);
  const resolvedTone = tone ?? meta.tone;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        toneClasses[resolvedTone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {label ?? meta.label}
    </span>
  );
}

export function Avatar({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
  }[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white",
        sizeClass,
        className,
      )}
      style={{ backgroundColor: color ?? "#117a60" }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
