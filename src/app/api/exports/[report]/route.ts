import {
  ApiError,
  asString,
  assertBranchScope,
  assertPermission,
  buildScope,
  errorResponse,
  requireSession,
} from "@/server/access";
import { getStore, appendAudit } from "@/server/store";
import {
  getReport,
  isReportKey,
  reportToCsv,
  reportToSpreadsheetXml,
  type ReportFilters,
} from "@/server/reports";

export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  try {
    const user = await requireSession();
    assertPermission(user, "reports:export");

    const { report } = await params;
    if (!isReportKey(report)) {
      throw new ApiError(404, "UNKNOWN_REPORT", "This report does not exist.");
    }

    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
    if (format !== "csv" && format !== "xls") {
      throw new ApiError(400, "INVALID_FORMAT", "Supported export formats are csv and xls.");
    }

    const scope = buildScope(user);
    const branchId = asString(url.searchParams.get("branch"));
    if (branchId) assertBranchScope(scope, branchId);

    const filters: ReportFilters = {
      from: asString(url.searchParams.get("from")),
      to: asString(url.searchParams.get("to")),
      branchId,
      product: asString(url.searchParams.get("product")),
    };

    const result = getReport(report, scope, filters);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `fincloud-${report}-${stamp}.${format === "xls" ? "xls" : "csv"}`;

    appendAudit(
      getStore(),
      user.id,
      "EXPORT_GENERATED",
      "Report",
      report,
      `Exported ${result.title} as ${format.toUpperCase()} — ${result.rowCount} rows, ${result.range.from} to ${
        result.range.to
      }${branchId ? `, branch ${branchId}` : ""}${filters.product ? `, product ${filters.product}` : ""}.`,
    );

    const body = format === "csv" ? reportToCsv(result) : reportToSpreadsheetXml(result);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type":
          format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
