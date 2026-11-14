import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck,
  Clock3,
  KeyRound,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { getStore } from "@/server/store";
import { ROLE_DEFINITIONS, isGlobalRole } from "@/lib/rbac";
import type { Permission } from "@/lib/types";
import { ROLE_LABELS, humanize } from "@/lib/labels";
import { formatDate, formatDateTime, formatRelative } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { PreferencesDemo } from "./preferences-demo";

export const metadata = { title: "My Profile" };

const DOMAIN_LABELS: Record<string, string> = {
  dashboard: "Overview",
  leads: "Leads",
  applications: "Applications",
  credit: "Credit",
  sanctions: "Sanctions",
  disbursements: "Disbursements",
  collections: "Collections",
  tasks: "Tasks",
  authorizations: "Authorizations",
  customers: "Customers",
  users: "Users & access",
  reports: "Reports & MIS",
  audit: "Audit",
  operations: "Support operations",
};

function groupPermissions(permissions: Permission[]) {
  return Object.keys(DOMAIN_LABELS)
    .map((domain) => ({
      domain,
      label: DOMAIN_LABELS[domain],
      permissions: permissions.filter((permission) => permission.split(":")[0] === domain),
    }))
    .filter((group) => group.permissions.length > 0);
}

export default async function ProfilePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");

  const store = getStore();
  const record = store.users.find((user) => user.id === sessionUser.id);
  const branch = store.branches.find((item) => item.id === sessionUser.branchId);
  const roleDefinition = ROLE_DEFINITIONS[sessionUser.role];
  const groups = groupPermissions(roleDefinition.permissions);
  const global = isGlobalRole(sessionUser.role);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Account"
        title="My profile"
        description="Your identity, role-based access and session details. Profile data comes from the synthetic demo store; nothing here is synced with an identity provider."
        actions={
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Demo account
          </span>
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
            <Avatar name={sessionUser.name} color={sessionUser.avatarColor} size="lg" className="h-14 w-14 text-base" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">{sessionUser.name}</h2>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
                  {ROLE_LABELS[sessionUser.role] ?? sessionUser.role}
                </span>
                {record ? <StatusBadge status={record.status} /> : null}
              </div>
              <p className="mt-0.5 text-[12.5px] text-ink-600">{sessionUser.designation}</p>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-[11.5px] sm:grid-cols-2">
                <div className="flex items-center gap-1.5 text-ink-600">
                  <Mail className="h-3.5 w-3.5 text-ink-400" />
                  <span className="truncate">{sessionUser.email}</span>
                </div>
                <div className="flex items-center gap-1.5 text-ink-600">
                  <Phone className="h-3.5 w-3.5 text-ink-400" />
                  <span>{record?.phone ?? "—"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-ink-600">
                  <MapPin className="h-3.5 w-3.5 text-ink-400" />
                  <span className="truncate">{branch?.name ?? "Unassigned"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-ink-600">
                  <Clock3 className="h-3.5 w-3.5 text-ink-400" />
                  <span>
                    Last login{" "}
                    {record?.lastLoginAt ? `${formatRelative(record.lastLoginAt)} · ${formatDateTime(record.lastLoginAt)}` : "—"}
                  </span>
                </div>
              </dl>
            </div>
          </div>
          <div className="grid gap-3 border-t border-ink-100 bg-ink-50/40 px-5 py-3 text-[10.5px] text-ink-500 sm:grid-cols-3">
            <div>
              <p className="font-semibold uppercase tracking-[0.06em] text-ink-400">User ID</p>
              <p className="mt-0.5 font-mono text-ink-700">{sessionUser.id}</p>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-[0.06em] text-ink-400">Branch code</p>
              <p className="mt-0.5 font-mono text-ink-700">{branch?.code ?? "—"}</p>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-[0.06em] text-ink-400">Member since</p>
              <p className="mt-0.5 text-ink-700">{record ? formatDate(record.createdAt) : "—"}</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Session & security" description="How this demo session is protected" />
          <div className="space-y-3 p-5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <Lock className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[11.5px] font-medium text-ink-800">HttpOnly session cookie</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-500">
                  <code className="font-mono">fincloud_session</code> is signed (HMAC-SHA256), HttpOnly, SameSite=Lax and
                  not readable from JavaScript.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <Clock3 className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[11.5px] font-medium text-ink-800">8 hour expiry</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-500">
                  Sessions expire 8 hours after sign-in. Expired or invalid tokens redirect to the login screen with an
                  expiry notice.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <KeyRound className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[11.5px] font-medium text-ink-800">401 handling</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-500">
                  Any API call returning 401 clears local state and returns you to <code className="font-mono">/login</code>{" "}
                  with the original destination preserved.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2 text-[10.5px] leading-relaxed text-ink-500">
              Passwords are stored only as scrypt hashes. This demo shares one password
              (<span className="font-semibold text-ink-700">Fincloud@2026</span>) across seeded accounts — hashes are
              never returned by the API.
            </div>
          </div>
        </Card>
      </section>

      <div id="access" className="scroll-mt-24">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-700" /> Access &amp; permissions
              </span>
            }
            description={roleDefinition.description}
            action={
              <span className="rounded-md bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
                {roleDefinition.permissions.length} permissions
              </span>
            }
          />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10.5px] text-ink-600">
                <BadgeCheck className="h-3 w-3 text-brand-600" /> Role: {roleDefinition.label}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10.5px] text-ink-600">
                <MapPin className="h-3 w-3 text-ink-400" /> Scope:{" "}
                {global ? "All branches" : branch?.name ?? "Own branch only"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10.5px] text-ink-600">
                <Layers className="h-3 w-3 text-ink-400" /> {groups.length} permission groups
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((group) => (
                <div key={group.domain} className="rounded-xl border border-ink-100 bg-ink-50/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">{group.label}</p>
                  <ul className="mt-2 space-y-1.5">
                    {group.permissions.map((permission) => (
                      <li key={permission} className="flex items-center gap-1.5 text-[11px] text-ink-700">
                        <BadgeCheck className="h-3 w-3 shrink-0 text-brand-600" />
                        <code className="font-mono text-[10.5px]">{permission}</code>
                        <span className="truncate text-[10px] text-ink-400">
                          {humanize(permission.split(":")[1] ?? "")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-ink-100 bg-white px-3.5 py-3 text-[10.5px] leading-relaxed text-ink-500">
              <span className="font-semibold text-ink-700">Branch scope:</span>{" "}
              {global
                ? "Your role sees records across every branch. Record-level scope checks still run on each API request."
                : `Your role is restricted to ${branch?.name ?? "your branch"}. Requests touching other branches are rejected with 403 by the server, regardless of UI state.`}{" "}
              Permissions are resolved from <code className="font-mono">ROLE_DEFINITIONS</code> at request time. To change
              access, an administrator must update your role under Users &amp; roles.
            </div>
          </div>
        </Card>
      </div>

      <div id="preferences" className="scroll-mt-24">
        <Card>
          <CardHeader
            title="Workspace preferences"
            description="Prototype controls — explicitly not persisted in this demo"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[10px] font-medium text-ink-500">
                <Sparkles className="h-3 w-3" /> Demo only
              </span>
            }
          />
          <PreferencesDemo />
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-ink-500">
        <p className="max-w-2xl leading-relaxed">
          Demo notice: this profile is part of a synthetic FinCloud LMS demonstration. No identity provider,
          notification service or preference store is connected. Profile values respect role permissions and branch
          scope at all times.
        </p>
        <Link href="/dashboard" className="font-medium text-brand-700 hover:text-brand-800">
          Back to dashboard →
        </Link>
      </div>
    </div>
  );
}
