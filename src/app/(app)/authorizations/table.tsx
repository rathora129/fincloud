"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, ChevronRight, X } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { AUTH_TYPE_LABELS, humanize } from "@/lib/labels";
import { formatDate, formatDateTime, formatINR } from "@/lib/utils";
import type { AuthorizationType } from "@/lib/types";
import { authorizationsService } from "@/services/authorizations";
import type { AuthorizationRow } from "@/server/authorizations";

const TYPE_TONE: Record<AuthorizationType, string> = {
  PAYMENT: "bg-brand-50 text-brand-700 ring-brand-200",
  LMS_ACCOUNT: "bg-sky-50 text-sky-700 ring-sky-200",
  AGENCY: "bg-violet-50 text-violet-700 ring-violet-200",
};

function shortBranch(name: string) {
  return name.split("—")[0].trim();
}

export function AuthorizationsTable({
  rows,
  canApprove,
}: {
  rows: AuthorizationRow[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<AuthorizationRow | null>(null);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const columns: ColumnDef<AuthorizationRow, unknown>[] = [
    {
      accessorKey: "ref",
      header: "Reference",
      cell: ({ row }) => (
        <span className="font-mono text-[11px] font-semibold text-brand-700">{row.original.ref}</span>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <span
          className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${TYPE_TONE[row.original.type]}`}
        >
          {AUTH_TYPE_LABELS[row.original.type]}
        </span>
      ),
    },
    {
      accessorKey: "title",
      header: "Request",
      cell: ({ row }) => (
        <div className="max-w-[18rem]">
          <p className="truncate text-[12.5px] font-medium text-ink-900">{row.original.title}</p>
          <p className="mt-0.5 truncate text-[10.5px] text-ink-400">{row.original.entityName}</p>
        </div>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) =>
        row.original.amount !== null ? (
          <span className="tabular text-[12px] font-medium text-ink-900">{formatINR(row.original.amount)}</span>
        ) : (
          <span className="text-[11px] text-ink-400">—</span>
        ),
    },
    {
      id: "requestedBy",
      accessorFn: (row) => row.requestedByName,
      header: "Requested by",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.original.requestedByName} color={row.original.requestedByColor} size="xs" />
          <span className="text-[11.5px] text-ink-700">{row.original.requestedByName}</span>
        </div>
      ),
    },
    {
      id: "branch",
      accessorFn: (row) => row.branchName,
      header: "Branch",
      cell: ({ row }) => <span className="text-[11.5px] text-ink-600">{shortBranch(row.original.branchName)}</span>,
    },
    {
      accessorKey: "requestedAt",
      header: "Requested",
      cell: ({ row }) => <span className="text-[11.5px] text-ink-600">{formatDate(row.original.requestedAt)}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "action",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10.5px]"
          onClick={(event) => {
            event.stopPropagation();
            setSelected(row.original);
          }}
        >
          {row.original.status === "PENDING" && canApprove ? "Review" : "View"}
          <ChevronRight className="h-3 w-3" />
        </Button>
      ),
    },
  ];

  const openDecision = (action: "APPROVE" | "REJECT") => {
    setDecision(action);
    setRemarks("");
    setError(null);
  };

  const submitDecision = async () => {
    if (!selected || !decision) return;
    setError(null);
    if (decision === "REJECT" && remarks.trim().length < 5) {
      setError("Add a rejection remark (at least 5 characters).");
      return;
    }
    setLoading(true);
    try {
      const result = await authorizationsService.decide(selected.id, {
        action: decision,
        remarks: remarks.trim() || undefined,
      });
      toast.success(decision === "APPROVE" ? "Request approved" : "Request rejected", result.message);
      setDecision(null);
      setSelected(null);
      router.refresh();
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      toast.error("Decision failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search reference, title, entity or requester…"
        getSearchText={(row) =>
          [row.ref, row.title, row.entityName, row.requestedByName, AUTH_TYPE_LABELS[row.type], row.status].join(" ")
        }
        onRowClick={(row) => setSelected(row)}
        rowClassName={(row) => (row.status === "REJECTED" ? "opacity-75" : undefined)}
        emptyTitle="No authorization requests in this view"
        emptyDescription="Try another tab or clear the filters. Pending requests appear here for checker action."
        footer={<span>DEMO approvals · no funds released</span>}
      />

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Authorization request"}
        description={selected ? `${selected.ref} · ${AUTH_TYPE_LABELS[selected.type]}` : undefined}
        width="max-w-lg"
        footer={
          selected && selected.status === "PENDING" && canApprove ? (
            <>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
              <Button variant="danger" onClick={() => openDecision("REJECT")}>
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
              <Button onClick={() => openDecision("APPROVE")}>
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setSelected(null)}>
              Close
            </Button>
          )
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${TYPE_TONE[selected.type]}`}
              >
                {AUTH_TYPE_LABELS[selected.type]}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
                <dt className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">Entity</dt>
                <dd className="mt-0.5 text-[12px] font-medium text-ink-800">{selected.entityName}</dd>
              </div>
              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
                <dt className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">Amount</dt>
                <dd className="mt-0.5 text-[12px] font-medium tabular text-ink-800">
                  {selected.amount !== null ? formatINR(selected.amount) : "Not applicable"}
                </dd>
              </div>
              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
                <dt className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">Requested by</dt>
                <dd className="mt-1 flex items-center gap-2 text-[12px] font-medium text-ink-800">
                  <Avatar name={selected.requestedByName} color={selected.requestedByColor} size="xs" />
                  {selected.requestedByName}
                </dd>
              </div>
              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
                <dt className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">Branch</dt>
                <dd className="mt-0.5 text-[12px] font-medium text-ink-800">{selected.branchName}</dd>
              </div>
              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
                <dt className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">Requested at</dt>
                <dd className="mt-0.5 text-[12px] font-medium text-ink-800">{formatDateTime(selected.requestedAt)}</dd>
              </div>
              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
                <dt className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-400">Decided</dt>
                <dd className="mt-0.5 text-[12px] font-medium text-ink-800">
                  {selected.decidedAt ? formatDateTime(selected.decidedAt) : "Awaiting checker"}
                </dd>
              </div>
            </dl>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Checker remarks</p>
              <p className="mt-1 rounded-lg border border-ink-100 bg-white px-3 py-2 text-[12px] leading-relaxed text-ink-700">
                {selected.remarks}
              </p>
              {selected.decidedByName ? (
                <p className="mt-1 text-[10.5px] text-ink-400">Decided by {selected.decidedByName}</p>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Activity</p>
              <div className="space-y-2.5">
                {selected.activities.length === 0 ? (
                  <p className="text-[11px] text-ink-400">No activity recorded yet.</p>
                ) : (
                  [...selected.activities]
                    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                    .map((activity) => (
                      <div key={activity.id} className="flex gap-2.5">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="text-[11.5px] font-medium text-ink-800">{humanize(activity.type)}</p>
                          <p className="text-[11px] leading-snug text-ink-600">{activity.summary}</p>
                          <p className="text-[10px] text-ink-400">{formatDateTime(activity.at)}</p>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {selected.status === "PENDING" && !canApprove ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                You can view this request but authorizations:approve is required to decide it.
              </p>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={decision !== null}
        onClose={() => {
          if (!loading) setDecision(null);
        }}
        title={decision === "APPROVE" ? "Approve request" : "Reject request"}
        description={selected ? `${selected.ref} · ${selected.title}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant={decision === "REJECT" ? "danger" : "primary"}
              onClick={submitDecision}
              loading={loading}
            >
              {decision === "APPROVE" ? "Approve request" : "Reject request"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-600">
            {decision === "APPROVE"
              ? "Approving marks this request as authorized in DEMO mode. No payment, account change or agency empanelment occurs."
              : "Rejection requires a remark that will be shared with the requester and stored in the audit trail."}
          </p>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-ink-800">
              Remarks {decision === "REJECT" ? <span className="text-rose-600">*</span> : "(optional)"}
            </span>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              maxLength={500}
              rows={3}
              className="w-full rounded-[10px] border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              placeholder={decision === "REJECT" ? "Reason for rejection…" : "Approval note for the audit trail…"}
            />
          </label>
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{error}</p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
