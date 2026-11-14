"use client";

import { useRef, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeStore, type AppStore } from "@/store";
import type { Notification, SessionUser } from "@/lib/types";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({
  user,
  notifications,
  children,
}: {
  user: SessionUser;
  notifications: Notification[];
  children: ReactNode;
}) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = makeStore({ user, notifications });
  }

  return (
    <Provider store={storeRef.current}>
      <ToastProvider>{children}</ToastProvider>
    </Provider>
  );
}
