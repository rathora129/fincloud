"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Download, Lock, PencilLine, Send, ShieldCheck, Undo2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { FileUpload } from "@/components/ui/file-upload";
import { StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { applicationActionRequest, documentFileUrl, uploadDocumentFile } from "@/services/applications";
import { errorMessage } from "@/lib/api";
import { PRODUCT_LABELS, humanize } from "@/lib/labels";
import { PRODUCT_RATES } from "@/lib/lead-flow";
import type { DocumentCheck, LoanApplication, LoanProduct } from "@/lib/types";

const PRODUCTS = ["PERSONAL", "BUSINESS", "HOME", "VEHICLE", "GOLD"] as const;

type ApplicationActionLead = Pick<
  LoanApplication,
  "id" | "ref" | "status" | "product" | "requestedAmount" | "tenureMonths" | "interestRate" | "purpose" | "ownerId" | "branchId"
>;

const editSchema = z.object({
  product: z.enum(PRODUCTS),
  requestedAmount: z
    .number({ error: "Enter the requested amount" })
    .min(10000, "Minimum request is ₹10,000")
    .max(100000000, "Requested amount looks too high"),
  tenureMonths: z.number({ error: "Enter the tenure" }).int().min(6, "Minimum tenure is 6 months").max(360),
  interestRate: z.number({ error: "Enter a rate" }).min(1, "Must be above 1%").max(40, "Must be below 40%"),
  purpose: z.string().trim().min(3, "Describe the loan purpose").max(200),
  ownerId: z.string().optional(),
});

type EditValues = z.infer<typeof editSchema>;

export function ApplicationActions({
  application,
  owners,
  creditOfficers,
  canManage,
}: {
  application: ApplicationActionLead;
  owners: { id: string; name: string; branchId: string }[];
  creditOfficers: { id: string; name: string; branchId: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "edit" | "recommend">(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [officerId, setOfficerId] = useState("");

  const editable = ["NEW", "IN_PROCESS", "SENT_BACK"].includes(application.status);
  const branchOwners = owners.filter((owner) => owner.branchId === application.branchId);
  const branchCredit = creditOfficers.filter((officer) => officer.branchId === application.branchId);

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    values: {
      product: application.product,
      requestedAmount: application.requestedAmount,
      tenureMonths: application.tenureMonths,
      interestRate: application.interestRate,
      purpose: application.purpose,
      ownerId: application.ownerId,
    },
  });

  const run = async (action: Parameters<typeof applicationActionRequest>[1], key: string, message: string, after?: () => void) => {
    setBusy(key);
    try {
      await applicationActionRequest(application.id, action);
      toast.success(message);
      setDialog(null);
      after?.();
      router.refresh();
    } catch (error) {
      toast.error("Action could not be completed", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const submitEdit = form.handleSubmit((values) =>
    run({ action: "UPDATE", patch: { ...values, ownerId: values.ownerId || undefined } }, "edit", "Application details updated"),
  );

  if (!canManage) return null;

  return (
    <>
      {editable ? (
        <Button variant="outline" onClick={() => setDialog("edit")}>
          <PencilLine className="h-4 w-4" /> Edit
        </Button>
      ) : null}

      {application.status === "NEW" ? (
        <Button onClick={() => setConfirmSubmit(true)} loading={busy === "submit"}>
          <Send className="h-4 w-4" /> Submit for processing
        </Button>
      ) : null}

      {application.status === "IN_PROCESS" ? (
        <Button onClick={() => setDialog("recommend")}>
          <ShieldCheck className="h-4 w-4" /> Recommend to credit
        </Button>
      ) : null}

      {application.status === "SENT_BACK" ? (
        <Button onClick={() => run({ action: "RESUBMIT" }, "resubmit", "Application resubmitted to credit")} loading={busy === "resubmit"}>
          <Undo2 className="h-4 w-4" /> Resubmit to credit
        </Button>
      ) : null}

      <Modal
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
        title="Edit loan application"
        description="Update loan terms or the owning officer. Changes are audit-logged."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy === "edit"}>
              Cancel
            </Button>
            <Button type="submit" form="edit-application-form" loading={busy === "edit"}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-application-form" onSubmit={submitEdit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Product" htmlFor="edit-product" error={form.formState.errors.product?.message} required>
            <Select
              id="edit-product"
              {...form.register("product", {
                onChange: (event) => form.setValue("interestRate", PRODUCT_RATES[event.target.value as LoanProduct]),
              })}
            >
              {PRODUCTS.map((product) => (
                <option key={product} value={product}>
                  {PRODUCT_LABELS[product]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Requested amount (₹)" htmlFor="edit-amount" error={form.formState.errors.requestedAmount?.message} required>
            <Input id="edit-amount" type="number" step={10000} {...form.register("requestedAmount", { valueAsNumber: true })} />
          </Field>
          <Field label="Tenure (months)" htmlFor="edit-tenure" error={form.formState.errors.tenureMonths?.message} required>
            <Input id="edit-tenure" type="number" step={6} {...form.register("tenureMonths", { valueAsNumber: true })} />
          </Field>
          <Field label="Interest rate (% p.a.)" htmlFor="edit-rate" error={form.formState.errors.interestRate?.message} required>
            <Input id="edit-rate" type="number" step={0.25} {...form.register("interestRate", { valueAsNumber: true })} />
          </Field>
          <Field label="Owner" htmlFor="edit-owner" error={form.formState.errors.ownerId?.message} className="sm:col-span-2">
            <Select id="edit-owner" {...form.register("ownerId")}>
              <option value="">Keep current owner</option>
              {branchOwners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Purpose" htmlFor="edit-purpose" error={form.formState.errors.purpose?.message} required className="sm:col-span-2">
            <Textarea id="edit-purpose" {...form.register("purpose")} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={dialog === "recommend"}
        onClose={() => setDialog(null)}
        title="Recommend to credit review"
        description="All mandatory documents must be verified and all verification checks completed. The file moves to the credit queue."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy === "recommend"}>
              Cancel
            </Button>
            <Button
              loading={busy === "recommend"}
              onClick={() => run({ action: "RECOMMEND", creditOfficerId: officerId || undefined }, "recommend", "Application recommended to credit")}
            >
              <ShieldCheck className="h-4 w-4" /> Recommend
            </Button>
          </>
        }
      >
        <Field label="Assign credit officer" htmlFor="recommend-officer" hint="Optional — defaults to the branch credit officer.">
          <Select id="recommend-officer" value={officerId} onChange={(event) => setOfficerId(event.target.value)}>
            <option value="">Branch default</option>
            {branchCredit.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => run({ action: "SUBMIT" }, "submit", "Application submitted for processing", () => setConfirmSubmit(false))}
        title="Submit for processing?"
        description="All mandatory documents must already be uploaded. The file moves to In-process and can be verified and recommended to credit."
        confirmLabel="Submit application"
        loading={busy === "submit"}
      />
    </>
  );
}

export function DocumentChecklist({
  applicationId,
  documents,
  canManage,
  locked,
}: {
  applicationId: string;
  documents: DocumentCheck[];
  canManage: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<DocumentCheck | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const update = async (documentId: string, status: DocumentCheck["status"], label: string) => {
    setBusy(documentId);
    try {
      await applicationActionRequest(applicationId, { action: "DOCUMENT", documentId, status });
      toast.success(label);
      router.refresh();
    } catch (error) {
      toast.error("Document update failed", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const closeUpload = () => {
    setUploadFor(null);
    setSelectedFile(null);
  };

  const upload = async () => {
    if (!uploadFor || !selectedFile) return;
    setBusy(uploadFor.id);
    try {
      await uploadDocumentFile(applicationId, uploadFor.id, selectedFile);
      toast.success("Document uploaded", `${uploadFor.name} is stored privately and marked uploaded.`);
      closeUpload();
      router.refresh();
    } catch (error) {
      toast.error("Upload failed", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <ul className="divide-y divide-ink-100">
        {documents.map((document) => (
          <li key={document.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink-800">{document.name}</p>
                {document.required ? (
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                    Mandatory
                  </span>
                ) : null}
                <StatusBadge status={document.status} dot={false} />
              </div>
              <p className="mt-0.5 text-[11px] text-ink-400">
                {document.fileId
                  ? `${document.fileName} · stored privately`
                  : document.fileName
                    ? `${document.fileName} · DEMO seed metadata, no binary attached`
                    : "No file attached"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {document.fileId ? (
                <a
                  href={documentFileUrl(applicationId, document.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 text-[11.5px] font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              ) : null}
              {canManage && !locked ? (
                <>
                  {!document.fileId && document.status !== "VERIFIED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === document.id}
                      onClick={() => {
                        setUploadFor(document);
                        setSelectedFile(null);
                      }}
                    >
                      <UploadCloud className="h-3.5 w-3.5" /> Upload
                    </Button>
                  ) : null}
                  {document.status === "UPLOADED" ? (
                    <>
                      <Button
                        size="sm"
                        variant="soft"
                        loading={busy === document.id}
                        onClick={() => update(document.id, "VERIFIED", `${document.name} verified`)}
                      >
                        <Check className="h-3.5 w-3.5" /> Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === document.id}
                        onClick={() => update(document.id, "REJECTED", `${document.name} rejected`)}
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={uploadFor !== null}
        onClose={closeUpload}
        title={`Upload ${uploadFor?.name ?? "document"}`}
        description="Files are validated server-side, stored outside the public web root, and only downloadable by users with record access."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={closeUpload} disabled={busy !== null}>
              Cancel
            </Button>
            <Button onClick={upload} disabled={!selectedFile} loading={busy !== null && busy === uploadFor?.id}>
              Upload file
            </Button>
          </>
        }
      >
        <FileUpload onFile={setSelectedFile} label="Select a file" />
        <p className="mt-3 text-[10.5px] leading-relaxed text-ink-400">
          Accepted: PDF, PNG or JPEG up to 5 MB. The server re-checks the file signature and stores the binary with a
          generated name. Demo data must remain synthetic.
        </p>
      </Modal>
    </>
  );
}

export function VerificationPanel({
  applicationId,
  verification,
  canManage,
  locked,
}: {
  applicationId: string;
  verification: LoanApplication["verification"];
  canManage: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (field: keyof LoanApplication["verification"], status: "VERIFIED" | "FAILED") => {
    setBusy(field);
    try {
      await applicationActionRequest(applicationId, { action: "VERIFICATION", field, status });
      toast.success(`${humanize(field)} verification marked ${status.toLowerCase()}`);
      router.refresh();
    } catch (error) {
      toast.error("Verification update failed", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {(Object.keys(verification) as Array<keyof LoanApplication["verification"]>).map((field) => (
        <div key={field} className="rounded-xl border border-ink-100 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink-800">{humanize(field)}</p>
            <StatusBadge status={verification[field]} dot={false} />
          </div>
          {canManage && !locked && verification[field] === "PENDING" ? (
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="soft" loading={busy === field} onClick={() => update(field, "VERIFIED")}>
                <Check className="h-3 w-3" /> Verify
              </Button>
              <Button size="sm" variant="ghost" loading={busy === field} onClick={() => update(field, "FAILED")}>
                <X className="h-3 w-3" /> Fail
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function LockedNote() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-500">
      <Lock className="h-3.5 w-3.5" /> Editing is locked at this stage
    </p>
  );
}
