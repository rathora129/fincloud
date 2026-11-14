"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRightLeft, CalendarClock, Check, FilePlus2, PencilLine, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { leadActionRequest } from "@/services/leads";
import { errorMessage } from "@/lib/api";
import { LEAD_SOURCES, leadFormSchema, FOLLOW_UP_CHANNELS, FOLLOW_UP_OUTCOMES, LOAN_PRODUCTS } from "@/lib/validation/leads";
import { LEAD_TYPE_LABELS, PRODUCT_LABELS, SOURCE_LABELS, STATUS_META } from "@/lib/labels";
import { PRODUCT_RATES, PRODUCT_TENURE, nextLeadStatuses } from "@/lib/lead-flow";
import { humanize } from "@/lib/labels";
import type { Lead, LoanProduct } from "@/lib/types";

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type LeadActionLead = Pick<
  Lead,
  | "id"
  | "ref"
  | "status"
  | "type"
  | "ownerId"
  | "customerName"
  | "phone"
  | "email"
  | "city"
  | "source"
  | "monthlyIncome"
  | "loanPurpose"
  | "notes"
  | "nextFollowUpAt"
  | "branchId"
>;

const followUpSchema = z.object({
  channel: z.enum(FOLLOW_UP_CHANNELS),
  outcome: z.enum(FOLLOW_UP_OUTCOMES),
  notes: z.string().trim().min(3, "Add a short follow-up note").max(800),
  nextFollowUpAt: z.string().optional(),
});

type FollowUpValues = z.infer<typeof followUpSchema>;

const convertSchema = z.object({
  product: z.enum(LOAN_PRODUCTS),
  requestedAmount: z
    .number({ error: "Enter the requested amount" })
    .min(10000, "Minimum request is ₹10,000")
    .max(100000000, "Requested amount looks too high"),
  tenureMonths: z.number({ error: "Enter the tenure" }).int().min(6, "Minimum tenure is 6 months").max(360),
  purpose: z.string().trim().min(3, "Describe the loan purpose").max(200),
  interestRate: z
    .string()
    .optional()
    .refine((value) => !value || (Number(value) >= 1 && Number(value) <= 40), "Enter a rate between 1% and 40%"),
});

type ConvertValues = z.infer<typeof convertSchema>;

