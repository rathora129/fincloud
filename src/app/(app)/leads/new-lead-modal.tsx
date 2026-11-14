"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createLeadRequest } from "@/services/leads";
import { errorMessage } from "@/lib/api";
import { LEAD_SOURCES, LEAD_TYPES, leadCreateSchema } from "@/lib/validation/leads";
import { LEAD_TYPE_LABELS, SOURCE_LABELS } from "@/lib/labels";

type FormValues = z.infer<typeof leadCreateSchema>;

export function NewLeadModal({
  canManage,
  canAssign,
  owners,
  branches,
  currentUserId,
}: {
  canManage: boolean;
  canAssign: boolean;
  owners: { id: string; name: string; branchId: string; color: string }[];
  branches: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const defaultBranch = owners.find((owner) => owner.id === currentUserId)?.branchId ?? branches[0]?.id ?? "";
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(leadCreateSchema),
    defaultValues: {
      customerName: "",
      phone: "",
      email: "",
      city: "",
      source: "WEBSITE",
      type: "NEW",
      monthlyIncome: 45000,
      loanPurpose: "",
      notes: "",
      nextFollowUpAt: "",
      ownerId: "",
      branchId: defaultBranch,
    },
  });

  if (!canManage) return null;

  const branchId = watch("branchId");
  const branchOwners = branchId ? owners.filter((owner) => owner.branchId === branchId) : owners;

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const created = await createLeadRequest({
        ...values,
        ownerId: values.ownerId || undefined,
        branchId: values.branchId || undefined,
        nextFollowUpAt: values.nextFollowUpAt ? new Date(values.nextFollowUpAt).toISOString() : undefined,
      });
      toast.success("Lead captured", `${created.ref} is now in the lead pipeline.`);
      close();
      router.push(`/leads/${created.id}`);
    } catch (error) {
      toast.error("Could not create lead", errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New lead
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Capture a new lead"
        description="Only synthetic DEMO customer data should be entered here."
        size="lg"
        footer={
          <>
            <Button variant="outline" type="button" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="new-lead-form" loading={submitting}>
              Create lead
            </Button>
          </>
        }
      >
        <form id="new-lead-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Customer name" htmlFor="lead-name" error={errors.customerName?.message} required>
            <Input id="lead-name" placeholder="e.g. Ananya Sharma" {...register("customerName")} />
          </Field>
          <Field label="Phone" htmlFor="lead-phone" error={errors.phone?.message} required>
            <Input id="lead-phone" placeholder="+91 98xxxxxxxx" inputMode="tel" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="lead-email" error={errors.email?.message} required>
            <Input id="lead-email" type="email" placeholder="name@example.com" {...register("email")} />
          </Field>
          <Field label="City" htmlFor="lead-city" error={errors.city?.message} required>
            <Input id="lead-city" placeholder="e.g. Pune" {...register("city")} />
          </Field>
          <Field label="Lead type" htmlFor="lead-type" error={errors.type?.message} required>
            <Select id="lead-type" {...register("type")}>
              {LEAD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {LEAD_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source" htmlFor="lead-source" error={errors.source?.message} required>
            <Select id="lead-source" {...register("source")}>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABELS[source]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Monthly income (₹)" htmlFor="lead-income" error={errors.monthlyIncome?.message} required>
            <Input id="lead-income" type="number" min={0} step={1000} {...register("monthlyIncome", { valueAsNumber: true })} />
          </Field>
          <Field label="Loan purpose" htmlFor="lead-purpose" error={errors.loanPurpose?.message} required>
            <Input id="lead-purpose" placeholder="e.g. Working capital expansion" {...register("loanPurpose")} />
          </Field>

          {canAssign && branches.length > 1 ? (
            <Field label="Branch" htmlFor="lead-branch" error={errors.branchId?.message}>
              <Select id="lead-branch" {...register("branchId")}>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {canAssign ? (
            <Field label="Assign to" htmlFor="lead-owner" error={errors.ownerId?.message} hint="Defaults to you when left unassigned.">
              <Select id="lead-owner" {...register("ownerId")}>
                <option value="">Unassigned — assign to me</option>
                {branchOwners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Next follow-up" htmlFor="lead-followup" error={errors.nextFollowUpAt?.message}>
            <Input id="lead-followup" type="datetime-local" {...register("nextFollowUpAt")} />
          </Field>

          <Field label="Notes" htmlFor="lead-notes" error={errors.notes?.message} className="sm:col-span-2">
            <Textarea id="lead-notes" placeholder="Capture context from the enquiry…" {...register("notes")} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
