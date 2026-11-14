"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, CheckCircle2, Circle, Lock, Send, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { InlineNote } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";
import type { DisbursementStatus } from "@/lib/types";
import { applyDisbursementAction, type DisbursementAction } from "@/services/disbursements";

const WORKFLOW: { status: DisbursementStatus; label: string }[] = [
  { status: "NEW", label: "Requested" },
  { status: "IN_PROCESS", label: "In process" },
  { status: "RECOMMENDED", label: "Recommended" },
  { status: "PENDING", label: "Pending authorization" },
  { status: "COMPLETED", label: "Completed (DEMO)" },
];

const rejectSchema = z.object({
  remarks: z.string().trim().min(4, "A rejection remark is required (min 4 characters).").max(600, "Keep remarks under 600 characters."),
});

type RejectValues = z.infer<typeof rejectSchema>;

export function DisbursementActions({
  disbursementId,
  disbursementRef,
  status,
  amount,
  canProcess,
  canApprove,
}: {
  disbursementId: string;
  disbursementRef: string;
  status: DisbursementStatus;
  amount: number;
  canProcess: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RejectValues>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { remarks: "" },
  });

  const stepIndex = WORKFLOW.findIndex((step) => step.status === status);
  const isTerminal = status === "COMPLETED" || status === "REJECTED";

  const run = async (action: DisbursementAction, remarks?: string) => {
    setSaving(true);
    try {
      const result = await applyDisbursementAction(disbursementId, { action, remarks });
      toast.success(
        action === "PROCESS"
          ? "Processing started"
          : action === "RECOMMEND"
            ? "Recommended for authorization"
            : action === "AUTHORIZE"
              ? "Sent for authorization"
              : action === "COMPLETE"
                ? "Marked completed (DEMO)"
                : "Disbursement rejected",
        action === "COMPLETE"
          ? `Loan account ${result.loanAccountRef ?? "created"} and ${result.scheduleCount} EMI entries generated. No real bank transfer occurred.`
          : action === "REJECT"
            ? "The rejection is recorded in the audit trail."
            : "The next step is enabled for the assigned approver.",
      );
      setConfirmComplete(false);
      setRejectOpen(false);
      reset();
      router.refresh();
    } catch (error) {
      toast.error("Action not completed", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const primaryAction: { action: DisbursementAction; label: string; allowed: boolean; hint: string } | null =
    status === "NEW"
      ? { action: "PROCESS", label: "Start processing", allowed: canProcess, hint: "Requires disbursements:process" }
      : status === "IN_PROCESS"
        ? { action: "RECOMMEND", label: "Recommend", allowed: canProcess, hint: "Requires disbursements:process" }
        : status === "RECOMMENDED"
          ? {
              action: "AUTHORIZE",
              label: "Send for authorization",
              allowed: canProcess,
              hint: "Requires disbursements:process",
            }
          : status === "PENDING"
            ? {
                action: "COMPLETE",
                label: "Mark completed (DEMO)",
                allowed: canApprove,
                hint: "Requires disbursements:approve",
              }
            : null;

  return (
    <div className="space-y-4">
      <ol className="space-y-2.5">
        {WORKFLOW.map((step, index) => {
          const done = stepIndex > index || status === "COMPLETED";
          const current = stepIndex === index && status !== "COMPLETED";
          return (
            <li key={step.status} className="flex items-center gap-2.5">
              {done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />
              ) : current ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                </span>
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-ink-300" />
              )}
              <span
                className={cn(
                  "text-[12px]",
                  current ? "font-semibold text-ink-900" : done ? "text-ink-700" : "text-ink-400",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {status === "REJECTED" ? (
        <InlineNote tone="warning">This disbursement was rejected. No further processing is possible.</InlineNote>
      ) : null}

      <div className="space-y-2 border-t border-ink-100 pt-3">
        {!isTerminal || status === "REJECTED" ? null : (
          <InlineNote>This disbursement is completed and locked. The loan account is now in servicing.</InlineNote>
        )}

        {primaryAction ? (
          <Button
            type="button"
            className="w-full"
            disabled={!primaryAction.allowed || saving}
            onClick={() =>
              primaryAction.action === "COMPLETE" ? setConfirmComplete(true) : run(primaryAction.action)
            }
          >
            <Send className="h-4 w-4" />
            {primaryAction.label}
          </Button>
        ) : null}

        {!isTerminal ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            disabled={!canApprove || saving}
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="h-4 w-4" /> Reject disbursement
          </Button>
        ) : null}

        {primaryAction && !primaryAction.allowed ? (
          <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-amber-700">
            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
            {primaryAction.hint}. This step is disabled for your role.
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-400">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            Every step is audit-logged. Completing a payout is irreversible and cannot be executed twice.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        onConfirm={() => run("COMPLETE")}
        loading={saving}
        title="Mark this disbursement completed?"
        description={`${disbursementRef} for ${formatINR(amount)} will be marked completed in DEMO mode. A synthetic loan account with EMI schedule will be created and the application will move to Disbursed. No real bank transfer is executed. This cannot be undone.`}
        confirmLabel="Complete (DEMO)"
      />

      <Modal
        open={rejectOpen}
        onClose={() => {
          setRejectOpen(false);
          reset();
        }}
        title="Reject disbursement"
        description={`Record why ${disbursementRef} cannot be processed. The remark is visible to the branch and audit.`}
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                setRejectOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" loading={saving} onClick={handleSubmit((values) => run("REJECT", values.remarks))}>
              Confirm rejection
            </Button>
          </>
        }
      >
        <Field label="Rejection remarks" htmlFor="disbursement-remarks" required error={errors.remarks?.message}>
          <Textarea
            id="disbursement-remarks"
            rows={4}
            placeholder="e.g. Customer bank account validation failed; cancelled cheque required."
            {...register("remarks")}
          />
        </Field>
      </Modal>

      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em] text-ink-300">
        <ArrowRight className="h-3 w-3" /> Next step follows the maker-checker flow
      </p>
    </div>
  );
}
