import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { can } from "@/lib/rbac";
import { getLeadsWorkspace } from "@/server/leads";
import { PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { PermissionDenied } from "@/components/ui/states";
import { LeadFilters } from "./lead-filters";
import { LeadTable } from "./lead-table";
import { NewLeadModal } from "./new-lead-modal";

export const metadata = { title: "Leads" };

const TABS = [
  { key: "all", label: "All Leads" },
  { key: "new", label: "New" },
  { key: "repeat", label: "Repeat" },
  { key: "pre_approved", label: "Pre-approved" },
  { key: "processing", label: "Processing" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "leads:view")) return <PermissionDenied />;

  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) || undefined;
  };

  const query = {
    tab: pick("tab"),
    q: pick("q"),
    status: pick("status"),
    source: pick("source"),
    ownerId: pick("owner"),
    branchId: pick("branch"),
    from: pick("from"),
    to: pick("to"),
  };

  const { items, counts, options } = getLeadsWorkspace(user, query);
  const activeTab = TABS.some((tab) => tab.key === query.tab) ? query.tab! : "all";

  const base = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) base.set(key, first);
  }
  const hrefFor = (tab: string) => {
    const next = new URLSearchParams(base);
    if (tab === "all") next.delete("tab");
    else next.set("tab", tab);
    return `/leads${next.size ? `?${next.toString()}` : ""}`;
  };

  const activeFilterCount = [query.status, query.source, query.ownerId, query.branchId, query.from, query.to].filter(
    Boolean,
  ).length;
  const canManage = can(user, "leads:manage");

  const countFor = (tab: string) =>
    tab === "all"
      ? counts.all
      : tab === "new"
        ? counts.new
        : tab === "repeat"
          ? counts.repeat
          : tab === "pre_approved"
            ? counts.preApproved
            : counts.processing;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lead management"
        description="Capture enquiries, qualify intent and convert ready leads into loan applications. Records shown are synthetic DEMO data."
        breadcrumbs={[{ label: "Origination" }, { label: "Leads" }]}
        actions={
          <NewLeadModal
            canManage={canManage}
            canAssign={can(user, "leads:assign")}
            owners={options.owners}
            branches={options.branches}
            currentUserId={options.currentUserId}
          />
        }
      />

      <div className="surface rounded-2xl px-4 pt-1">
        <LinkTabs
          className="border-b-0"
          items={TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
            count: activeTab === tab.key ? -1 : countFor(tab.key),
            href: hrefFor(tab.key),
          }))}
        />
      </div>

      <LeadFilters
        values={{ q: query.q, status: query.status, source: query.source, owner: query.ownerId, branch: query.branchId, from: query.from, to: query.to }}
        owners={options.owners}
        branches={options.branches}
        activeCount={activeFilterCount}
      />

      <LeadTable items={items} canManage={canManage} />
    </div>
  );
}
