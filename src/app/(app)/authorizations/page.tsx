import { redirect } from "next/navigation";
import { CheckCircle2, Clock3, KeyRound, XCircle } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope } from "@/server/access";
import {
  AUTHORIZATION_TABS,
  getAuthorizationsOverview,
  normalizeAuthorizationTab,
  type AuthorizationTab,
} from "@/server/authorizations";
import { can } from "@/lib/rbac";
import { formatINRCompact, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { PermissionDenied } from "@/components/ui/states";
import { AuthorizationsTable } from "./table";
import { CreateAuthorizationButton } from "./create-request";

export const metadata = { title: "Authorizations" };

function single(value: string | string[] | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function AuthorizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "authorizations:view")) {
    return <PermissionDenied className="mt-2" />;
  }

  const params = await searchParams;
  const tab = normalizeAuthorizationTab(single(params.tab));

  const scope = buildScope(user);
  const overview = getAuthorizationsOverview(scope, tab);
  const { kpis, counts } = overview;

  const tabs = AUTHORIZATION_TABS.map((item) => ({
    key: item.key,
    label: item.label,
    href: item.key === "ALL" ? "/authorizations" : `/authorizations?tab=${item.key}`,
    count: item.key === tab ? -1 : counts[item.key as AuthorizationTab],
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Maker–checker controls"
        title="Authorizations"
        description={`Payment, LMS account and agency requests awaiting checker approval for ${
          scope.isGlobal ? "all branches" : user.branchName
        }. Decisions respect branch scope and are audited.`}
        breadcrumbs={[{ label: "Authorizations" }]}
        actions={
          <>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11px] font-medium text-ink-500">
              <KeyRound className="h-3.5 w-3.5" />
              {scope.isGlobal ? "All branches" : user.branchName}
            </span>
            <CreateAuthorizationButton />
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Authorization key indicators">
        <StatCard
          label="Pending approvals"
          value={formatNumber(kpis.pending)}
          hint={`${formatNumber(counts.ALL)} requests in scope`}
          icon={<Clock3 className="h-4 w-4" />}
          accent="amber"
        />
        <StatCard
          label="Pending amount"
          value={formatINRCompact(kpis.pendingAmount)}
          hint="Payment requests awaiting release"
          icon={<KeyRound className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Approved"
          value={formatNumber(kpis.approved)}
          hint="Authorized in DEMO mode"
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Rejected"
          value={formatNumber(kpis.rejected)}
          hint="Returned to requester with remarks"
          icon={<XCircle className="h-4 w-4" />}
          accent="rose"
        />
      </section>

      <div className="surface rounded-2xl px-2 pt-1 sm:px-4">
        <LinkTabs items={tabs} />
      </div>

      <AuthorizationsTable rows={overview.rows} canApprove={can(user, "authorizations:approve")} />

      <div className="flex items-start gap-2 rounded-xl border border-ink-100 bg-white/60 px-4 py-3 text-[10.5px] leading-relaxed text-ink-500">
        <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
        <p>
          DEMO maker–checker flow: approvals do not release funds, change LMS accounts or empanel agencies. Rejections
          require remarks; every decision is recorded in the audit trail with the checker identity.
        </p>
      </div>
    </div>
  );
}
