import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { getCustomersWorkspace } from "@/server/customers";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { PermissionDenied } from "@/components/ui/states";
import { CustomerFilters } from "./customer-filters";
import { CustomerTable } from "./customer-table";

export const metadata = { title: "Customers" };

const TABS = [
  { key: "all", label: "All customers" },
  { key: "verified", label: "KYC verified" },
  { key: "pending", label: "KYC pending" },
  { key: "rejected", label: "KYC rejected" },
  { key: "with_loans", label: "Active loans" },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "customers:view")) return <PermissionDenied />;

  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) || undefined;
  };

  const query = {
    tab: pick("tab"),
    q: pick("q"),
    kyc: pick("kyc"),
    branchId: pick("branch"),
    employmentType: pick("employment"),
  };

  const { items, counts, branches } = getCustomersWorkspace(user, query);
  const activeTab = TABS.some((tab) => tab.key === query.tab) ? query.tab! : "all";
  const countFor = (tab: string) =>
    tab === "all"
      ? counts.all
      : tab === "verified"
        ? counts.verified
        : tab === "pending"
          ? counts.pending
          : tab === "rejected"
            ? counts.rejected
            : counts.withLoans;

  const base = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) base.set(key, first);
  }
  const hrefFor = (tab: string) => {
    const next = new URLSearchParams(base);
    if (tab === "all") next.delete("tab");
    else next.set("tab", tab);
    return `/customers${next.size ? `?${next.toString()}` : ""}`;
  };

  const activeFilterCount = [query.kyc, query.branchId, query.employmentType].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customer 360"
        description="A single relationship view across applications, documents, sanctions, disbursements, repayments and collections. All customer records are synthetic DEMO data."
        breadcrumbs={[{ label: "Origination" }, { label: "Customers" }]}
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

      <CustomerFilters
        values={{ q: query.q, kyc: query.kyc, branch: query.branchId, employment: query.employmentType }}
        branches={branches}
        activeCount={activeFilterCount}
      />

      <CustomerTable items={items} />
    </div>
  );
}
