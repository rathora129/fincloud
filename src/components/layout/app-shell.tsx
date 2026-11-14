"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setMobileNav } from "@/store";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { GlobalSearch } from "./global-search";
import type { SessionUser } from "@/lib/types";
import type { ShellCounts } from "@/lib/types";

export function AppShell({
  user,
  counts,
  children,
}: {
  user: SessionUser;
  counts: ShellCounts;
  children: ReactNode;
}) {
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);
  const pathname = usePathname();

  useEffect(() => {
    dispatch(setMobileNav(false));
  }, [pathname, dispatch]);

  return (
    <div className="min-h-screen">
      <Sidebar user={user} counts={counts} />
      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-300", collapsed ? "lg:pl-[78px]" : "lg:pl-[268px]")}>
        <Header user={user} />
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
          <div className="mx-auto w-full max-w-[1560px]">{children}</div>
        </main>
        <footer className="no-print mx-auto w-full max-w-[1560px] px-4 pb-5 text-[10px] text-ink-400 sm:px-6 lg:px-7">
          FinCloud LMS · DEMO environment · Synthetic records only · No real customer data, bureau pulls or money
          movement.
        </footer>
      </div>
      <GlobalSearch />
    </div>
  );
}
