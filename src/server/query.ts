import type { Page } from "@/lib/types";

export function paginate<T>(items: T[], page = 1, pageSize = 10): Page<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

export function matchesText(query: string | undefined, values: Array<string | number | null | undefined>) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
}

export function inDateRange(value: string | null | undefined, from?: string, to?: string) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (from && time < new Date(from).getTime()) return false;
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (time > end.getTime()) return false;
  }
  return true;
}

export function sortBy<T>(items: T[], getter: (item: T) => string | number, direction: "asc" | "desc" = "desc") {
  return [...items].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    if (av === bv) return 0;
    const result = av > bv ? 1 : -1;
    return direction === "asc" ? result : -result;
  });
}

export function monthBuckets(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleString("en-IN", { month: "short" }),
      start: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime(),
    };
  });
}

export function monthKey(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parsePage(value: string | undefined, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
