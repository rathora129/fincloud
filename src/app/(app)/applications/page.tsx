import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { can } from "@/lib/rbac";
import { getApplicationsWorkspace } from "@/server/applications";
import { PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { PermissionDenied } from "@/components/ui/states";
import { ApplicationFilters } from "./application-filters";
import { ApplicationTable } from "./application-table";
import { NewApplicationModal } from "./new-application-modal";

export const metadata = { title: "Applications" };

const TABS = [
  { key: "all", label: "All Applications" },
  { key: "new", label: "New" },
  { key: "auto", label: "Auto Applications" },
  { key: "in_process", label: "In-process" },
  { key: "recommended", label: "Recommended" },
  { key: "send_back", label: "Send-back" },
];

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "applications:view")) return <PermissionDenied />;

  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) || undefined;
  };

  const query = {
    tab: pick("tab"),
    q: pick("q"),
    status: pick("status"),
    product: pick("product"),
    ownerId: pick("owner"),
    branchId: pick("branch"),
    from: pick("from"),
    to: pick("to"),
  };

  const { items, counts, options } = getApplicationsWorkspace(user, query);
  const activeTab = TABS.some((tab) => tab.key === query.tab) ? query.tab! : "all";
  const countFor = (tab: string) =>
    tab === "all"
      ? counts.all
      : tab === "new"
        ? counts.new
        : tab === "auto"
          ? counts.auto
          : tab === "in_process"
            ? counts.inProcess
            : tab === "recommended"
              ? counts.recommended
              : counts.sentBack;

  const base = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) base.set(key, first);
  }
  const hrefFor = (tab: string) => {
    const next = new URLSearchParams(base);
    if (tab === "all") next.delete("tab");
    else next.set("tab", tab);
    return `/applications${next.size ? `?${next.toString()}` : ""}`;
  };

  const activeFilterCount = [query.status, query.product, query.ownerId, query.branchId, query.from, query.to].filter(
    Boolean,
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Loan applications"
        description="Track every loan file from intake through verification and credit recommendation. Auto-application records are synthetic DEMO data."
        breadcrumbs={[{ label: "Origination" }, { label: "Applications" }]}
        actions={
          <NewApplicationModal
            canManage={options.canManage}
            owners={options.owners}
            branches={options.branches}
            customers={options.customers}
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

      <ApplicationFilters
        values={{
          q: query.q,
          status: query.status,
          product: query.product,
          owner: query.ownerId,
          branch: query.branchId,
          from: query.from,
          to: query.to,
        }}
        owners={options.owners}
        branches={options.branches}
        activeCount={activeFilterCount}
      />

      <ApplicationTable items={items} />
    </div>
  );
}
