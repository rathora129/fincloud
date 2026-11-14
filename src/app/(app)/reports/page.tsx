import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BarChart3, Clock3, Database, FileSpreadsheet, Info } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { buildScope, inScope } from "@/server/access";
import { getStore } from "@/server/store";
import {
  formatReportCell,
  formatReportKpi,
  getReport,
  isReportKey,
  type ReportFilters,
  type ReportResult,
} from "@/server/reports";
import { REPORT_CATALOG, reportExportUrl, type ReportKey } from "@/services/reports";
import { can } from "@/lib/rbac";
import type { LoanProduct } from "@/lib/types";
import { PRODUCT_LABELS } from "@/lib/labels";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PermissionDenied } from "@/components/ui/states";
import { ReportControls } from "./report-controls";
import { ReportToolbar } from "./report-toolbar";

export const metadata = { title: "Reports & MIS" };

const KPI_ACCENTS = ["brand", "sky", "amber", "ink"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, "reports:view")) {
    return <PermissionDenied className="mt-2" />;
  }

  const params = await searchParams;
  const value = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  const scope = buildScope(user);
  const requestedReport = value("report");
  const reportKey: ReportKey = isReportKey(requestedReport) ? requestedReport : "leads";
  const branches = getStore()
    .branches.filter((branch) => inScope(scope, branch.id))
    .map((branch) => ({ id: branch.id, name: branch.name }));

  const requestedBranch = value("branch");
  const branchId = requestedBranch && branches.some((branch) => branch.id === requestedBranch) ? requestedBranch : undefined;
  const product = value("product") as LoanProduct | undefined;

  const filters: ReportFilters = {
    from: value("from") && ISO_DATE.test(value("from")!) ? value("from") : undefined,
    to: value("to") && ISO_DATE.test(value("to")!) ? value("to") : undefined,
    branchId,
    product: product ?? undefined,
  };

  const result = getReport(reportKey, scope, filters);
  const canExport = can(user, "reports:export");
  const exportFilters = {
    from: result.range.from,
    to: result.range.to,
    branch: branchId,
    product: result.supportsProduct ? filters.product : undefined,
  };
  const scopeLabel = branchId
    ? branches.find((branch) => branch.id === branchId)?.name ?? user.branchName
    : scope.isGlobal
      ? "All branches"
      : user.branchName;
  const productLabel = result.supportsProduct && filters.product ? PRODUCT_LABELS[filters.product] : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Intelligence"
        title="Reports & MIS"
        description="Run operational and performance reports from the synthetic demo store. Filters are computed server-side, respect branch scope and can be exported as CSV or Excel."
        actions={
          <ReportToolbar
            csvHref={canExport ? reportExportUrl(result.key, "csv", exportFilters) : null}
            xlsHref={canExport ? reportExportUrl(result.key, "xls", exportFilters) : null}
          />
        }
      />

      <div className="no-print flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Demo / synthetic data
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10.5px] text-ink-500">
          <Clock3 className="h-3 w-3" /> Generated {formatDateTime(result.generatedAt)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10.5px] text-ink-500">
          <Database className="h-3 w-3" /> {scopeLabel}
        </span>
        {productLabel ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10.5px] text-ink-500">
            <BarChart3 className="h-3 w-3" /> {productLabel}
          </span>
        ) : null}
      </div>

      <section className="no-print grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Report catalog">
        {REPORT_CATALOG.map((definition) => {
          const active = definition.key === result.key;
          return (
            <Link
              key={definition.key}
              href={`/reports?report=${definition.key}`}
              className={cn(
                "group flex flex-col justify-between gap-2 rounded-xl border p-3 transition",
                active
                  ? "border-brand-200 bg-brand-50/70"
                  : "border-ink-100 bg-white hover:border-ink-200 hover:bg-ink-50/40",
              )}
              aria-current={active ? "page" : undefined}
            >
              <div>
                <p className={cn("text-[12px] font-semibold", active ? "text-brand-800" : "text-ink-800")}>
                  {definition.title}
                </p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-500">{definition.description}</p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10.5px] font-medium",
                  active ? "text-brand-700" : "text-ink-400 group-hover:text-ink-700",
                )}
              >
                {active ? "Currently open" : "Open report"} <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          );
        })}
      </section>

      <ReportControls
        report={result.key}
        branches={branches}
        values={{ from: filters.from, to: filters.to, branch: branchId, product: filters.product }}
        supportsProduct={result.supportsProduct}
      />

      <div className="hidden print:block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-700">FinCloud LMS · DEMO</p>
        <h1 className="mt-1 text-xl font-semibold text-ink-950">{result.title}</h1>
        <p className="mt-1 text-[11px] text-ink-600">
          Period {result.range.from} to {result.range.to} · {scopeLabel} · Generated{" "}
          {formatDateTime(result.generatedAt)} · Synthetic data — not for credit or regulatory use.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Report KPIs">
        {result.kpis.map((kpi, index) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={formatReportKpi(kpi)}
            hint={kpi.hint ?? `Period ${result.range.from} → ${result.range.to}`}
            accent={KPI_ACCENTS[index % KPI_ACCENTS.length]}
          />
        ))}
      </section>

      <ReportTable result={result} scopeLabel={scopeLabel} />

      <div className="flex items-start gap-2 rounded-xl border border-ink-100 bg-white/60 px-4 py-3 text-[10.5px] leading-relaxed text-ink-500">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-ink-100 text-ink-600">
          <Info className="h-3 w-3" />
        </span>
        <p>
          {result.title} is computed live from the synthetic DEMO dataset using the {result.joinLabel.toLowerCase()}.
          Exports are generated server-side, carry branch scope and are recorded in the audit trail as
          EXPORT_GENERATED with row counts. No bureau, payment or communication integrations are connected. All amounts
          in INR{canExport ? "" : " · your role can view but not export reports"}.
        </p>
      </div>
    </div>
  );
}

