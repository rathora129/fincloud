"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BadgeCheck, CheckCircle2, Lock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { InlineNote } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { SanctionStatus } from "@/lib/types";
import { applySanctionAction, type SanctionAction } from "@/services/sanctions";

const rejectSchema = z.object({
  remarks: z.string().trim().min(4, "A rejection remark is required (min 4 characters).").max(600, "Keep remarks under 600 characters."),
});

type RejectValues = z.infer<typeof rejectSchema>;

export function SanctionActions({
  sanctionId,
  sanctionRef,
  status,
  approvedAmount,
  canDecide,
}: {
  sanctionId: string;
  sanctionRef: string;
  status: SanctionStatus;
  approvedAmount: number;
  canDecide: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendingAction, setPendingAction] = useState<SanctionAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RejectValues>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { remarks: "" },
  });

  const canAccept = status === "PENDING_ACCEPTANCE";
  const canApprove = status === "PENDING_ACCEPTANCE" || status === "PROCESSING";
  const canReject = status === "PENDING_ACCEPTANCE" || status === "PROCESSING";

  const run = async (action: SanctionAction, remarks?: string) => {
    setSaving(true);
    try {
      await applySanctionAction(sanctionId, { action, remarks });
      toast.success(
        action === "ACCEPT"
          ? "Customer acceptance recorded"
          : action === "APPROVE"
            ? "Sanction approved"
            : "Sanction rejected",
        action === "ACCEPT"
          ? "The sanction moved to Processing. No e-signature integration is connected in this DEMO."
          : action === "APPROVE"
            ? "The linked application is now marked Sanctioned. Disbursement can be initiated from the disbursements queue."
            : "The rejection is recorded in the audit trail with your remarks.",
      );
      setPendingAction(null);
      setRejectOpen(false);
      reset();
      router.refresh();
    } catch (error) {
      toast.error("Action not completed", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (status === "APPROVED" || status === "REJECTED") {
    return (
      <InlineNote>
        {status === "APPROVED"
          ? "This sanction is approved and locked. Disbursement is handled from the disbursements module."
          : "This sanction is rejected. No further action is possible from this screen."}
      </InlineNote>
    );
  }

  return (
    <div className="space-y-3">
      {!canDecide ? (
        <InlineNote tone="warning">
          Your role does not include <span className="font-semibold">sanctions:decide</span>. Actions are disabled and
          server-side authorization still applies.
        </InlineNote>
      ) : null}

      <div className="space-y-2">
        {canAccept ? (
          <Button
            type="button"
            className="w-full"
            disabled={!canDecide || saving}
            onClick={() => setPendingAction("ACCEPT")}
          >
            <CheckCircle2 className="h-4 w-4" /> Record customer acceptance
          </Button>
        ) : null}
        {canApprove ? (
          <Button
            type="button"
            variant={canAccept ? "outline" : "primary"}
            className="w-full"
            disabled={!canDecide || saving}
            onClick={() => setPendingAction("APPROVE")}
          >
            <BadgeCheck className="h-4 w-4" /> Approve sanction
          </Button>
        ) : null}
        {canReject ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            disabled={!canDecide || saving}
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="h-4 w-4" /> Reject sanction
          </Button>
        ) : null}
      </div>

      <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-400">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
        Actions are audit-logged with your user, timestamp and branch. Approval marks the linked application as
        Sanctioned; no money moves at this stage.
      </p>

      <ConfirmDialog
        open={pendingAction === "ACCEPT"}
        onClose={() => setPendingAction(null)}
        onConfirm={() => run("ACCEPT")}
        loading={saving}
        title="Record customer acceptance?"
        description={`Confirm that the customer accepted the sanction terms for ${formatINR(approvedAmount)}. The sanction will move to Processing. This action is audit-logged.`}
        confirmLabel="Confirm acceptance"
      />

      <ConfirmDialog
        open={pendingAction === "APPROVE"}
        onClose={() => setPendingAction(null)}
        onConfirm={() => run("APPROVE")}
        loading={saving}
        title="Approve this sanction?"
        description={`Approving ${sanctionRef} for ${formatINR(approvedAmount)} will mark the linked application as Sanctioned and unlock disbursement. This cannot be undone.`}
        confirmLabel="Confirm approval"
      />

      <Modal
        open={rejectOpen}
        onClose={() => {
          setRejectOpen(false);
          reset();
        }}
        title="Reject sanction"
        description={`Record why ${sanctionRef} cannot be sanctioned. The remark is visible to the branch and audit.`}
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setRejectOpen(false);
                reset();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={saving}
              onClick={handleSubmit((values) => run("REJECT", values.remarks))}
            >
              Confirm rejection
            </Button>
          </>
        }
      >
        <Field label="Rejection remarks" htmlFor="sanction-remarks" required error={errors.remarks?.message}>
          <Textarea
            id="sanction-remarks"
            rows={4}
            placeholder="e.g. Customer did not accept the offered terms within validity; documentation gap remains."
            {...register("remarks")}
          />
        </Field>
      </Modal>
    </div>
  );
}
