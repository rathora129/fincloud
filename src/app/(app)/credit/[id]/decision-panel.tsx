"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, CornerUpLeft, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/modal";
import { InlineNote } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";
import { decideCredit, type CreditDecisionChoice, type RiskBand } from "@/services/credit";

const DECISION_OPTIONS: { value: CreditDecisionChoice; label: string; icon: typeof CheckCircle2; hint: string }[] = [
  { value: "APPROVE", label: "Approve", icon: CheckCircle2, hint: "Set the approved amount and risk band" },
  { value: "SEND_BACK", label: "Send back", icon: CornerUpLeft, hint: "Return to the branch with a reason" },
  { value: "REJECT", label: "Reject", icon: XCircle, hint: "Decline the application with remarks" },
];

type FormValues = {
  decision: CreditDecisionChoice;
  approvedAmount: string;
  riskBand: "" | RiskBand;
  remarks: string;
};

export function CreditDecisionPanel({
  applicationId,
  requestedAmount,
  suggestedRiskBand,
  canDecide,
}: {
  applicationId: string;
  requestedAmount: number;
  suggestedRiskBand: RiskBand | null;
  canDecide: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const schema = useMemo(
    () =>
      z
        .object({
          decision: z.enum(["APPROVE", "REJECT", "SEND_BACK"]),
          approvedAmount: z.string(),
          riskBand: z.enum(["", "LOW", "MEDIUM", "HIGH"]),
          remarks: z.string(),
        })
        .superRefine((values, ctx) => {
          const remarks = values.remarks.trim();
          if (values.decision === "APPROVE") {
            const amount = Number(values.approvedAmount.replace(/,/g, ""));
            if (!values.approvedAmount.trim()) {
              ctx.addIssue({ code: "custom", path: ["approvedAmount"], message: "Enter the approved amount." });
            } else if (!Number.isFinite(amount) || amount <= 0) {
              ctx.addIssue({ code: "custom", path: ["approvedAmount"], message: "Amount must be greater than zero." });
            } else if (amount > requestedAmount) {
              ctx.addIssue({
                code: "custom",
                path: ["approvedAmount"],
                message: `Amount cannot exceed the requested ${formatINR(requestedAmount)}.`,
              });
            }
            if (!values.riskBand) {
              ctx.addIssue({ code: "custom", path: ["riskBand"], message: "Select a risk band." });
            }
            if (remarks.length < 5) {
              ctx.addIssue({ code: "custom", path: ["remarks"], message: "Add a decision remark (min 5 characters)." });
            }
          }
          if (values.decision === "REJECT" && remarks.length < 5) {
            ctx.addIssue({ code: "custom", path: ["remarks"], message: "A rejection remark is required (min 5 characters)." });
          }
          if (values.decision === "SEND_BACK" && remarks.length < 5) {
            ctx.addIssue({ code: "custom", path: ["remarks"], message: "A send-back reason is required (min 5 characters)." });
          }
        }),
    [requestedAmount],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      decision: "APPROVE",
      approvedAmount: String(requestedAmount),
      riskBand: suggestedRiskBand ?? "",
      remarks: "",
    },
  });

  const decision = watch("decision");
  const activeOption = DECISION_OPTIONS.find((option) => option.value === decision) ?? DECISION_OPTIONS[0];

  const onSubmit = handleSubmit(() => setConfirming(true));

  const submit = async (values: FormValues) => {
    setSaving(true);
    try {
      const amount = Number(values.approvedAmount.replace(/,/g, ""));
      await decideCredit(applicationId, {
        decision: values.decision,
        approvedAmount: values.decision === "APPROVE" ? amount : undefined,
        riskBand: values.decision === "APPROVE" ? (values.riskBand as RiskBand) : undefined,
        remarks: values.remarks.trim(),
      });
      toast.success(
        values.decision === "APPROVE"
          ? "Credit approved"
          : values.decision === "REJECT"
            ? "Application rejected"
            : "Application sent back",
        values.decision === "APPROVE"
          ? `Approved amount ${formatINR(amount)} recorded in the audit trail.`
          : "The decision is recorded and the branch has been notified in the demo workflow.",
      );
      setConfirming(false);
      router.refresh();
    } catch (error) {
      toast.error("Decision not recorded", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!canDecide) {
    return (
      <div className="space-y-3">
        <InlineNote tone="warning">
          Your role does not include <span className="font-semibold">credit:decide</span>. The decision form is disabled;
          you can review the assessment and documents.
        </InlineNote>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Decision</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {DECISION_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = decision === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setValue("decision", option.value, { shouldValidate: false })}
                aria-pressed={active}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-[10px] border px-2 py-2 text-[11.5px] font-medium transition",
                  active
                    ? option.value === "APPROVE"
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : option.value === "REJECT"
                        ? "border-rose-300 bg-rose-50 text-rose-700"
                        : "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10.5px] text-ink-400">{activeOption.hint}</p>
      </div>

      {decision === "APPROVE" ? (
        <>
          <Field
            label="Approved amount (INR)"
            htmlFor="approvedAmount"
            required
            error={errors.approvedAmount?.message}
            hint={`Requested ${formatINR(requestedAmount)} · cannot exceed the requested amount`}
          >
            <Input
              id="approvedAmount"
              type="number"
              inputMode="numeric"
              min={1}
              max={requestedAmount}
              step={1000}
              {...register("approvedAmount")}
            />
          </Field>
          <Field label="Risk band" htmlFor="riskBand" required error={errors.riskBand?.message}>
            <Select id="riskBand" {...register("riskBand")}>
              <option value="">Select risk band</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </Select>
          </Field>
        </>
      ) : null}

      <Field
        label={decision === "SEND_BACK" ? "Send-back reason" : decision === "REJECT" ? "Rejection remarks" : "Decision remarks"}
        htmlFor="remarks"
        required
        error={errors.remarks?.message}
        hint={
          decision === "SEND_BACK"
            ? "Shared with the branch owner. Required for send-back."
            : "Recorded in the audit trail and visible on the application timeline."
        }
      >
        <Textarea
          id="remarks"
          rows={4}
          placeholder={
            decision === "SEND_BACK"
              ? "e.g. Updated bank statement covering the last six months is required."
              : "e.g. Income and obligations within policy; approved with covenant on EMI ratio."
          }
          {...register("remarks")}
        />
      </Field>

      <div className="flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
        <p className="text-[10.5px] leading-relaxed text-ink-400">
          Decisions cannot be reversed. A sanction offer must be raised separately.
        </p>
        <Button type="submit" size="sm" loading={saving && !confirming}>
          Record decision
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={handleSubmit(submit)}
        loading={saving}
        destructive={decision === "REJECT"}
        title={
          decision === "APPROVE"
            ? "Approve this application?"
            : decision === "REJECT"
              ? "Reject this application?"
              : "Send this application back?"
        }
        description={
          decision === "APPROVE"
            ? `An approved amount of ${formatINR(Number((watch("approvedAmount") || "0").replace(/,/g, "")))} will be recorded and the application will move to Credit Approved. This cannot be undone.`
            : decision === "REJECT"
              ? "The application will move to Credit Rejected and the branch owner will see your remarks. This cannot be undone."
              : "The application will return to the branch for corrections. The reason will be visible on the application."
        }
        confirmLabel={decision === "APPROVE" ? "Confirm approval" : decision === "REJECT" ? "Confirm rejection" : "Confirm send back"}
      />
    </form>
  );
}
