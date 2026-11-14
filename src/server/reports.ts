import type { LoanProduct, Scope } from "@/lib/types";
import {
  BUCKET_LABELS,
  LEAD_TYPE_LABELS,
  PRODUCT_LABELS,
  ROLE_LABELS,
  SOURCE_LABELS,
  statusMeta,
} from "@/lib/labels";
import { formatDate, formatDateTime, formatINR, formatNumber, formatPercent } from "@/lib/utils";
import { REPORT_CATALOG, type ReportKey } from "@/services/reports";
import { getStore } from "./store";
import { sortBy } from "./query";
import { canViewRecord, inScope } from "./access";

const DAY = 86_400_000;

export type ReportFormat = "text" | "date" | "datetime" | "number" | "currency" | "percent";

export type ReportColumn = {
  key: string;
  label: string;
  format?: ReportFormat;
  align?: "left" | "right";
};

export type ReportRow = Record<string, string | number | null>;

export type ReportKpi = {
  label: string;
  value: number;
  format: "number" | "currency" | "percent";
  hint?: string;
};

export type ReportFilters = {
  from?: string;
  to?: string;
  branchId?: string;
  product?: string;
};

export type ReportResult = {
  key: ReportKey;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, number>;
  kpis: ReportKpi[];
  range: { from: string; to: string };
  generatedAt: string;
  rowCount: number;
  supportsProduct: boolean;
  joinLabel: string;
};

export type ReportDefinition = {
  key: ReportKey;
  title: string;
  description: string;
  supportsProduct: boolean;
  joinLabel: string;
};

export { REPORT_CATALOG, REPORT_KEYS, isReportKey } from "@/services/reports";
export type { ReportDefinition as ReportCatalogEntry } from "@/services/reports";

const PRODUCT_CODES: LoanProduct[] = ["PERSONAL", "BUSINESS", "HOME", "VEHICLE", "GOLD"];

function asProduct(value: string | undefined): LoanProduct | undefined {
  return PRODUCT_CODES.find((code) => code === value);
}

