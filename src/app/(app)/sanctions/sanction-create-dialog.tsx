"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { PRODUCT_LABELS } from "@/lib/labels";
import { formatINR } from "@/lib/utils";
import type { SanctionEligibleApplication } from "@/server/sanctions";
import { createSanction } from "@/services/sanctions";

const formSchema = z.object({
  applicationId: z.string().min(1, "Select a credit-approved application."),
  approvedAmount: z
    .number({ error: "Enter the sanction amount." })
    .positive("Sanction amount must be greater than zero.")
    .max(100_000_000, "Amount looks too high."),
  interestRate: z.number({ error: "Enter the interest rate." }).min(0.5, "Minimum 0.5%.").max(48, "Maximum 48%."),
  tenureMonths: z
    .number({ error: "Enter the tenure." })
    .int("Whole months only.")
    .min(1, "Minimum 1 month.")
    .max(360, "Maximum 360 months."),
  processingFee: z.number({ error: "Enter the processing fee." }).min(0, "Cannot be negative.").max(1_000_000),
  disbursementMode: z.enum(["NEFT", "IMPS", "UPI"]),
  remarks: z.string().trim().max(600, "Keep remarks under 600 characters.").optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function SanctionCreateDialog({ applications }: { applications: SanctionEligibleApplication[] }) {
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
    defaultValues: {
      applicationId: "",
      approvedAmount: 0,
      interestRate: 0,
      tenureMonths: 12,
      processingFee: 0,
      disbursementMode: "NEFT",
      remarks: "",
    },
  });

  const selectedId = watch("applicationId");
  const selected = applications.find((application) => application.id === selectedId) ?? null;

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = handleSubmit(async (values) => {
    if (!selected) {
      setError("applicationId", { message: "Select a credit-approved application." });
      return;
    }
    if (values.approvedAmount > selected.creditApprovedAmount) {
      setError("approvedAmount", {
        message: `Cannot exceed the credit-approved ${formatINR(selected.creditApprovedAmount)}.`,
      });
      return;
    }
    setSubmitting(true);
    try {
      const created = await createSanction({
        applicationId: values.applicationId,
        approvedAmount: values.approvedAmount,
        interestRate: values.interestRate,
        tenureMonths: values.tenureMonths,
        processingFee: values.processingFee,
        disbursementMode: values.disbursementMode,
        remarks: values.remarks?.trim() || undefined,
      });
      toast.success(
        "Sanction offer raised",
        `${created.ref} is now pending customer acceptance for ${formatINR(created.approvedAmount)}.`,
      );
      close();
      router.refresh();
    } catch (error) {
      toast.error("Could not raise sanction", errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={applications.length === 0}>
        <FilePlus2 className="h-4 w-4" /> Raise sanction
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Raise a sanction offer"
        description="Sanctions are raised from credit-approved applications. Only synthetic DEMO terms are recorded; no money moves at this stage."
        size="lg"
        footer={
          <>
            <Button variant="outline" type="button" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="new-sanction-form" loading={submitting}>
              Raise sanction
            </Button>
          </>
        }
      >
        <form id="new-sanction-form" onSubmit={submit} className="space-y-5" noValidate>
          <Field
            label="Credit-approved application"
            htmlFor="sanction-application"
            required
            error={errors.applicationId?.message}
            hint={
              applications.length === 0
                ? "No credit-approved applications are awaiting a sanction right now."
                : `${applications.length} eligible application${applications.length === 1 ? "" : "s"} in your scope.`
            }
          >
            <Select
              id="sanction-application"
              {...register("applicationId", {
                onChange: (event) => {
                  const application = applications.find((item) => item.id === event.target.value);
                  if (!application) return;
                  setValue("approvedAmount", application.creditApprovedAmount);
                  setValue("interestRate", application.interestRate);
                  setValue("tenureMonths", application.tenureMonths);
                  setValue("processingFee", application.suggestedProcessingFee);
                },
              })}
            >
              <option value="">Select an application</option>
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.ref} · {application.customerName} · {formatINR(application.creditApprovedAmount)}
                </option>
              ))}
            </Select>
          </Field>

          {selected ? (
            <div className="grid gap-2 rounded-xl bg-ink-50 p-3 text-[11.5px] text-ink-600 sm:grid-cols-2">
              <p>
                <span className="text-ink-400">Customer:</span> {selected.customerName}
              </p>
              <p>
                <span className="text-ink-400">Branch:</span> {selected.branchName}
              </p>
              <p>
                <span className="text-ink-400">Product:</span>{" "}
                {PRODUCT_LABELS[selected.product] ?? selected.product} · {selected.riskBand ?? "—"} risk
              </p>
              <p>
                <span className="text-ink-400">Credit approved:</span> {formatINR(selected.creditApprovedAmount)} of{" "}
                {formatINR(selected.requestedAmount)} requested
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 border-t border-ink-100 pt-4 sm:grid-cols-2">
            <Field
              label="Sanction amount (₹)"
              htmlFor="sanction-amount"
              required
              error={errors.approvedAmount?.message}
              hint={selected ? `Cannot exceed ${formatINR(selected.creditApprovedAmount)}` : "Choose an application first"}
            >
              <Input
                id="sanction-amount"
                type="number"
                step={1000}
                min={1}
                max={selected?.creditApprovedAmount}
                {...register("approvedAmount", { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Interest rate (% p.a.)"
              htmlFor="sanction-rate"
              required
              error={errors.interestRate?.message}
            >
              <Input id="sanction-rate" type="number" step={0.25} {...register("interestRate", { valueAsNumber: true })} />
            </Field>
            <Field label="Tenure (months)" htmlFor="sanction-tenure" required error={errors.tenureMonths?.message}>
              <Input
                id="sanction-tenure"
                type="number"
                step={1}
                {...register("tenureMonths", { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Processing fee (₹)"
              htmlFor="sanction-fee"
              required
              error={errors.processingFee?.message}
              hint="Indicative fee recorded on the offer"
            >
              <Input
                id="sanction-fee"
                type="number"
                step={100}
                {...register("processingFee", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Disbursement mode" htmlFor="sanction-mode" error={errors.disbursementMode?.message}>
              <Select id="sanction-mode" {...register("disbursementMode")}>
                <option value="NEFT">NEFT</option>
                <option value="IMPS">IMPS</option>
                <option value="UPI">UPI</option>
              </Select>
            </Field>
            <Field
              label="Remarks"
              htmlFor="sanction-remarks"
              error={errors.remarks?.message}
              hint="Visible on the sanction timeline and audit"
              className="sm:col-span-2"
            >
              <Textarea
                id="sanction-remarks"
                rows={3}
                placeholder="e.g. Offer issued per approved credit terms; validity 7 days."
                {...register("remarks")}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
