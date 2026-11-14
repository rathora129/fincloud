"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { markAllRead, markRead, setMobileNav, setSearchOpen, setUser, toggleSidebar } from "@/store";
import { ROUTE_TITLES, navItemForPath } from "@/lib/navigation";
import { ROLE_LABELS } from "@/lib/labels";
import { cn, formatRelative, initials } from "@/lib/utils";
import { api, patchJson } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Popover, MenuItem, MenuSeparator } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/badge";
import type { SessionUser } from "@/lib/types";

export function Header({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);
  const notifications = useAppSelector((state) => state.notifications.items);
  const unread = notifications.filter((n) => !n.read).length;

  const segments = pathname.split("/").filter(Boolean);
  const sectionTitle = ROUTE_TITLES[segments[0] ?? ""] ?? "Workspace";
  const nav = navItemForPath(pathname);
  const detailLabel =
    segments.length > 1
      ? `${nav?.label ?? sectionTitle} · ${segments[1] === "new" ? "New" : "Details"}`
      : nav?.label ?? sectionTitle;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dispatch(setSearchOpen(true));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await api.post("/auth/logout");
    } catch {
      // Session cookie is cleared server-side; proceed regardless.
    }
    dispatch(setUser(null));
    toast.info("Signed out", "Your demo session has ended.");
    router.replace("/login");
    router.refresh();
  };

  const openNotification = async (id: string, href: string | null) => {
    dispatch(markRead(id));
    try {
      await patchJson("/notifications", { id });
    } catch {
      // Non-critical for the demo.
    }
    if (href) router.push(href);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-ink-100 bg-white/90 px-3 backdrop-blur-md sm:px-5">
      <button
        type="button"
        onClick={() => dispatch(setMobileNav(true))}
        aria-label="Open navigation"
        className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-800 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => dispatch(toggleSidebar())}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-800 lg:block"
      >
        {collapsed ? <PanelLeftOpen className="h-4.5 w-4.5" /> : <PanelLeftClose className="h-4.5 w-4.5" />}
      </button>

      <div className="ml-0.5 flex min-w-0 items-center gap-2 text-[13px]">
        <Link href="/dashboard" className="hidden shrink-0 text-ink-400 transition hover:text-ink-700 sm:block lg:hidden xl:block">
          {sectionTitle}
        </Link>
        <span className="hidden text-ink-300 lg:hidden xl:block">/</span>
        <span className="truncate font-medium text-ink-800">{detailLabel}</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700 md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Demo
        </span>

        <button
          type="button"
          onClick={() => dispatch(setSearchOpen(true))}
          className="flex h-9 items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 text-[12px] text-ink-400 transition hover:border-ink-300 hover:text-ink-600 sm:w-52"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:block">Search workspace</span>
          <kbd className="ml-auto hidden rounded border border-ink-200 bg-ink-50 px-1 py-0.5 font-sans text-[9px] text-ink-400 sm:block">
            ⌘K
          </kbd>
        </button>

        <Popover
          panelClassName="w-[min(22rem,calc(100vw-1.5rem))] p-0"
          trigger={
            <button
              type="button"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
              className="relative rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-semibold text-white ring-2 ring-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </button>
          }
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-3.5 py-2.5">
            <p className="text-[12px] font-semibold text-ink-900">Notifications</p>
            <button
              type="button"
              onClick={async () => {
                dispatch(markAllRead());
                try {
                  await patchJson("/notifications");
                } catch {
                  // Non-critical.
                }
              }}
              className="inline-flex items-center gap-1 text-[10.5px] font-medium text-brand-700 hover:text-brand-800"
            >
              <CheckCheck className="h-3 w-3" /> Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-ink-400">No notifications for this role.</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification.id, notification.href)}
                  className={cn(
                    "flex w-full gap-2.5 border-b border-ink-100/70 px-3.5 py-3 text-left transition last:border-0 hover:bg-brand-50/40",
                    !notification.read && "bg-brand-50/20",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      notification.read
                        ? "bg-ink-200"
                        : notification.type === "CRITICAL"
                          ? "bg-rose-500"
                          : notification.type === "WARNING"
                            ? "bg-amber-500"
                            : "bg-brand-500",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-[11.5px] font-semibold leading-snug text-ink-800">{notification.title}</span>
                      <span className="shrink-0 text-[9.5px] text-ink-400">{formatRelative(notification.at)}</span>
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-500">{notification.body}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </Popover>

        <Popover
          panelClassName="w-64 p-0"
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition hover:bg-ink-100 sm:pr-2"
              aria-label="Open profile menu"
            >
              <Avatar name={user.name} color={user.avatarColor} size="sm" />
              <span className="hidden text-left leading-tight md:block">
                <span className="block max-w-[9rem] truncate text-[11.5px] font-semibold text-ink-800">{user.name}</span>
                <span className="block text-[9.5px] text-ink-400">{ROLE_LABELS[user.role] ?? user.role}</span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-ink-400 sm:block" />
            </button>
          }
        >
          <div className="border-b border-ink-100 px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: user.avatarColor }}
              >
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-ink-900">{user.name}</p>
                <p className="truncate text-[10px] text-ink-400">{user.email}</p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1">
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[9.5px] font-medium text-brand-700">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[9.5px] font-medium text-ink-600">
                {user.branchName}
              </span>
            </div>
          </div>
          <div className="p-1.5">
            <MenuItem href="/profile" icon={<UserRound className="h-3.5 w-3.5" />}>
              My profile
            </MenuItem>
            <MenuItem href="/profile#access" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
              Access & permissions
            </MenuItem>
            <MenuItem href="/profile#preferences" icon={<Settings2 className="h-3.5 w-3.5" />}>
              Workspace preferences
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={signOut} tone="danger" icon={<LogOut className="h-3.5 w-3.5" />}>
              {signingOut ? "Signing out…" : "Sign out"}
            </MenuItem>
          </div>
        </Popover>
      </div>
    </header>
  );
}

export function MobileBrand() {
  return (
    <div className="flex items-center gap-2 lg:hidden">
      <Image src="/assets/brand/fincloud-logo.png" alt="FinCloud" width={1065} height={516} className="h-6 w-auto" />
    </div>
  );
}