export function LeadActions({
  lead,
  owners,
  canManage,
  canAssign,
  canConvert,
}: {
  lead: LeadActionLead;
  owners: { id: string; name: string; branchId: string; color: string }[];
  canManage: boolean;
  canAssign: boolean;
  canConvert: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<null | "edit" | "assign" | "followup" | "convert">(null);
  const [busy, setBusy] = useState(false);
  const [ownerId, setOwnerId] = useState(lead.ownerId);

  const editForm = useForm<z.infer<typeof leadFormSchema>>({
    resolver: zodResolver(leadFormSchema),
    values: {
      customerName: lead.customerName,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      source: lead.source,
      type: lead.type,
      monthlyIncome: lead.monthlyIncome,
      loanPurpose: lead.loanPurpose,
      notes: lead.notes,
      nextFollowUpAt: toLocalInput(lead.nextFollowUpAt),
    },
  });

  const followUpForm = useForm<FollowUpValues>({
    resolver: zodResolver(followUpSchema),
    defaultValues: {
      channel: "CALL",
      outcome: "CONNECTED",
      notes: "",
      nextFollowUpAt: toLocalInput(lead.nextFollowUpAt),
    },
  });

  const convertForm = useForm<ConvertValues>({
    resolver: zodResolver(convertSchema),
    defaultValues: {
      product: "PERSONAL",
      requestedAmount: 500000,
      tenureMonths: 36,
      purpose: lead.loanPurpose,
      interestRate: "",
    },
  });

  const branchOwners = owners.filter((owner) => owner.branchId === lead.branchId);

  const run = async (
    payload: Parameters<typeof leadActionRequest>[1],
    message: string,
    options?: { after?: () => void },
  ) => {
    setBusy(true);
    try {
      await leadActionRequest(lead.id, payload);
      toast.success(message);
      setDialog(null);
      options?.after?.();
      router.refresh();
    } catch (error) {
      toast.error("Action could not be completed", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = editForm.handleSubmit((values) =>
    run(
      {
        action: "UPDATE",
        patch: {
          ...values,
          notes: values.notes ?? "",
          nextFollowUpAt: values.nextFollowUpAt ? new Date(values.nextFollowUpAt).toISOString() : null,
        },
      },
      "Lead details updated",
    ),
  );

  const submitFollowUp = followUpForm.handleSubmit((values) =>
    run(
      {
        action: "FOLLOW_UP",
        channel: values.channel,
        outcome: values.outcome,
        notes: values.notes,
        nextFollowUpAt: values.nextFollowUpAt ? new Date(values.nextFollowUpAt).toISOString() : null,
      },
      "Follow-up recorded",
      { after: () => followUpForm.reset({ channel: "CALL", outcome: "CONNECTED", notes: "", nextFollowUpAt: "" }) },
    ),
  );

  const submitConvert = convertForm.handleSubmit(async (values) => {
    setBusy(true);
    try {
      const result = await leadActionRequest(lead.id, {
        action: "CONVERT",
        product: values.product,
        requestedAmount: values.requestedAmount,
        tenureMonths: values.tenureMonths,
        purpose: values.purpose,
        interestRate: values.interestRate ? Number(values.interestRate) : undefined,
      });
      toast.success("Application created", result.applicationRef ? `${result.applicationRef} is ready for processing.` : undefined);
      setDialog(null);
      if (result.applicationId) router.push(`/applications/${result.applicationId}`);
      else router.refresh();
    } catch (error) {
      toast.error("Conversion failed", errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  const product = convertForm.watch("product");

  return (
    <>
      {canManage ? (
        <Button variant="outline" onClick={() => setDialog("edit")}>
          <PencilLine className="h-4 w-4" /> Edit
        </Button>
      ) : null}
      {canAssign ? (
        <Button
          variant="outline"
          onClick={() => {
            setOwnerId(lead.ownerId);
            setDialog("assign");
          }}
        >
          <UserRoundCog className="h-4 w-4" /> Assign
        </Button>
      ) : null}
      {canManage ? (
        <Button variant="soft" onClick={() => setDialog("followup")}>
          <CalendarClock className="h-4 w-4" /> Log follow-up
        </Button>
      ) : null}
      {canConvert ? (
        <Button onClick={() => setDialog("convert")} disabled={lead.status !== "QUALIFIED"}>
          <FilePlus2 className="h-4 w-4" /> Convert to application
        </Button>
      ) : null}

      <Modal
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
        title="Edit lead"
        description="Update the captured enquiry details. Changes are audit-logged."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="edit-lead-form" loading={busy}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-lead-form" onSubmit={submitEdit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Customer name" htmlFor="edit-name" error={editForm.formState.errors.customerName?.message} required>
            <Input id="edit-name" {...editForm.register("customerName")} />
          </Field>
          <Field label="Phone" htmlFor="edit-phone" error={editForm.formState.errors.phone?.message} required>
            <Input id="edit-phone" {...editForm.register("phone")} />
          </Field>
          <Field label="Email" htmlFor="edit-email" error={editForm.formState.errors.email?.message} required>
            <Input id="edit-email" type="email" {...editForm.register("email")} />
          </Field>
          <Field label="City" htmlFor="edit-city" error={editForm.formState.errors.city?.message} required>
            <Input id="edit-city" {...editForm.register("city")} />
          </Field>
          <Field label="Lead type" htmlFor="edit-type">
            <Select id="edit-type" {...editForm.register("type")}>
              {Object.entries(LEAD_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source" htmlFor="edit-source" error={editForm.formState.errors.source?.message} required>
            <Select id="edit-source" {...editForm.register("source")}>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABELS[source]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Monthly income (₹)"
            htmlFor="edit-income"
            error={editForm.formState.errors.monthlyIncome?.message}
            required
          >
            <Input id="edit-income" type="number" step={1000} {...editForm.register("monthlyIncome", { valueAsNumber: true })} />
          </Field>
          <Field label="Next follow-up" htmlFor="edit-followup" error={editForm.formState.errors.nextFollowUpAt?.message}>
            <Input id="edit-followup" type="datetime-local" {...editForm.register("nextFollowUpAt")} />
          </Field>
          <Field
            label="Loan purpose"
            htmlFor="edit-purpose"
            error={editForm.formState.errors.loanPurpose?.message}
            required
            className="sm:col-span-2"
          >
            <Input id="edit-purpose" {...editForm.register("loanPurpose")} />
          </Field>
          <Field label="Notes" htmlFor="edit-notes" error={editForm.formState.errors.notes?.message} className="sm:col-span-2">
            <Textarea id="edit-notes" {...editForm.register("notes")} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={dialog === "assign"}
        onClose={() => setDialog(null)}
        title="Reassign lead"
        description="The new owner must belong to the lead's branch. Reassignment is recorded in the activity trail."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                const owner = branchOwners.find((item) => item.id === ownerId);
                if (!owner) {
                  toast.warning("Select an owner", "Choose an active team member from this branch.");
                  return;
                }
                run({ action: "ASSIGN", ownerId }, `Lead reassigned to ${owner.name}`);
              }}
            >
              <ArrowRightLeft className="h-4 w-4" /> Reassign
            </Button>
          </>
        }
      >
        <Field label="Lead owner" htmlFor="assign-owner" required>
          <Select id="assign-owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            <option value="">Select an owner</option>
            {branchOwners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </Select>
        </Field>
        {branchOwners.length === 0 ? (
          <p className="mt-2 text-xs text-rose-600">No active team members are available in this branch.</p>
        ) : null}
      </Modal>

      <Modal
        open={dialog === "followup"}
        onClose={() => setDialog(null)}
        title="Log a follow-up"
        description="A follow-up on a new lead moves it to Contacted automatically."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="followup-form" loading={busy}>
              Save follow-up
            </Button>
          </>
        }
      >
        <form id="followup-form" onSubmit={submitFollowUp} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Channel" htmlFor="followup-channel" error={followUpForm.formState.errors.channel?.message} required>
            <Select id="followup-channel" {...followUpForm.register("channel")}>
              {FOLLOW_UP_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {humanize(channel)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Outcome" htmlFor="followup-outcome" error={followUpForm.formState.errors.outcome?.message} required>
            <Select id="followup-outcome" {...followUpForm.register("outcome")}>
              {FOLLOW_UP_OUTCOMES.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {humanize(outcome)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Next follow-up"
            htmlFor="followup-next"
            error={followUpForm.formState.errors.nextFollowUpAt?.message}
            className="sm:col-span-2"
          >
            <Input id="followup-next" type="datetime-local" {...followUpForm.register("nextFollowUpAt")} />
          </Field>
          <Field
            label="Notes"
            htmlFor="followup-notes"
            error={followUpForm.formState.errors.notes?.message}
            required
            className="sm:col-span-2"
          >
            <Textarea id="followup-notes" placeholder="What was discussed? Next step agreed with the customer?" {...followUpForm.register("notes")} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={dialog === "convert"}
        onClose={() => setDialog(null)}
        title="Convert to loan application"
        description="Creates a customer record and a new application in this DEMO workspace. Rates are illustrative defaults and can be overridden."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="convert-form" loading={busy}>
              Create application
            </Button>
          </>
        }
      >
        <form id="convert-form" onSubmit={submitConvert} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Loan product" htmlFor="convert-product" error={convertForm.formState.errors.product?.message} required>
            <Select
              id="convert-product"
              {...convertForm.register("product", {
                onChange: (event) => {
                  const value = event.target.value as LoanProduct;
                  convertForm.setValue("tenureMonths", PRODUCT_TENURE[value]);
                  convertForm.setValue("interestRate", String(PRODUCT_RATES[value]));
                },
              })}
            >
              {LOAN_PRODUCTS.map((item) => (
                <option key={item} value={item}>
                  {PRODUCT_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Requested amount (₹)"
            htmlFor="convert-amount"
            error={convertForm.formState.errors.requestedAmount?.message}
            required
          >
            <Input id="convert-amount" type="number" step={10000} {...convertForm.register("requestedAmount", { valueAsNumber: true })} />
          </Field>
          <Field label="Tenure (months)" htmlFor="convert-tenure" error={convertForm.formState.errors.tenureMonths?.message} required>
            <Input id="convert-tenure" type="number" step={6} {...convertForm.register("tenureMonths", { valueAsNumber: true })} />
          </Field>
          <Field
            label="Interest rate (% p.a.)"
            htmlFor="convert-rate"
            error={convertForm.formState.errors.interestRate?.message}
            hint={`Illustrative default for ${PRODUCT_LABELS[product]}`}
          >
            <Input id="convert-rate" type="number" step={0.25} placeholder={String(PRODUCT_RATES[product])} {...convertForm.register("interestRate")} />
          </Field>
          <Field
            label="Loan purpose"
            htmlFor="convert-purpose"
            error={convertForm.formState.errors.purpose?.message}
            required
            className="sm:col-span-2"
          >
            <Input id="convert-purpose" {...convertForm.register("purpose")} />
          </Field>
          <p className="rounded-xl bg-brand-50 px-4 py-3 text-xs leading-relaxed text-brand-800 sm:col-span-2">
            DEMO conversion: no credit bureau check, e-sign or disbursement is triggered. The application starts in New and
            proceeds through the standard credit workflow.
          </p>
        </form>
      </Modal>
    </>
  );
}

export function LeadStatusControl({
  leadId,
  status,
  canManage,
}: {
  leadId: string;
  status: Lead["status"];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<Lead["status"] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!canManage) return null;
  const options = nextLeadStatuses(status).filter((next) => next !== "CONVERTED");
  if (options.length === 0) return null;

  const apply = async (next: Lead["status"], noteText?: string) => {
    setBusy(true);
    try {
      await leadActionRequest(leadId, { action: "STATUS", status: next, note: noteText });
      toast.success(`Lead moved to ${STATUS_META[next]?.label ?? next}`);
      setTarget(null);
      setNote("");
      router.refresh();
    } catch (error) {
      toast.error("Status change failed", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((next) => (
        <Button
          key={next}
          size="sm"
          variant={next === "LOST" ? "outline" : "soft"}
          onClick={() => (next === "LOST" ? setTarget(next) : apply(next))}
          disabled={busy}
        >
          <Check className="h-3.5 w-3.5" />
          Mark {STATUS_META[next]?.label ?? next}
        </Button>
      ))}

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title="Close lead as lost"
        description="Record why the lead did not progress. This is retained in the activity trail."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => target && apply(target, note)}>
              Mark lost
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="lost-note">
          <Textarea
            id="lost-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Customer chose a competitor / income does not meet policy"
          />
        </Field>
      </Modal>
    </div>
  );
}
