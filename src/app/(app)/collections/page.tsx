import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CalendarClock, HandCoins, ShieldCheck, Wallet } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope } from "@/server/access";
import {
  COLLECTION_TABS,
  getCollectionFilterOptions,
  getCollectionsOverview,
  normalizeCollectionTab,
  type CollectionTab,
} from "@/server/collections";
import { can } from "@/lib/rbac";
import { BUCKET_LABELS } from "@/lib/labels";
import { formatINRCompact, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { PermissionDenied } from "@/components/ui/states";
import { CollectionFilters } from "./filters";
import { CollectionsTable } from "./table";

export const metadata = { title: "Collections" };

function single(value: string | string[] | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberParam(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "collections:view")) {
    return <PermissionDenied className="mt-2" />;
  }

  const params = await searchParams;
  const tab = normalizeCollectionTab(single(params.tab));
  const bucket = single(params.bucket);
  const assignee = single(params.assignee);
  const branch = single(params.branch);
  const dpdMin = numberParam(single(params.dpdMin));
  const dpdMax = numberParam(single(params.dpdMax));

  const scope = buildScope(user);
  const overview = getCollectionsOverview(scope, {
    tab,
    bucket,
    assigneeId: assignee,
    branchId: branch,
    minDpd: dpdMin,
    maxDpd: dpdMax,
  });
  const options = getCollectionFilterOptions(scope);

  const activeFilterCount = [bucket, assignee, branch, dpdMin, dpdMax].filter(
    (value) => value !== undefined && value !== "",
  ).length;

  const hrefFor = (nextTab: CollectionTab) => {
    const search = new URLSearchParams();
    if (nextTab !== "ALL") search.set("tab", nextTab);
    if (bucket) search.set("bucket", bucket);
    if (assignee) search.set("assignee", assignee);
    if (branch) search.set("branch", branch);
    if (dpdMin !== undefined) search.set("dpdMin", String(dpdMin));
    if (dpdMax !== undefined) search.set("dpdMax", String(dpdMax));
    const query = search.toString();
    return query ? `/collections?${query}` : "/collections";
  };

  const tabs = COLLECTION_TABS.map((item) => ({
    key: item.key,
    label: item.label,
    href: hrefFor(item.key),
    count: item.key === tab ? -1 : overview.counts[item.key],
  }));

  const { kpis, counts } = overview;
  const activeBucket = bucket && bucket in BUCKET_LABELS ? BUCKET_LABELS[bucket] : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Collections & recovery"
        title="Collections"
        description={`Overdue servicing, promise tracking and recovery escalation for ${
          scope.isGlobal ? "all branches" : user.branchName
        }. Amounts in INR and computed from the synthetic DEMO dataset.`}
        breadcrumbs={[{ label: "Collections" }]}
        actions={
          <>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11px] font-medium text-ink-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              {scope.isGlobal ? "All branches" : user.branchName}
            </span>
            <Link
              href="/tasks?category=COLLECTION"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-950 px-3.5 text-[12px] font-medium text-white transition hover:bg-ink-900"
            >
              <CalendarClock className="h-3.5 w-3.5" /> Collection tasks
            </Link>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Collection key indicators">
        <StatCard
          label="Open cases"
          value={formatNumber(kpis.openCases)}
          hint={`${formatNumber(counts.PENDING)} pending · ${formatNumber(counts.RECOVERY + counts.LEGAL)} in recovery/legal`}
          icon={<HandCoins className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Overdue amount"
          value={formatINRCompact(kpis.overdueAmount)}
          hint={`${formatNumber(counts.LEGAL)} in legal · ${formatNumber(counts.PRE_COLLECTION)} pre-due`}
          icon={<Wallet className="h-4 w-4" />}
          accent="rose"
        />
        <StatCard
          label="PTP due"
          value={formatINRCompact(kpis.ptpAmount)}
          hint={`${formatNumber(kpis.ptpCount)} promise${kpis.ptpCount === 1 ? "" : "s"} tracked`}
          icon={<CalendarClock className="h-4 w-4" />}
          accent="amber"
        />
        <StatCard
          label="Resolved this month"
          value={formatNumber(kpis.resolvedThisMonth)}
          hint={`${formatNumber(counts.RESOLVED)} resolved in total`}
          icon={<ShieldCheck className="h-4 w-4" />}
          accent="sky"
        />
      </section>

      <div className="surface rounded-2xl px-2 pt-1 sm:px-4">
        <LinkTabs items={tabs} />
      </div>

      <CollectionFilters
        options={options}
        values={{ bucket, assignee, branch, dpdMin, dpdMax }}
        activeCount={activeFilterCount}
      />

      {activeBucket ? (
        <p className="text-[11px] text-ink-500">
          Showing <span className="font-medium text-ink-700">{activeBucket}</span> cases only. Pre-collection cases carry
          no overdue amount — they are upcoming dues and do not require a forced payment.
        </p>
      ) : null}

      <CollectionsTable rows={overview.rows} />

      <div className="flex items-start gap-2 rounded-xl border border-ink-100 bg-white/60 px-4 py-3 text-[10.5px] leading-relaxed text-ink-500">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <p>
          DEMO environment: recovery steps, receipts and payments are simulated. No customer communication is sent and no
          real funds move. Case actions respect branch scope and are recorded in the audit trail.
        </p>
      </div>
    </div>
  );
}