function ReportTable({ result, scopeLabel }: { result: ReportResult; scopeLabel: string }) {
  const hasTotals = result.columns.some((column) => result.totals[column.key] !== undefined);

  return (
    <Card className="overflow-hidden print-plain">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-brand-700" />
            {result.title}
          </span>
        }
        description={`${result.description} · ${result.joinLabel}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-ink-100 px-2 py-1 text-[10px] font-medium text-ink-600">
              {formatNumber(result.rowCount)} rows
            </span>
            <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
              DEMO
            </span>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/70">
              {result.columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500",
                    column.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={result.columns.length} className="px-4 py-12 text-center text-[12px] text-ink-400">
                  No records match the selected period{scopeLabel ? ` and scope (${scopeLabel})` : ""}.
                </td>
              </tr>
            ) : (
              result.rows.map((row, rowIndex) => (
                <tr
                  key={`${result.key}-${rowIndex}`}
                  className="border-b border-ink-100/70 last:border-0 hover:bg-brand-50/30"
                >
                  {result.columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "whitespace-nowrap px-4 py-2.5",
                        column.align === "right" ? "text-right tabular text-ink-800" : "text-ink-700",
                      )}
                    >
                      {formatReportCell(row[column.key], column.format)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {hasTotals && result.rows.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-ink-200 bg-brand-50/70">
                {result.columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold text-ink-900",
                      column.align === "right" ? "text-right tabular" : "text-left",
                    )}
                  >
                    {index === 0
                      ? "TOTAL"
                      : result.totals[column.key] !== undefined
                        ? formatReportCell(result.totals[column.key], column.format)
                        : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <CardBody className="border-t border-ink-100 bg-ink-50/30 py-2.5 text-[10px] text-ink-500">
        Period {result.range.from} → {result.range.to} · Scope {scopeLabel} · Generated{" "}
        {formatDateTime(result.generatedAt)} · {formatNumber(result.rowCount)} rows · synthetic demo data
      </CardBody>
    </Card>
  );
}
