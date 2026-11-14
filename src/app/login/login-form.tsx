"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { SessionUser } from "@/lib/types";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type FormValues = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { role: "Super Admin", email: "superadmin@fincloud.demo", scope: "All branches" },
  { role: "Admin", email: "admin@fincloud.demo", scope: "All branches" },
  { role: "Branch Manager", email: "manager.mumbai@fincloud.demo", scope: "Mumbai branch" },
  { role: "Loan Officer", email: "officer.mumbai@fincloud.demo", scope: "Mumbai branch" },
  { role: "Credit Officer", email: "credit.mumbai@fincloud.demo", scope: "Mumbai branch" },
  { role: "Collection Officer", email: "collections.mumbai@fincloud.demo", scope: "Mumbai branch" },
];

const DEMO_PASSWORD = "Fincloud@2026";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      await api.post<{ user: SessionUser }>("/auth/login", values);
      toast.success("Signed in", "Loading your workspace…");
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      toast.error("Unable to sign in", errorMessage(error));
      setSubmitting(false);
    }
  });

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Work email" htmlFor="email" error={errors.email?.message}>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="name@fincloud.demo"
              className="h-11 pl-9"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
          </div>
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="h-11 pl-9 pr-10"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <Button type="submit" className="h-11 w-full" loading={submitting}>
          Sign in to workspace <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <div className="rounded-xl border border-ink-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Demo role profiles</p>
          <span className="whitespace-nowrap rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
            Password · {DEMO_PASSWORD}
          </span>
        </div>
        <div className="grid gap-1 p-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setValue("email", account.email, { shouldValidate: true });
                setValue("password", DEMO_PASSWORD, { shouldValidate: true });
              }}
              className="rounded-lg px-2.5 py-2 text-left transition hover:bg-brand-50"
            >
              <p className="text-[12px] font-medium text-ink-800">{account.role}</p>
              <p className="truncate text-[10px] text-ink-400">{account.scope}</p>
            </button>
          ))}
        </div>
        <p className="border-t border-ink-100 px-4 py-2 text-[10px] leading-relaxed text-ink-400">
          Selecting a profile fills the credentials. Demo users share one password; roles map to server-side
          permissions and branch scope.
        </p>
      </div>
    </div>
  );
}
