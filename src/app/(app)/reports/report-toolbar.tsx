"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportToolbar({ csvHref, xlsHref }: { csvHref: string | null; xlsHref: string | null }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {csvHref ? (
        <a
          href={csvHref}
          download
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3 text-[12px] font-medium text-ink-800 transition hover:border-ink-300 hover:bg-ink-50"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </a>
      ) : null}
      {xlsHref ? (
        <a
          href={xlsHref}
          download
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3 text-[12px] font-medium text-ink-800 transition hover:border-ink-300 hover:bg-ink-50"
        >
          <Download className="h-3.5 w-3.5" /> Excel (.xls)
        </a>
      ) : null}
      <Button variant="secondary" size="sm" className="h-9" onClick={() => window.print()}>
        <Printer className="h-3.5 w-3.5" /> Print
      </Button>
    </div>
  );
}
