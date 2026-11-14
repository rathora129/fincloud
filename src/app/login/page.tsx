import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Check, Cloud, ShieldCheck, Sparkles } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const LIFECYCLE = ["Lead", "Application", "Credit", "Sanction", "Disburse", "Collect", "Close"];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; next?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const params = await searchParams;
  const nextPath = params.next && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/dashboard";

  return (
    <main className="flex min-h-screen bg-[#f4f7f6]">
      <section className="brand-mesh relative hidden w-[54%] flex-col justify-between overflow-hidden px-12 py-10 text-white lg:flex xl:px-16">
        <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(to_right,rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative">
          <div className="inline-flex items-center rounded-xl bg-white px-4 py-2.5 shadow-lg">
            <Image
              src="/assets/brand/fincloud-logo.png"
              alt="FinCloud Technologies"
              width={1065}
              height={516}
              className="h-9 w-auto"
              priority
            />
          </div>
          <div className="mt-14 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-wide text-brand-100">
              <Sparkles className="h-3.5 w-3.5" /> Loan Management System · DEMO workspace
            </div>
            <h1 className="mt-5 text-[40px] font-semibold leading-[1.1] tracking-[-0.03em] xl:text-[46px]">
              Lending operations,
              <br />
              from first contact
              <br />
              to final closure.
            </h1>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-white/65">
              A single operating layer for leads, credit assessment, sanctions, disbursement, collections and
              portfolio MIS — built for NBFC and lending teams.
            </p>
          </div>
        </div>

        <div className="relative space-y-7">
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Lifecycle coverage</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              {LIFECYCLE.map((stage, index) => (
                <div key={stage} className="flex items-center gap-2">
                  <span className="rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/80">
                    {stage}
                  </span>
                  {index < LIFECYCLE.length - 1 ? <span className="text-white/20">→</span> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: ShieldCheck, value: "RBAC", label: "Server-enforced roles" },
              { icon: Cloud, value: "6 roles", label: "Tailored workspaces" },
              { icon: Check, value: "Synthetic", label: "No real money movement" },
            ].map((item) => (
              <div key={item.value} className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
                <item.icon className="mb-2 h-4 w-4 text-brand-300" />
                <p className="text-sm font-semibold text-white">{item.value}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-white/45">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-5 text-[10.5px] text-white/35">
            <span>© {new Date().getFullYear()} FinCloud Technologies</span>
            <span>Demo build · v0.1</span>
          </div>
        </div>
      </section>

      <section className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-[46%] xl:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <Image
              src="/assets/brand/fincloud-logo.png"
              alt="FinCloud Technologies"
              width={1065}
              height={516}
              className="h-8 w-auto"
              priority
            />
          </div>

          <div className="mb-7">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-700 ring-1 ring-brand-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Demo environment
            </span>
            <h2 className="mt-4 text-[26px] font-semibold tracking-[-0.02em] text-ink-950">Sign in to FinCloud LMS</h2>
            <p className="mt-1.5 text-[13px] text-ink-500">
              Use a demo role profile to explore the lifecycle. All records are synthetic.
            </p>
          </div>

          {params.expired ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              Your session expired or was not valid. Please sign in again.
            </div>
          ) : null}

          <LoginForm nextPath={nextPath} />

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Session is issued as an HttpOnly, SameSite cookie.
          </p>

          <div className="mt-8 rounded-xl border border-ink-100 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold text-ink-800">Password recovery</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                  Recovery is handled by your identity provider and is not available in this demo build.
                </p>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-300" />
            </div>
          </div>

          <p className="mt-6 text-center text-[10.5px] text-ink-400">
            <Link href="/dashboard" className="hover:text-ink-600">
              FinCloud LMS
            </Link>{" "}
            · For demonstration to financial institutions. Not connected to production systems.
          </p>
        </div>
      </section>
    </main>
  );
}
