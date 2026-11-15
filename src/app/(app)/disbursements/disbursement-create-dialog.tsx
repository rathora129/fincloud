"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { DisbursementEligibleSanction } from "@/server/disbursements";
import { createDisbursement } from "@/services/disbursements";

const formSchema = z.object({
  sanctionId: z.string().min(1, "Select an approved sanction."),
  amount: z
    .number({ error: "Enter the disbursement amount." })
    .positive("Amount must be greater than zero.")
    .max(100_000_000, "Amount looks too high."),
  mode: z.enum(["NEFT", "IMPS", "UPI"]),
  remarks: z.string().trim().max(600, "Keep remarks under 600 characters.").optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function DisbursementCreateDialog({ sanctions }: { sanctions: DisbursementEligibleSanction[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { sanctionId: "", amount: 0, mode: "NEFT", remarks: "" },
  });

  const selectedId = watch("sanctionId");
  const selected = sanctions.find((sanction) => sanction.id === selectedId) ?? null;

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = handleSubmit(async (values) => {
    if (!selected) {
      setError("sanctionId", { message: "Select an approved sanction." });
      return;
    }
    if (values.amount > selected.approvedAmount) {
      setError("amount", { message: `Cannot exceed the sanctioned ${formatINR(selected.approvedAmount)}.` });
      return;
    }
    setSubmitting(true);
    try {
      const created = await createDisbursement({
        sanctionId: values.sanctionId,
        amount: values.amount,
        mode: values.mode,
        remarks: values.remarks?.trim() || undefined,
      });
      toast.success(
        "Disbursement request raised",
        `${created.ref} is in the New queue for ${formatINR(created.amount)}. No bank transfer is executed in DEMO.`,
      );
      close();
      router.refresh();
    } catch (error) {
      toast.error("Could not raise disbursement", errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={sanctions.length === 0}>
        <Send className="h-4 w-4" /> New disbursement
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Raise a disbursement request"
        description="Disbursements are raised from approved sanctions and move through maker-checker steps. DEMO mode never contacts a bank."
        size="lg"
        footer={
          <>
            <Button variant="outline" type="button" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="new-disbursement-form" loading={submitting}>
              Raise request
            </Button>
          </>
        }
      >
        <form id="new-disbursement-form" onSubmit={submit} className="space-y-5" noValidate>
          <Field
            label="Approved sanction"
            htmlFor="disbursement-sanction"
            required
            error={errors.sanctionId?.message}
            hint={
              sanctions.length === 0
                ? "No approved sanctions are awaiting a disbursement request right now."
                : `${sanctions.length} approved sanction${sanctions.length === 1 ? "" : "s"} in your scope.`
            }
          >
            <Select
              id="disbursement-sanction"
              {...register("sanctionId", {
                onChange: (event) => {
                  const sanction = sanctions.find((item) => item.id === event.target.value);
                  if (!sanction) return;
                  setValue("amount", sanction.approvedAmount);
                  setValue("mode", sanction.disbursementMode);
                },
              })}
            >
              <option value="">Select an approved sanction</option>
              {sanctions.map((sanction) => (
                <option key={sanction.id} value={sanction.id}>
                  {sanction.ref} · {sanction.customerName} · {formatINR(sanction.approvedAmount)}
                </option>
              ))}
            </Select>
          </Field>

          {selected ? (
            <div className="grid gap-2 rounded-xl bg-ink-50 p-3 text-[11.5px] text-ink-600 sm:grid-cols-2">
              <p>
                <span className="text-ink-400">Customer:</span> {selected.customerName} · {selected.customerCity}
              </p>
              <p>
                <span className="text-ink-400">Branch:</span> {selected.branchName}
              </p>
              <p>
                <span className="text-ink-400">Application:</span> {selected.applicationRef}
              </p>
              <p>
                <span className="text-ink-400">Terms:</span> {selected.interestRate}% · {selected.tenureMonths}m
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 border-t border-ink-100 pt-4 sm:grid-cols-2">
            <Field
              label="Disbursement amount (₹)"
              htmlFor="disbursement-amount"
              required
              error={errors.amount?.message}
              hint={selected ? `Cannot exceed ${formatINR(selected.approvedAmount)}` : "Choose a sanction first"}
            >
              <Input
                id="disbursement-amount"
                type="number"
                step={1000}
                min={1}
                max={selected?.approvedAmount}
                {...register("amount", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Mode" htmlFor="disbursement-mode" error={errors.mode?.message}>
              <Select id="disbursement-mode" {...register("mode")}>
                <option value="NEFT">NEFT</option>
                <option value="IMPS">IMPS</option>
                <option value="UPI">UPI</option>
              </Select>
            </Field>
            <Field
              label="Remarks"
              htmlFor="disbursement-remarks"
              error={errors.remarks?.message}
              hint="Visible on the disbursement timeline and audit"
              className="sm:col-span-2"
            >
              <Textarea
                id="disbursement-remarks"
                rows={3}
                placeholder="e.g. Customer bank account verified; payout to be executed subject to authorization."
                {...register("remarks")}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
