import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f4f7f6] px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-ink-400 shadow-card">
        <SearchX className="h-6 w-6" />
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">404 · Not found</p>
      <h1 className="mt-1 text-xl font-semibold text-ink-950">This page isn’t in the demo workspace</h1>
      <p className="mt-1.5 max-w-sm text-sm text-ink-500">
        The route may have moved, or your role may not expose it. Return to the dashboard to continue.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>
    </main>
  );
}
