export type ReportKey =
  | "leads"
  | "applications"
  | "credit-decisions"
  | "sanctions"
  | "disbursements"
  | "collections"
  | "employee-performance";

export type ReportDefinition = {
  key: ReportKey;
  title: string;
  description: string;
  supportsProduct: boolean;
  joinLabel: string;
};

export const REPORT_CATALOG: ReportDefinition[] = [
  {
    key: "leads",
    title: "Lead generation",
    description: "Lead inflow, source mix, ownership and conversion by branch.",
    supportsProduct: false,
    joinLabel: "Lead created date",
  },
  {
    key: "applications",
    title: "Loan applications",
    description: "Applications filed with requested and approved amounts.",
    supportsProduct: true,
    joinLabel: "Application created date",
  },
  {
    key: "credit-decisions",
    title: "Credit decisions",
    description: "Approvals, rejections and send-backs recorded by the credit desk.",
    supportsProduct: true,
    joinLabel: "Credit decision date",
  },
  {
    key: "sanctions",
    title: "Sanctions",
    description: "Sanction offers, approved limits, fees and acceptance status.",
    supportsProduct: true,
    joinLabel: "Sanction decision date",
  },
  {
    key: "disbursements",
    title: "Disbursements",
    description: "Payout requests and completed DEMO disbursements by mode.",
    supportsProduct: true,
    joinLabel: "Processed or requested date",
  },
  {
    key: "collections",
    title: "Collections",
    description: "Overdue buckets, exposure, DPD and promise-to-pay coverage.",
    supportsProduct: true,
    joinLabel: "Case created date",
  },
  {
    key: "employee-performance",
    title: "Employee performance",
    description: "Officer-level productivity across sourcing, credit, payouts and recovery.",
    supportsProduct: false,
    joinLabel: "Activity in selected period",
  },
];

export const REPORT_KEYS = REPORT_CATALOG.map((definition) => definition.key);

export function isReportKey(value: string | undefined): value is ReportKey {
  return Boolean(value && REPORT_KEYS.includes(value as ReportKey));
}

export type ReportExportFormat = "csv" | "xls";

export type ReportExportFilters = {
  from?: string;
  to?: string;
  branch?: string;
  product?: string;
};

/**
 * Builds an absolute-path link to the export route. Safe to render inside a
 * plain <a download> so the browser streams the generated file directly.
 */
export function reportExportUrl(
  report: string,
  format: ReportExportFormat,
  filters: ReportExportFilters = {},
) {
  const params = new URLSearchParams();
  params.set("format", format);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.branch) params.set("branch", filters.branch);
  if (filters.product) params.set("product", filters.product);
  return `/api/exports/${report}?${params.toString()}`;
}