function isoDate(value: number | string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function productLabel(product: LoanProduct) {
  return PRODUCT_LABELS[product] ?? product;
}

function branchName(branchId: string) {
  return getStore().branches.find((b) => b.id === branchId)?.name ?? "Unassigned";
}

function userName(userId: string | null | undefined) {
  if (!userId) return "—";
  return getStore().users.find((u) => u.id === userId)?.name ?? "—";
}

function statusLabel(status: string | null | undefined) {
  return statusMeta(status).label;
}

export function formatReportCell(value: string | number | null | undefined, format: ReportFormat = "text") {
  if (value === null || value === undefined || value === "") return "—";
  switch (format) {
    case "date":
      return formatDate(String(value));
    case "datetime":
      return formatDateTime(String(value));
    case "currency":
      return formatINR(Number(value));
    case "percent":
      return formatPercent(Number(value));
    case "number":
      return formatNumber(Number(value));
    default:
      return String(value);
  }
}

export function formatReportKpi(kpi: ReportKpi) {
  if (kpi.format === "currency") return formatINR(kpi.value);
  if (kpi.format === "percent") return formatPercent(kpi.value);
  return formatNumber(kpi.value);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function resolveRange(filters: ReportFilters) {
  const from =
    filters.from && ISO_DATE.test(filters.from) ? filters.from : isoDate(Date.now() - 179 * DAY);
  const to = filters.to && ISO_DATE.test(filters.to) ? filters.to : isoDate(Date.now());
  return { from, to };
}

function rangeBounds(filters: ReportFilters) {
  const range = resolveRange(filters);
  const fromTime = new Date(`${range.from}T00:00:00`).getTime();
  const toTime = new Date(`${range.to}T23:59:59.999`).getTime();
  return { range, fromTime, toTime };
}

function within(value: string | null | undefined, from: number, to: number) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= from && time <= to;
}

export function getReport(key: ReportKey, scope: Scope, filters: ReportFilters = {}): ReportResult {
  const store = getStore();
  const { range, fromTime, toTime } = rangeBounds(filters);
  const product = asProduct(filters.product);
  const definition = REPORT_CATALOG.find((item) => item.key === key) ?? REPORT_CATALOG[0];
  const generatedAt = new Date().toISOString();

  const inBranch = (branchId: string) =>
    inScope(scope, branchId) && (!filters.branchId || branchId === filters.branchId);

  const appById = new Map(store.applications.map((app) => [app.id, app]));
  const customerById = new Map(store.customers.map((customer) => [customer.id, customer]));
  const loanById = new Map(store.loanAccounts.map((loan) => [loan.id, loan]));
  const base = {
    key,
    title: definition.title,
    description: definition.description,
    range,
    generatedAt,
    supportsProduct: definition.supportsProduct,
    joinLabel: definition.joinLabel,
  };

  if (key === "leads") {
    const leads = sortBy(
      store.leads.filter(
        (lead) =>
          inBranch(lead.branchId) &&
          within(lead.createdAt, fromTime, toTime) &&
          canViewRecord(scope.user, "LEAD", lead.id, "leads:view", lead.branchId, lead.ownerId),
      ),
      (lead) => new Date(lead.createdAt).getTime(),
      "desc",
    );
    const rows: ReportRow[] = leads.map((lead) => ({
      ref: lead.ref,
      createdAt: isoDate(lead.createdAt),
      customer: lead.customerName,
      source: SOURCE_LABELS[lead.source] ?? lead.source,
      type: LEAD_TYPE_LABELS[lead.type] ?? lead.type,
      status: statusLabel(lead.status),
      owner: userName(lead.ownerId),
      branch: branchName(lead.branchId),
      monthlyIncome: lead.monthlyIncome,
    }));
    const converted = leads.filter((lead) => lead.status === "CONVERTED").length;
    const qualified = leads.filter((lead) => lead.status === "QUALIFIED" || lead.status === "CONVERTED").length;
    return {
      ...base,
      columns: [
        { key: "ref", label: "Lead ref" },
        { key: "createdAt", label: "Created", format: "date" },
        { key: "customer", label: "Customer" },
        { key: "source", label: "Source" },
        { key: "type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "owner", label: "Owner" },
        { key: "branch", label: "Branch" },
        { key: "monthlyIncome", label: "Monthly income", format: "currency", align: "right" },
      ],
      rows,
      totals: { monthlyIncome: leads.reduce((acc, lead) => acc + lead.monthlyIncome, 0) },
      kpis: [
        { label: "Leads captured", value: leads.length, format: "number", hint: definition.joinLabel },
        { label: "Qualified or converted", value: qualified, format: "number" },
        { label: "Converted", value: converted, format: "number" },
        {
          label: "Conversion rate",
          value: leads.length ? (converted / leads.length) * 100 : 0,
          format: "percent",
        },
      ],
      rowCount: rows.length,
    };
  }

  if (key === "applications") {
    const applications = sortBy(
      store.applications.filter(
        (app) =>
          inBranch(app.branchId) &&
          (!product || app.product === product) &&
          within(app.createdAt, fromTime, toTime) &&
          canViewRecord(scope.user, "APPLICATION", app.id, "applications:view", app.branchId, app.ownerId),
      ),
      (app) => new Date(app.createdAt).getTime(),
      "desc",
    );
    const rows: ReportRow[] = applications.map((app) => ({
      ref: app.ref,
      createdAt: isoDate(app.createdAt),
      customer: customerById.get(app.customerId)?.name ?? "—",
      product: productLabel(app.product),
      requestedAmount: app.requestedAmount,
      approvedAmount: app.creditDecision?.approvedAmount ?? null,
      status: statusLabel(app.status),
      owner: userName(app.ownerId),
      branch: branchName(app.branchId),
    }));
    const approved = applications.filter((app) => app.creditDecision?.decision === "APPROVE").length;
    const rejected = applications.filter((app) => app.creditDecision?.decision === "REJECT").length;
    return {
      ...base,
      columns: [
        { key: "ref", label: "Application ref" },
        { key: "createdAt", label: "Created", format: "date" },
        { key: "customer", label: "Customer" },
        { key: "product", label: "Product" },
        { key: "requestedAmount", label: "Requested", format: "currency", align: "right" },
        { key: "approvedAmount", label: "Approved", format: "currency", align: "right" },
        { key: "status", label: "Status" },
        { key: "owner", label: "Owner" },
        { key: "branch", label: "Branch" },
      ],
      rows,
      totals: {
        requestedAmount: applications.reduce((acc, app) => acc + app.requestedAmount, 0),
        approvedAmount: applications.reduce((acc, app) => acc + (app.creditDecision?.approvedAmount ?? 0), 0),
      },
      kpis: [
        { label: "Applications", value: applications.length, format: "number", hint: definition.joinLabel },
        { label: "Credit approved", value: approved, format: "number" },
        { label: "Credit rejected", value: rejected, format: "number" },
        {
          label: "Requested value",
          value: applications.reduce((acc, app) => acc + app.requestedAmount, 0),
          format: "currency",
        },
      ],
      rowCount: rows.length,
    };
  }

  if (key === "credit-decisions") {
    const decisions = sortBy(
      store.applications.filter(
        (app) =>
          inBranch(app.branchId) &&
          (!product || app.product === product) &&
          Boolean(app.creditDecision) &&
          within(app.creditDecision?.decidedAt, fromTime, toTime) &&
          canViewRecord(scope.user, "APPLICATION", app.id, "credit:view", app.branchId, app.ownerId),
      ),
      (app) => new Date(app.creditDecision?.decidedAt ?? app.createdAt).getTime(),
      "desc",
    );
    const rows: ReportRow[] = decisions.map((app) => ({
      ref: app.ref,
      decidedAt: isoDate(app.creditDecision?.decidedAt ?? app.updatedAt),
      customer: customerById.get(app.customerId)?.name ?? "—",
      product: productLabel(app.product),
      decision:
        app.creditDecision?.decision === "APPROVE"
          ? "Approved"
          : app.creditDecision?.decision === "REJECT"
            ? "Rejected"
            : "Sent back",
      requestedAmount: app.requestedAmount,
      approvedAmount: app.creditDecision?.approvedAmount ?? null,
      riskBand: app.riskBand ? statusLabel(app.riskBand) : "—",
      creditOfficer: userName(app.creditDecision?.decidedBy),
      branch: branchName(app.branchId),
    }));
    const approved = decisions.filter((app) => app.creditDecision?.decision === "APPROVE").length;
    const rejected = decisions.filter((app) => app.creditDecision?.decision === "REJECT").length;
    return {
      ...base,
      columns: [
        { key: "ref", label: "Application ref" },
        { key: "decidedAt", label: "Decided", format: "date" },
        { key: "customer", label: "Customer" },
        { key: "product", label: "Product" },
        { key: "decision", label: "Decision" },
        { key: "requestedAmount", label: "Requested", format: "currency", align: "right" },
        { key: "approvedAmount", label: "Approved", format: "currency", align: "right" },
        { key: "riskBand", label: "Risk band" },
        { key: "creditOfficer", label: "Credit officer" },
        { key: "branch", label: "Branch" },
      ],
      rows,
      totals: {
        requestedAmount: decisions.reduce((acc, app) => acc + app.requestedAmount, 0),
        approvedAmount: decisions.reduce((acc, app) => acc + (app.creditDecision?.approvedAmount ?? 0), 0),
      },
      kpis: [
        { label: "Decisions", value: decisions.length, format: "number", hint: definition.joinLabel },
        { label: "Approved", value: approved, format: "number" },
        { label: "Rejected", value: rejected, format: "number" },
        {
          label: "Approval rate",
          value: decisions.length ? (approved / decisions.length) * 100 : 0,
          format: "percent",
        },
      ],
      rowCount: rows.length,
    };
  }

  if (key === "sanctions") {
    const sanctions = sortBy(
      store.sanctions.filter((sanction) => {
        if (!inBranch(sanction.branchId)) return false;
        const app = appById.get(sanction.applicationId);
        if (product && app?.product !== product) return false;
        if (within(sanction.decidedAt ?? sanction.requestedAt, fromTime, toTime) === false) return false;
        return canViewRecord(scope.user, "SANCTION", sanction.id, "sanctions:view", sanction.branchId, app?.ownerId);
      }),
      (sanction) => new Date(sanction.decidedAt ?? sanction.requestedAt).getTime(),
      "desc",
    );
    const rows: ReportRow[] = sanctions.map((sanction) => ({
      ref: sanction.ref,
      applicationRef: appById.get(sanction.applicationId)?.ref ?? "—",
      customer: customerById.get(sanction.customerId)?.name ?? "—",
      approvedAmount: sanction.approvedAmount,
      interestRate: sanction.interestRate,
      tenureMonths: sanction.tenureMonths,
      processingFee: sanction.processingFee,
      status: statusLabel(sanction.status),
      decidedAt: sanction.decidedAt ? isoDate(sanction.decidedAt) : null,
      branch: branchName(sanction.branchId),
    }));
    return {
      ...base,
      columns: [
        { key: "ref", label: "Sanction ref" },
        { key: "applicationRef", label: "Application" },
        { key: "customer", label: "Customer" },
        { key: "approvedAmount", label: "Approved limit", format: "currency", align: "right" },
        { key: "interestRate", label: "Rate", format: "percent", align: "right" },
        { key: "tenureMonths", label: "Tenure (m)", format: "number", align: "right" },
        { key: "processingFee", label: "Processing fee", format: "currency", align: "right" },
        { key: "status", label: "Status" },
        { key: "decidedAt", label: "Decided", format: "date" },
        { key: "branch", label: "Branch" },
      ],
      rows,
      totals: {
        approvedAmount: sanctions.reduce((acc, sanction) => acc + sanction.approvedAmount, 0),
        processingFee: sanctions.reduce((acc, sanction) => acc + sanction.processingFee, 0),
      },
      kpis: [
        { label: "Sanction offers", value: sanctions.length, format: "number", hint: definition.joinLabel },
        {
          label: "Approved limits",
          value: sanctions.reduce((acc, sanction) => acc + sanction.approvedAmount, 0),
          format: "currency",
        },
        {
          label: "Awaiting acceptance",
          value: sanctions.filter((sanction) => sanction.status === "PENDING_ACCEPTANCE").length,
          format: "number",
        },
        {
          label: "Rejected offers",
          value: sanctions.filter((sanction) => sanction.status === "REJECTED").length,
          format: "number",
        },
      ],
      rowCount: rows.length,
    };
  }

  if (key === "disbursements") {
    const disbursements = sortBy(
      store.disbursements.filter((disbursement) => {
        if (!inBranch(disbursement.branchId)) return false;
        const app = appById.get(disbursement.applicationId);
        if (product && app?.product !== product) return false;
        if (within(disbursement.processedAt ?? disbursement.requestedAt, fromTime, toTime) === false) return false;
        return canViewRecord(
          scope.user,
          "DISBURSEMENT",
          disbursement.id,
          "disbursements:view",
          disbursement.branchId,
          app?.ownerId,
        );
      }),
      (disbursement) => new Date(disbursement.processedAt ?? disbursement.requestedAt).getTime(),
      "desc",
    );
    const rows: ReportRow[] = disbursements.map((disbursement) => ({
      ref: disbursement.ref,
      requestedAt: isoDate(disbursement.requestedAt),
      processedAt: disbursement.processedAt ? isoDate(disbursement.processedAt) : null,
      customer: customerById.get(disbursement.customerId)?.name ?? "—",
      amount: disbursement.amount,
      mode: disbursement.mode,
      status: statusLabel(disbursement.status),
      bankRef: disbursement.bankRef ?? "—",
      branch: branchName(disbursement.branchId),
    }));
    const completed = disbursements.filter((disbursement) => disbursement.status === "COMPLETED");
    return {
      ...base,
      columns: [
        { key: "ref", label: "Disbursement ref" },
        { key: "requestedAt", label: "Requested", format: "date" },
        { key: "processedAt", label: "Processed", format: "date" },
        { key: "customer", label: "Customer" },
        { key: "amount", label: "Amount", format: "currency", align: "right" },
        { key: "mode", label: "Mode" },
        { key: "status", label: "Status" },
        { key: "bankRef", label: "Bank ref (DEMO)" },
        { key: "branch", label: "Branch" },
      ],
      rows,
      totals: { amount: disbursements.reduce((acc, disbursement) => acc + disbursement.amount, 0) },
      kpis: [
        { label: "Payout requests", value: disbursements.length, format: "number", hint: definition.joinLabel },
        { label: "Completed", value: completed.length, format: "number" },
        {
          label: "Disbursed value",
          value: completed.reduce((acc, disbursement) => acc + disbursement.amount, 0),
          format: "currency",
        },
        {
          label: "In progress",
          value: disbursements.filter((disbursement) => !["COMPLETED", "REJECTED"].includes(disbursement.status))
            .length,
          format: "number",
        },
      ],
      rowCount: rows.length,
    };
  }

  if (key === "collections") {
    const cases = sortBy(
      store.collectionCases.filter((collectionCase) => {
        if (!inBranch(collectionCase.branchId)) return false;
        const loan = loanById.get(collectionCase.loanAccountId);
        const app = loan ? appById.get(loan.applicationId) : undefined;
        if (product && app?.product !== product) return false;
        if (within(collectionCase.createdAt, fromTime, toTime) === false) return false;
        return canViewRecord(
          scope.user,
          "COLLECTION",
          collectionCase.id,
          "collections:view",
          collectionCase.branchId,
          collectionCase.assignedTo,
        );
      }),
      (collectionCase) => collectionCase.daysPastDue,
      "desc",
    );
    const rows: ReportRow[] = cases.map((collectionCase) => ({
      ref: collectionCase.ref,
      customer: customerById.get(collectionCase.customerId)?.name ?? "—",
      bucket: BUCKET_LABELS[collectionCase.bucket] ?? collectionCase.bucket,
      status: statusLabel(collectionCase.status),
      overdueAmount: collectionCase.overdueAmount,
      daysPastDue: collectionCase.daysPastDue,
      outstanding: loanById.get(collectionCase.loanAccountId)?.outstanding ?? 0,
      ptpAmount: collectionCase.ptpAmount ?? null,
      owner: userName(collectionCase.assignedTo),
      branch: branchName(collectionCase.branchId),
    }));
    return {
      ...base,
      columns: [
        { key: "ref", label: "Case ref" },
        { key: "customer", label: "Customer" },
        { key: "bucket", label: "Bucket" },
        { key: "status", label: "Status" },
        { key: "overdueAmount", label: "Overdue", format: "currency", align: "right" },
        { key: "daysPastDue", label: "DPD", format: "number", align: "right" },
        { key: "outstanding", label: "Outstanding", format: "currency", align: "right" },
        { key: "ptpAmount", label: "PTP", format: "currency", align: "right" },
        { key: "owner", label: "Assignee" },
        { key: "branch", label: "Branch" },
      ],
      rows,
      totals: {
        overdueAmount: cases.reduce((acc, collectionCase) => acc + collectionCase.overdueAmount, 0),
        outstanding: cases.reduce(
          (acc, collectionCase) => acc + (loanById.get(collectionCase.loanAccountId)?.outstanding ?? 0),
          0,
        ),
        ptpAmount: cases.reduce((acc, collectionCase) => acc + (collectionCase.ptpAmount ?? 0), 0),
      },
      kpis: [
        { label: "Collection cases", value: cases.length, format: "number", hint: definition.joinLabel },
        {
          label: "Overdue exposure",
          value: cases.reduce((acc, collectionCase) => acc + collectionCase.overdueAmount, 0),
          format: "currency",
        },
        {
          label: "Average DPD",
          value: cases.length ? cases.reduce((acc, c) => acc + c.daysPastDue, 0) / cases.length : 0,
          format: "number",
        },
        {
          label: "Resolved cases",
          value: cases.filter((collectionCase) => collectionCase.status === "RESOLVED").length,
          format: "number",
        },
      ],
      rowCount: rows.length,
    };
  }

  // Employee performance
  const staff = sortBy(
    store.users
      .filter((user) => user.status === "ACTIVE" && inBranch(user.branchId))
      .filter((user) =>
        ["BRANCH_MANAGER", "LOAN_OFFICER", "CREDIT_OFFICER", "COLLECTION_OFFICER"].includes(user.role),
      ),
    (user) => user.name,
    "asc",
  );

  const scopedBranchIds = new Set(
    store.branches.filter((branch) => inBranch(branch.id)).map((branch) => branch.id),
  );

  const leadsInRange = store.leads.filter(
    (lead) =>
      scopedBranchIds.has(lead.branchId) &&
      within(lead.createdAt, fromTime, toTime) &&
      canViewRecord(scope.user, "LEAD", lead.id, "leads:view", lead.branchId, lead.ownerId),
  );
  const appsInRange = store.applications.filter(
    (app) =>
      scopedBranchIds.has(app.branchId) &&
      within(app.createdAt, fromTime, toTime) &&
      canViewRecord(scope.user, "APPLICATION", app.id, "applications:view", app.branchId, app.ownerId),
  );
  const completedDisbursements = store.disbursements.filter(
    (disbursement) =>
      scopedBranchIds.has(disbursement.branchId) &&
      disbursement.status === "COMPLETED" &&
      within(disbursement.processedAt, fromTime, toTime) &&
      canViewRecord(
        scope.user,
        "DISBURSEMENT",
        disbursement.id,
        "disbursements:view",
        disbursement.branchId,
        appById.get(disbursement.applicationId)?.ownerId,
      ),
  );
  const collectionsByLoan = new Map(store.collectionCases.map((c) => [c.loanAccountId, c.assignedTo]));
  const collectedInRange = store.repayments.filter((repayment) => {
    if (repayment.status !== "PAID" || within(repayment.paidDate, fromTime, toTime) === false) return false;
    const loan = loanById.get(repayment.loanAccountId);
    if (!loan || !scopedBranchIds.has(loan.branchId)) return false;
    return canViewRecord(scope.user, "LOAN", loan.id, "collections:view", loan.branchId);
  });
  const tasksInRange = store.tasks.filter(
    (task) =>
      scopedBranchIds.has(task.branchId) &&
      task.status === "COMPLETED" &&
      within(task.completedAt, fromTime, toTime) &&
      canViewRecord(scope.user, "TASK", task.id, "tasks:view", task.branchId, task.assigneeId),
  );
  const decisionsInRange = store.applications.filter(
    (app) =>
      scopedBranchIds.has(app.branchId) &&
      Boolean(app.creditDecision) &&
      within(app.creditDecision?.decidedAt, fromTime, toTime) &&
      canViewRecord(scope.user, "APPLICATION", app.id, "credit:view", app.branchId, app.ownerId),
  );

  const rows: ReportRow[] = staff.map((user) => ({
    employee: user.name,
    role: ROLE_LABELS[user.role] ?? user.role,
    branch: branchName(user.branchId),
    leads: leadsInRange.filter((lead) => lead.ownerId === user.id).length,
    applications: appsInRange.filter((app) => app.ownerId === user.id).length,
    decisions: decisionsInRange.filter((app) => app.creditDecision?.decidedBy === user.id).length,
    disbursed: completedDisbursements
      .filter((disbursement) => disbursement.processedBy === user.id)
      .reduce((acc, disbursement) => acc + disbursement.amount, 0),
    collected: collectedInRange
      .filter((repayment) => collectionsByLoan.get(repayment.loanAccountId) === user.id)
      .reduce((acc, repayment) => acc + repayment.amount, 0),
    tasks: tasksInRange.filter((task) => task.assigneeId === user.id).length,
  }));

  const sortedRows = sortBy(rows, (row) => Number(row.disbursed) + Number(row.collected), "desc");

  return {
    ...base,
    columns: [
      { key: "employee", label: "Employee" },
      { key: "role", label: "Role" },
      { key: "branch", label: "Branch" },
      { key: "leads", label: "Leads", format: "number", align: "right" },
      { key: "applications", label: "Applications", format: "number", align: "right" },
      { key: "decisions", label: "Credit decisions", format: "number", align: "right" },
      { key: "disbursed", label: "Disbursed", format: "currency", align: "right" },
      { key: "collected", label: "Collected", format: "currency", align: "right" },
      { key: "tasks", label: "Tasks completed", format: "number", align: "right" },
    ],
    rows: sortedRows,
    totals: {
      leads: sortedRows.reduce((acc, row) => acc + Number(row.leads), 0),
      applications: sortedRows.reduce((acc, row) => acc + Number(row.applications), 0),
      decisions: sortedRows.reduce((acc, row) => acc + Number(row.decisions), 0),
      disbursed: sortedRows.reduce((acc, row) => acc + Number(row.disbursed), 0),
      collected: sortedRows.reduce((acc, row) => acc + Number(row.collected), 0),
      tasks: sortedRows.reduce((acc, row) => acc + Number(row.tasks), 0),
    },
    kpis: [
      { label: "Team members", value: sortedRows.length, format: "number", hint: definition.joinLabel },
      { label: "Leads sourced", value: leadsInRange.length, format: "number" },
      {
        label: "Value disbursed",
        value: completedDisbursements.reduce((acc, disbursement) => acc + disbursement.amount, 0),
        format: "currency",
      },
      {
        label: "Collections recorded",
        value: collectedInRange.reduce((acc, repayment) => acc + repayment.amount, 0),
        format: "currency",
      },
    ],
    rowCount: sortedRows.length,
  };
}

/* ------------------------------------------------------------------ */
/* Export serialisation (CSV / SpreadsheetML 2003)                     */
/* ------------------------------------------------------------------ */

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function reportToCsv(result: ReportResult): string {
  const lines: string[] = [];
  lines.push(`"${result.title} — FinCloud LMS (DEMO synthetic data)"`);
  lines.push(`"Period",${csvCell(result.range.from)},"to",${csvCell(result.range.to)}`);
  lines.push(`"Generated at",${csvCell(new Date(result.generatedAt).toISOString())},"Rows",${csvCell(result.rowCount)}`);
  lines.push("");
  lines.push(result.columns.map((column) => csvCell(column.label)).join(","));

  for (const row of result.rows) {
    lines.push(result.columns.map((column) => csvCell(row[column.key])).join(","));
  }

  if (Object.keys(result.totals).length > 0) {
    lines.push(
      result.columns
        .map((column, index) => {
          if (index === 0) return csvCell("TOTAL");
          const total = result.totals[column.key];
          return total === undefined ? "" : csvCell(total);
        })
        .join(","),
    );
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function worksheetName(title: string) {
  const cleaned = title.replace(/[\\/?*[\]:]/g, " ").trim();
  return (cleaned || "Report").slice(0, 31);
}

function isNumericColumn(column: ReportColumn) {
  return column.format === "currency" || column.format === "number" || column.format === "percent";
}

function xmlCell(value: string | number | null | undefined, column: ReportColumn, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  if (value === null || value === undefined || value === "") {
    return `<Cell${style}/>`;
  }
  if (isNumericColumn(column) && Number.isFinite(Number(value))) {
    return `<Cell${style}><Data ss:Type="Number">${Number(value)}</Data></Cell>`;
  }
  return `<Cell${style}><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
}

export function reportToSpreadsheetXml(result: ReportResult): string {
  const columnCount = result.columns.length;
  const mergeAcross = Math.max(0, columnCount - 1);
  const rowsXml: string[] = [];

  rowsXml.push(
    `<Row ss:Height="22"><Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sTitle"><Data ss:Type="String">${xmlEscape(
      `${result.title} — FinCloud LMS`,
    )}</Data></Cell></Row>`,
  );
  rowsXml.push(
    `<Row><Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sMeta"><Data ss:Type="String">${xmlEscape(
      `DEMO synthetic data · Period ${result.range.from} to ${result.range.to} · Generated ${new Date(
        result.generatedAt,
      ).toISOString()} · ${result.rowCount} rows`,
    )}</Data></Cell></Row>`,
  );
  rowsXml.push("<Row/>");
  rowsXml.push(
    `<Row ss:Height="18">${result.columns
      .map((column) => `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${xmlEscape(column.label)}</Data></Cell>`)
      .join("")}</Row>`,
  );

  for (const row of result.rows) {
    rowsXml.push(
      `<Row>${result.columns
        .map((column) => xmlCell(row[column.key], column, isNumericColumn(column) ? "sNumber" : "sText"))
        .join("")}</Row>`,
    );
  }

  if (Object.keys(result.totals).length > 0) {
    rowsXml.push(
      `<Row>${result.columns
        .map((column, index) => {
          if (index === 0) {
            return `<Cell ss:StyleID="sTotal"><Data ss:Type="String">TOTAL</Data></Cell>`;
          }
          const total = result.totals[column.key];
          if (total === undefined) return `<Cell ss:StyleID="sTotal"/>`;
          return `<Cell ss:StyleID="sTotal"><Data ss:Type="Number">${total}</Data></Cell>`;
        })
        .join("")}</Row>`,
    );
  }

  const columnsXml = result.columns
    .map((column) => `<Column ss:Width="${isNumericColumn(column) ? 110 : 150}"/>`)
    .join("");

  return [
    `<?xml version="1.0"?>`,
    `<?mso-application progid="Excel.Sheet"?>`,
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">`,
    `<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>${xmlEscape(
      result.title,
    )}</Title><Company>FinCloud LMS (DEMO)</Company></DocumentProperties>`,
    `<Styles>`,
    `<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/><Font ss:FontName="Calibri" ss:Size="10"/></Style>`,
    `<Style ss:ID="sTitle"><Font ss:Bold="1" ss:Size="14" ss:Color="#071C27"/></Style>`,
    `<Style ss:ID="sMeta"><Font ss:Italic="1" ss:Size="9" ss:Color="#5D7A88"/></Style>`,
    `<Style ss:ID="sHeader"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#117A60" ss:Pattern="Solid"/><Alignment ss:WrapText="1" ss:Vertical="Center"/></Style>`,
    `<Style ss:ID="sText"><Alignment ss:Vertical="Top"/></Style>`,
    `<Style ss:ID="sNumber"><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="#,##0.00"/></Style>`,
    `<Style ss:ID="sTotal"><Font ss:Bold="1"/><Interior ss:Color="#EEF8F3" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style>`,
    `</Styles>`,
    `<Worksheet ss:Name="${xmlEscape(worksheetName(result.title))}">`,
    `<Table>${columnsXml}${rowsXml.join("")}</Table>`,
    `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>`,
    `</Worksheet>`,
    `</Workbook>`,
  ].join("");
}
