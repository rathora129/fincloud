"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  FileText,
  Landmark,
  ListTodo,
  Loader2,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setSearchOpen } from "@/store";
import { getJson } from "@/lib/api";
import type { SearchGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

const groupIcons = {
  lead: UsersRound,
  application: FileText,
  customer: UsersRound,
  loan: Landmark,
  task: ListTodo,
};

const QUICK_LINKS = [
  { label: "New lead", href: "/leads/new" },
  { label: "Applications queue", href: "/applications" },
  { label: "Credit review", href: "/credit" },
  { label: "Collections", href: "/collections" },
  { label: "Reports & MIS", href: "/reports" },
];

export function GlobalSearch() {
  const open = useAppSelector((state) => state.ui.searchOpen);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const close = () => dispatch(setSearchOpen(false));
  const flat = groups.flatMap((group) => group.items);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setGroups([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await getJson<{ groups: SearchGroup[] }>(
          "/search",
          { q: query.trim() },
        );
        if (!controller.signal.aborted) {
          setGroups(data.groups);
          setActiveIndex(0);
        }
      } catch {
        if (!controller.signal.aborted) setGroups([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch(setSearchOpen(false));
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(flat.length - 1, index + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, index - 1));
      }
      if (event.key === "Enter" && flat.length > 0) {
        event.preventDefault();
        router.push(flat[activeIndex]?.href ?? flat[0].href);
        dispatch(setSearchOpen(false));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, activeIndex, dispatch, router]);

  let runningIndex = -1;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh] sm:pt-[14vh]">
          <motion.button
            type="button"
            aria-label="Close search"
            className="absolute inset-0 bg-ink-950/45 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search workspace"
            className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-pop"
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.995 }}
            transition={{ duration: 0.17 }}
          >
            <div className="flex items-center gap-3 border-b border-ink-100 px-4">
              <Search className="h-4 w-4 shrink-0 text-ink-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search leads, applications, customers, loans, tasks…"
                className="h-14 flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
              />
              {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-400" /> : null}
              <button
                type="button"
                onClick={close}
                aria-label="Close search"
                className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-2">
              {query.trim().length < 2 ? (
                <div className="p-3">
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
                    Jump to
                  </p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {QUICK_LINKS.map((link) => (
                      <button
                        key={link.href}
                        type="button"
                        onClick={() => {
                          router.push(link.href);
                          close();
                        }}
                        className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] text-ink-600 transition hover:bg-ink-100 hover:text-ink-900"
                      >
                        {link.label}
                        <ArrowRight className="h-3.5 w-3.5 text-ink-300" />
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-ink-100 px-1 pt-2.5 text-[10px] text-ink-400">
                    Results respect your role permissions and branch scope.
                  </p>
                </div>
              ) : flat.length === 0 && !loading ? (
                <p className="px-3 py-10 text-center text-xs text-ink-500">
                  No results for “{query}”. Try a reference number, customer name or phone.
                </p>
              ) : (
                groups.map((group) => {
                  const Icon = groupIcons[group.type];
                  return (
                    <div key={group.label} className="mb-1">
                      <p className="px-2.5 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                        {group.label}
                      </p>
                      {group.items.map((item) => {
                        runningIndex += 1;
                        const index = runningIndex;
                        return (
                          <button
                            key={`${group.type}-${item.id}`}
                            type="button"
                            onClick={() => {
                              router.push(item.href);
                              close();
                            }}
                            onMouseEnter={() => setActiveIndex(index)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition",
                              activeIndex === index ? "bg-brand-50" : "hover:bg-ink-50",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                                activeIndex === index ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500",
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-medium text-ink-800">{item.title}</span>
                              <span className="block truncate text-[10px] text-ink-400">{item.subtitle}</span>
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-ink-100 bg-ink-50/60 px-4 py-2 text-[9.5px] text-ink-400">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-ink-200 bg-white px-1">↑</kbd>
                <kbd className="rounded border border-ink-200 bg-white px-1">↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-ink-200 bg-white px-1">↵</kbd> open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-ink-200 bg-white px-1">esc</kbd> close
              </span>
              <span className="ml-auto">DEMO · synthetic data</span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
