"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Cloud, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setMobileNav, toggleSidebar } from "@/store";
import { NAV_SECTIONS } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/types";
import type { ShellCounts } from "@/lib/types";

export function Sidebar({ user, counts }: { user: SessionUser; counts: ShellCounts }) {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);
  const mobileOpen = useAppSelector((state) => state.ui.mobileNavOpen);

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => user.permissions.includes(item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => dispatch(setMobileNav(false))}
          className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-[1px] lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "brand-mesh fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col border-r border-white/[0.06] transition-[transform,width] duration-300 ease-out lg:translate-x-0",
          collapsed ? "lg:w-[78px]" : "lg:w-[268px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center gap-2 border-b border-white/[0.07] px-3.5",
            collapsed ? "lg:justify-center lg:px-2" : "",
          )}
        >
          <Link
            href="/dashboard"
            className={cn(
              "flex min-w-0 items-center rounded-xl bg-white px-2.5 py-1.5 shadow-sm transition hover:shadow-md",
              collapsed ? "lg:h-10 lg:w-12 lg:px-1" : "w-full",
            )}
            aria-label="FinCloud dashboard"
          >
            <Image
              src="/assets/brand/fincloud-logo.png"
              alt="FinCloud Technologies"
              width={1065}
              height={516}
              className={cn("w-auto", collapsed ? "lg:h-6" : "h-7")}
              priority
            />
          </Link>
          <button
            type="button"
            onClick={() => dispatch(toggleSidebar())}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/40 transition hover:bg-white/10 hover:text-white lg:flex"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </button>
          <button
            type="button"
            onClick={() => dispatch(setMobileNav(false))}
            aria-label="Close navigation"
            className="ml-auto rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-2.5 py-4" aria-label="Primary">
          {visibleSections.map((section) => (
            <div key={section.title}>
              <p
                className={cn(
                  "mb-1.5 px-2.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/30",
                  collapsed && "lg:hidden",
                )}
              >
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const badge = item.badgeKey ? counts[item.badgeKey] : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors",
                        active
                          ? "bg-white/[0.10] text-white"
                          : "text-white/55 hover:bg-white/[0.05] hover:text-white/90",
                        collapsed && "lg:justify-center lg:px-0",
                      )}
                    >
                      {active ? (
                        <span className="absolute inset-y-1.5 left-0 w-[2.5px] rounded-full bg-brand-300" />
                      ) : null}
                      <item.icon
                        className={cn(
                          "h-[17px] w-[17px] shrink-0",
                          active ? "text-brand-300" : "text-white/40 group-hover:text-white/70",
                        )}
                        strokeWidth={1.9}
                      />
                      <span className={cn("flex-1 truncate", collapsed && "lg:hidden")}>{item.label}</span>
                      {badge > 0 ? (
                        <span
                          className={cn(
                            "rounded-full bg-brand-400/20 px-1.5 py-0.5 text-[9.5px] font-semibold text-brand-200 tabular",
                            collapsed && "lg:absolute lg:right-1 lg:top-1 lg:h-1.5 lg:w-1.5 lg:p-0 lg:text-transparent",
                          )}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={cn("shrink-0 space-y-2 border-t border-white/[0.07] p-3", collapsed && "lg:px-2")}>
          <div className={cn("flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2", collapsed && "lg:hidden")}>
            <Cloud className="h-3.5 w-3.5 shrink-0 text-brand-300" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-white/70">DEMO environment</p>
              <p className="truncate text-[9px] text-white/35">Synthetic data · no real money movement</p>
            </div>
          </div>
          <p className={cn("px-1 text-[9px] text-white/25", collapsed && "lg:hidden")}>FinCloud LMS · v0.1</p>
        </div>
      </aside>
    </>
  );
}
