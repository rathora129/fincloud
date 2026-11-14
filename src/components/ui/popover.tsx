"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type TriggerProps = {
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: string;
};

export function Popover({
  trigger,
  children,
  align = "end",
  panelClassName,
}: {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<TriggerProps>, {
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          (trigger as ReactElement<TriggerProps>).props.onClick?.(event);
          setOpen((value) => !value);
        },
        "aria-expanded": open,
        "aria-haspopup": "menu",
      })
    : trigger;

  return (
    <div ref={ref} className="relative">
      {triggerNode}
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ duration: 0.14 }}
            className={cn(
              "absolute z-40 mt-2 min-w-56 overflow-hidden rounded-xl border border-ink-100 bg-white p-1.5 shadow-pop",
              align === "end" ? "right-0" : "left-0",
              panelClassName,
            )}
          >
            {typeof children === "function" ? children(() => setOpen(false)) : children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  icon,
  tone = "default",
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  tone?: "default" | "danger";
  href?: string;
}) {
  const className = cn(
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
    tone === "danger" ? "text-rose-600 hover:bg-rose-50" : "text-ink-700 hover:bg-ink-100 hover:text-ink-950",
  );
  if (href) {
    return (
      <a href={href} role="menuitem" className={className}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button type="button" role="menuitem" onClick={onClick} className={className}>
      {icon}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-ink-100" />;
}
