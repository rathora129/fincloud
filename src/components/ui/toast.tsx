"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info" | "warning";
type Toast = { id: number; title: string; description?: string; tone: ToastTone };

const ToastContext = createContext<{
  push: (toast: Omit<Toast, "id">) => void;
} | null>(null);

const icons: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-brand-600" />,
  error: <XCircle className="h-5 w-5 text-rose-600" />,
  info: <Info className="h-5 w-5 text-sky-600" />,
  warning: <TriangleAlert className="h-5 w-5 text-amber-600" />,
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = ++counter;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20 }}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3.5 shadow-pop",
                toast.tone === "error" ? "border-rose-200" : "border-ink-100",
              )}
              role="status"
            >
              <div className="mt-0.5 shrink-0">{icons[toast.tone]}</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{toast.description}</p>
                ) : null}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return {
    success: (title: string, description?: string) => context.push({ title, description, tone: "success" }),
    error: (title: string, description?: string) => context.push({ title, description, tone: "error" }),
    info: (title: string, description?: string) => context.push({ title, description, tone: "info" }),
    warning: (title: string, description?: string) => context.push({ title, description, tone: "warning" }),
  };
}
