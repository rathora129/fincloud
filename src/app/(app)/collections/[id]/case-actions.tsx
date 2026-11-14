"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CalendarClock, HandCoins, MessageSquarePlus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils";
import type { CollectionStatus } from "@/lib/types";
import { collectionsService } from "@/services/collections";
import type { RepaymentMode } from "@/server/collections";

type ActionKey = "CONTACT" | "PTP" | "MOVE" | "RESOLVE" | "PAYMENT";

const MODES: RepaymentMode[] = ["NACH", "UPI", "NEFT", "CASH"];

const MOVE_LABEL: Record<"RECOVERY" | "LEGAL", string> = {
  RECOVERY: "Move to recovery",
  LEGAL: "Escalate to legal",
};

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function CollectionCaseActions({
  caseId,
  caseRef,
  status,
  canManage,
  allowedStatuses,
  overdueAmount,
  ptpAmount,
  ptpDate,
  oldestOverdue,
}: {
  caseId: string;
  caseRef: string;
  status: CollectionStatus;
  canManage: boolean;
  allowedStatuses: Array<"RECOVERY" | "LEGAL">;
  overdueAmount: number;
  ptpAmount: number | null;
  ptpDate: string | null;
  oldestOverdue: { id: string; ref: string; dueDate: string; amount: number; penalty: number } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<ActionKey | null>(null);
  const [note, setNote] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [ptpValue, setPtpValue] = useState("");
  const [ptpDue, setPtpDue] = useState("");
  const [mode, setMode] = useState<RepaymentMode>("UPI");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resolved = status === "RESOLVED";
  const disabled = !canManage || resolved;
  const minDate = todayInput();

  const openAction = (action: ActionKey) => {
    setOpen(action);
    setError(null);
    setNote("");
    setNextActionAt("");
    setPtpValue(overdueAmount > 0 ? String(Math.round(overdueAmount)) : "");
    setPtpDue(minDate);
    setMode("UPI");
  };

  const close = () => {
    if (loading) return;
    setOpen(null);
    setError(null);
  };

  const submit = async () => {
    if (!open) return;
    setError(null);
    setLoading(true);
    try {
      let message = "";
      if (open === "CONTACT") {
        if (note.trim().length < 3) {
          setError("Add a short note (at least 3 characters).");
          return;
        }
        const result = await collectionsService.logContact(caseId, {
          note: note.trim(),
          nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
        });
        message = result.message;
      } else if (open === "PTP") {
        const amount = Number(ptpValue);
        if (!Number.isFinite(amount) || amount <= 0) {
          setError("Enter a promise amount greater than zero.");
          return;
        }
        if (!ptpDue) {
          setError("Select a promise date.");
          return;
        }
        const result = await collectionsService.setPtp(caseId, {
          ptpAmount: amount,
          ptpDate: new Date(ptpDue).toISOString(),
        });
        message = result.message;
      } else if (open === "MOVE") {
        const next = allowedStatuses[0];
        if (!next) {
          setError("No further escalation is available for this case.");
          return;
        }
        const result = await collectionsService.moveStatus(caseId, next);
        message = result.message;
      } else if (open === "RESOLVE") {
        if (note.trim().length < 5) {
          setError("Add a resolution note (at least 5 characters).");
          return;
        }
        const result = await collectionsService.resolve(caseId, note.trim());
        message = result.message;
      } else {
        if (!oldestOverdue) {
          setError("No overdue instalment is available to settle.");
          return;
        }
        const result = await collectionsService.recordRepayment(oldestOverdue.id, mode);
        message = result.message;
      }
      toast.success("Case updated", message);
      setOpen(null);
      router.refresh();
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      toast.error("Action failed", message);
    } finally {
      setLoading(false);
    }
  };

  const modalTitle: Record<ActionKey, string> = {
    CONTACT: "Log contact note",
    PTP: "Record promise to pay",
    MOVE: allowedStatuses[0] ? MOVE_LABEL[allowedStatuses[0]] : "Move case",
    RESOLVE: "Resolve collection case",
    PAYMENT: "Record repayment",
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Case actions"
          description={canManage ? "All changes are audited (DEMO)." : "Read-only — collections:manage is required."}
          action={<span className="rounded-md bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-600">{caseRef}</span>}
        />
        <CardBody className="space-y-4">
          {resolved ? (
            <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[11.5px] text-brand-700">
              This case is resolved. No further collection actions are available.
            </p>
          ) : null}

          <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Promise to pay</p>
                {ptpAmount !== null && ptpDate ? (
                  <>
                    <p className="mt-1 text-[15px] font-semibold tabular text-ink-900">{formatINR(ptpAmount)}</p>
                    <p className="text-[11px] text-ink-500">Committed for {formatDate(ptpDate)}</p>
                  </>
                ) : (
                  <p className="mt-1 text-[11.5px] text-ink-500">No promise recorded for this account.</p>
                )}
              </div>
              <CalendarClock className="h-4 w-4 text-ink-400" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => openAction("PTP")}
              disabled={disabled}
            >
              {ptpAmount !== null ? "Update PTP" : "Record PTP"}
            </Button>
          </div>

          <div className="rounded-xl border border-ink-100 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">Oldest overdue instalment</p>
                {oldestOverdue ? (
                  <>
                    <p className="mt-1 text-[15px] font-semibold tabular text-ink-900">
                      {formatINR(oldestOverdue.amount)}
                    </p>
                    <p className="text-[11px] text-ink-500">
                      {oldestOverdue.ref} · due {formatDate(oldestOverdue.dueDate)}
                      {oldestOverdue.penalty > 0 ? ` · penalty ${formatINR(oldestOverdue.penalty)}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[11.5px] text-ink-500">No overdue instalments on this schedule.</p>
                )}
              </div>
              <HandCoins className="h-4 w-4 text-ink-400" />
            </div>
            <Button
              variant="primary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => openAction("PAYMENT")}
              disabled={disabled || !oldestOverdue}
            >
              Record repayment
            </Button>
          </div>

          <div className="grid gap-2">
            <Button variant="outline" className="justify-start" onClick={() => openAction("CONTACT")} disabled={disabled}>
              <MessageSquarePlus className="h-4 w-4" /> Log contact note
            </Button>
            {allowedStatuses[0] ? (
              <Button variant="soft" className="justify-start" onClick={() => openAction("MOVE")} disabled={disabled}>
                <ShieldAlert className="h-4 w-4" /> {MOVE_LABEL[allowedStatuses[0]]}
              </Button>
            ) : null}
            <Button variant="outline" className="justify-start" onClick={() => openAction("RESOLVE")} disabled={disabled}>
              <BadgeCheck className="h-4 w-4" /> Resolve case
            </Button>
          </div>

          <p className="text-[10px] leading-relaxed text-ink-400">
            Repayments mark the synthetic schedule as settled in DEMO mode. No real money movement or customer contact
            occurs.
          </p>
        </CardBody>
      </Card>

      <Modal
        open={open !== null}
        onClose={close}
        title={open ? modalTitle[open] : ""}
        description={open ? `${caseRef} · changes are recorded in the audit trail` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              loading={loading}
              variant={open === "RESOLVE" ? "secondary" : "primary"}
            >
              Confirm
            </Button>
          </>
        }
      >
        {open === "CONTACT" ? (
          <div className="space-y-3">
            <Field label="Contact note" htmlFor="contact-note" required>
              <Textarea
                id="contact-note"
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Call outcome, field visit update or customer commitment…"
              />
            </Field>
            <Field label="Next action date" htmlFor="next-action" hint="Defaults to two days from today when left blank.">
              <Input
                id="next-action"
                type="date"
                min={minDate}
                value={nextActionAt}
                onChange={(event) => setNextActionAt(event.target.value)}
              />
            </Field>
          </div>
        ) : null}

        {open === "PTP" ? (
          <div className="space-y-3">
            <Field label="Promise amount (INR)" htmlFor="ptp-amount" required>
              <Input
                id="ptp-amount"
                type="number"
                min={1}
                inputMode="numeric"
                value={ptpValue}
                onChange={(event) => setPtpValue(event.target.value)}
              />
            </Field>
            <Field label="Promise date" htmlFor="ptp-date" required>
              <Input
                id="ptp-date"
                type="date"
                min={minDate}
                value={ptpDue}
                onChange={(event) => setPtpDue(event.target.value)}
              />
            </Field>
            <p className="text-[11px] text-ink-500">
              The promise amount must be greater than zero and the date cannot be in the past. The case next action date
              is aligned to this promise.
            </p>
          </div>
        ) : null}

        {open === "MOVE" ? (
          <p className="text-sm leading-relaxed text-ink-600">
            {status === "PENDING"
              ? "Move this case from pending to the recovery workflow. Recovery cases are prioritised for field follow-up."
              : "Escalate this recovery case to the legal workflow. Legal cases are tracked separately and require supporting documentation."}
          </p>
        ) : null}

        {open === "RESOLVE" ? (
          <div className="space-y-3">
            <Field label="Resolution note" htmlFor="resolve-note" required>
              <Textarea
                id="resolve-note"
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Customer settled all overdue instalments via UPI."
              />
            </Field>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              Resolving closes the collection workflow. The repayment schedule and loan outstanding remain unchanged
              unless a repayment is recorded.
            </p>
          </div>
        ) : null}

        {open === "PAYMENT" && oldestOverdue ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-[11.5px]">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.06em] text-ink-400">Instalment</dt>
                <dd className="font-medium text-ink-800">{oldestOverdue.ref}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.06em] text-ink-400">Due date</dt>
                <dd className="font-medium text-ink-800">{formatDate(oldestOverdue.dueDate)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.06em] text-ink-400">EMI amount</dt>
                <dd className="tabular font-medium text-ink-800">{formatINR(oldestOverdue.amount)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.06em] text-ink-400">Penalty retained</dt>
                <dd className="tabular font-medium text-ink-800">{formatINR(oldestOverdue.penalty)}</dd>
              </div>
            </dl>
            <Field label="Payment mode" htmlFor="payment-mode" required>
              <Select id="payment-mode" value={mode} onChange={(event) => setMode(event.target.value as RepaymentMode)}>
                {MODES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-[11px] leading-relaxed text-ink-500">
              A DEMO receipt number is generated, the outstanding principal reduces by the principal component and the
              loan status is recomputed. No real payment is collected.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{error}</p>
        ) : null}
      </Modal>
    </>
  );
}
