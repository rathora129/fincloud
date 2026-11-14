export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrCompact = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatINR(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return inr.format(value);
}

export function formatINRCompact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `₹${inrCompact.format(value)}`;
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateShort(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatRelative(value: string | null | undefined) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const future = diff < 0;
  const minutes = Math.round(Math.abs(diff) / 60000);
  const wrap = (text: string) => (future ? `in ${text}` : `${text} ago`);
  if (minutes < 60) {
    if (minutes === 0) return future ? "in a moment" : "just now";
    return wrap(`${minutes}m`);
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) return wrap(`${hours}h`);
  const days = Math.round(hours / 24);
  if (days < 30) return wrap(`${days}d`);
  return formatDate(value);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `••••••${digits.slice(-4)}`;
}

export function todayISO() {
  return new Date().toISOString();
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

export function classNamesForAmount(value: number) {
  return value < 0 ? "text-rose-600" : "text-slate-900";
}
