import { redirect } from "next/navigation";
import Link from "next/link";
import { FileSignature, LifeBuoy, MessageSquareWarning, ShieldAlert, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope } from "@/server/access";
import { getOperationsData } from "@/server/operations";
import { can } from "@/lib/rbac";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { PermissionDenied } from "@/components/ui/states";
import { OperationsBoard } from "./operations-client";

export const metadata = { title: "Support Operations" };

export default async function OperationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "operations:view")) {
    return <PermissionDenied className="mt-2" />;
  }

  const scope = buildScope(user);
  const data = getOperationsData(scope);
  const canManage = can(user, "operations:manage");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Support operations"
        description={`eSign tracking, negative list and grievance handling for ${
          scope.isGlobal ? "all branches" : user.branchName
        }. Every write is permission-checked and audited. No external provider, bureau or communication channel is connected.`}
        actions={
          <>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Demo integrations
            </span>
            {can(user, "audit:view") ? (
              <Link
                href="/audit-logs?action=GRIEVANCE_UPDATED"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-950 px-3.5 text-[12px] font-medium text-white transition hover:bg-ink-900"
              >
                <FileSignature className="h-3.5 w-3.5" /> Related audit entries
              </Link>
            ) : null}
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Operations summary">
        <StatCard
          label="eSign pending"
          value={formatNumber(data.counts.esignPending)}
          hint="Not initiated or initiated"
          icon={<FileSignature className="h-4 w-4" />}
          accent="amber"
        />
        <StatCard
          label="eSign signed"
          value={formatNumber(data.counts.esignSigned)}
          hint="DEMO completion only"
          icon={<ShieldCheck className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Active blacklist entries"
          value={formatNumber(data.counts.blacklistActive)}
          hint="Masked identifiers"
          icon={<ShieldAlert className="h-4 w-4" />}
          accent="rose"
        />
        <StatCard
          label="Open grievances"
          value={formatNumber(data.counts.grievancesOpen)}
          hint="Open or in review"
          icon={<MessageSquareWarning className="h-4 w-4" />}
          accent="sky"
        />
      </section>

      <OperationsBoard
        esign={data.esign}
        blacklist={data.blacklist}
        grievances={data.grievances}
        canManage={canManage}
      />

      <Card>
        <CardHeader
          title="Support operations boundaries"
          description="What this demo does and does not do"
          action={<LifeBuoy className="h-4 w-4 text-brand-700" />}
        />
        <div className="grid gap-3 px-5 py-4 text-[10.5px] leading-relaxed text-ink-500 sm:grid-cols-2">
          <p>
            eSign is a DEMO placeholder connected to no provider. Blacklist and grievance records are synthetic and
            scoped by branch. Adding a blacklist entry stores masked identifiers only — never full PAN, Aadhaar or phone
            numbers.
          </p>
          <p>
            No bureau pull, SMS/email, WhatsApp or payment integration is called. Status changes and new entries are
            appended to the audit trail and are visible under Administration → Audit logs.
            {canManage ? "" : " Your role has read-only access to support operations."}
          </p>
        </div>
      </Card>
    </div>
  );
}
