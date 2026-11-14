"use client";

import { useState, type ReactNode } from "react";
import { Bell, LayoutPanelTop, MonitorCog, Moon, RotateCcw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineNote } from "@/components/ui/states";
import { cn } from "@/lib/utils";

type Theme = "system" | "light" | "dark";
type Density = "comfortable" | "compact";

function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50/60 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed",
            value === option.value
              ? "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200"
              : "text-ink-500 hover:text-ink-800",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-ink-100 bg-white px-3.5 py-3">
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-ink-800">{label}</span>
        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-500">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition",
          checked ? "bg-brand-600" : "bg-ink-200",
          disabled && "opacity-50",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition",
            checked ? "left-4.5" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

export function PreferencesDemo() {
  const [theme, setTheme] = useState<Theme>("system");
  const [density, setDensity] = useState<Density>("comfortable");
  const [emailDigest, setEmailDigest] = useState(false);
  const [inAppAlerts, setInAppAlerts] = useState(true);
  const [weeklyMis, setWeeklyMis] = useState(true);

  const reset = () => {
    setTheme("system");
    setDensity("comfortable");
    setEmailDigest(false);
    setInAppAlerts(true);
    setWeeklyMis(true);
  };

  return (
    <div className="space-y-4 p-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ink-100 bg-white px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-800">
            <MonitorCog className="h-3.5 w-3.5 text-brand-700" /> Appearance
          </p>
          <p className="mt-0.5 text-[10.5px] text-ink-500">Theme preview and workspace density.</p>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-ink-600">Theme</span>
              <Segmented<Theme>
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "system", label: "System", icon: <MonitorCog className="h-3 w-3" /> },
                  { value: "light", label: "Light", icon: <Sun className="h-3 w-3" /> },
                  { value: "dark", label: "Dark", icon: <Moon className="h-3 w-3" /> },
                ]}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-ink-600">Density</span>
              <Segmented<Density>
                value={density}
                onChange={setDensity}
                options={[
                  { value: "comfortable", label: "Comfortable", icon: <LayoutPanelTop className="h-3 w-3" /> },
                  { value: "compact", label: "Compact" },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Toggle
            label="In-app alerts"
            description="Credit queue, PTP reminders and sanction notifications."
            checked={inAppAlerts}
            onChange={setInAppAlerts}
          />
          <Toggle
            label="Email digest (DEMO)"
            description="Daily summary email — no email provider is connected."
            checked={emailDigest}
            onChange={setEmailDigest}
          />
          <Toggle
            label="Weekly MIS"
            description="Notify me when the weekly MIS export is available."
            checked={weeklyMis}
            onChange={setWeeklyMis}
          />
        </div>
      </div>

      <InlineNote tone="warning">
        Demo only: these preferences are intentionally not persisted and no backend write occurs. Reloading this page
        resets every control. No notification, email or theme service is connected in this demo.
      </InlineNote>

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10.5px] text-ink-400">
          <Bell className="h-3 w-3" /> Current: {theme} theme · {density} density ·{" "}
          {inAppAlerts ? "alerts on" : "alerts off"}
        </span>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
      </div>
    </div>
  );
}
