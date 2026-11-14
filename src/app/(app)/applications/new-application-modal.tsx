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
import { createApplicationRequest } from "@/services/applications";
import { errorMessage } from "@/lib/api";
import { applicationCreateSchema } from "@/lib/validation/applications";
import { EMPLOYMENT_LABELS, PRODUCT_LABELS } from "@/lib/labels";
import { PRODUCT_RATES, PRODUCT_TENURE } from "@/lib/lead-flow";
import type { LoanProduct } from "@/lib/types";

type FormValues = z.infer<typeof applicationCreateSchema>;

const PRODUCTS = ["PERSONAL", "BUSINESS", "HOME", "VEHICLE", "GOLD"] as const;
const EMPLOYMENT_TYPES = ["SALARIED", "SELF_EMPLOYED", "BUSINESS_OWNER"] as const;

export function NewApplicationModal({
  canManage,
  owners,
  branches,
  customers,
  currentUserId,
}: {
  canManage: boolean;
  owners: { id: string; name: string; branchId: string }[];
  branches: { id: string; name: string }[];
  customers: { id: string; name: string; ref: string; city: string; branchId: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [submitting, setSubmitting] = useState(false);

  const defaultBranch = owners.find((owner) => owner.id === currentUserId)?.branchId ?? branches[0]?.id ?? "";
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(applicationCreateSchema),
    defaultValues: {
      customerId: "",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      customerCity: "",
      employmentType: "SALARIED",
      employer: "",
      monthlyIncome: 45000,
      product: "PERSONAL",
      requestedAmount: 500000,
      tenureMonths: 36,
      interestRate: PRODUCT_RATES.PERSONAL,
      purpose: "",
      ownerId: "",
      branchId: defaultBranch,
    },
  });

  if (!canManage) return null;

  const branchId = watch("branchId");
  const product = watch("product");
  const visibleCustomers = branchId ? customers.filter((customer) => customer.branchId === branchId) : customers;
  const visibleOwners = branchId ? owners.filter((owner) => owner.branchId === branchId) : owners;

  const close = () => {
    setOpen(false);
    reset();
    setMode("existing");
  };

  const submit = handleSubmit(async (values) => {
    if (mode === "existing" && !values.customerId) {
      setError("customerId", { message: "Select an existing customer" });
      return;
    }
    setSubmitting(true);
    try {
      const created = await createApplicationRequest({
        ...values,
        customerId: mode === "existing" ? values.customerId : undefined,
        customerName: mode === "new" ? values.customerName : undefined,
        customerPhone: mode === "new" ? values.customerPhone : undefined,
        customerEmail: mode === "new" ? values.customerEmail : undefined,
        customerCity: mode === "new" ? values.customerCity : undefined,
        employmentType: mode === "new" ? values.employmentType : undefined,
        employer: mode === "new" ? values.employer : undefined,
        monthlyIncome: mode === "new" ? values.monthlyIncome : undefined,
        ownerId: values.ownerId || undefined,
        branchId: values.branchId || undefined,
      });
      toast.success("Application created", `${created.ref} is ready for document collection.`);
      close();
      router.push(`/applications/${created.id}`);
    } catch (error) {
      toast.error("Could not create application", errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New application
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Create a loan application"
        description="Link an existing customer or capture a new enquiry. Only synthetic DEMO data should be used."
        size="lg"
        footer={
          <>
            <Button variant="outline" type="button" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="new-application-form" loading={submitting}>
              Create application
            </Button>
          </>
        }
      >
        <form id="new-application-form" onSubmit={submit} className="space-y-5" noValidate>
          <div>
            <div className="mb-3 inline-flex rounded-xl bg-ink-100 p-1">
              {(
                [
                  { key: "existing", label: "Existing customer" },
                  { key: "new", label: "New customer" },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMode(item.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    mode === item.key ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {mode === "existing" ? (
              <Field label="Customer" htmlFor="app-customer" error={errors.customerId?.message} required>
                <Select
                  id="app-customer"
                  {...register("customerId", {
                    onChange: (event) => {
                      const customer = customers.find((item) => item.id === event.target.value);
                      if (customer && branches.length > 1) setValue("branchId", customer.branchId);
                    },
                  })}
                >
                  <option value="">Select a customer</option>
                  {visibleCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} · {customer.ref} · {customer.city}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Customer name" htmlFor="app-name" error={errors.customerName?.message} required>
                  <Input id="app-name" placeholder="e.g. Kabir Nair" {...register("customerName")} />
                </Field>
                <Field label="Phone" htmlFor="app-phone" error={errors.customerPhone?.message} required>
                  <Input id="app-phone" inputMode="tel" placeholder="+91 98xxxxxxxx" {...register("customerPhone")} />
                </Field>
                <Field label="Email" htmlFor="app-email" error={errors.customerEmail?.message} required>
                  <Input id="app-email" type="email" placeholder="name@example.com" {...register("customerEmail")} />
                </Field>
                <Field label="City" htmlFor="app-city" error={errors.customerCity?.message} required>
                  <Input id="app-city" placeholder="e.g. Mumbai" {...register("customerCity")} />
                </Field>
                <Field label="Employment type" htmlFor="app-employment">
                  <Select id="app-employment" {...register("employmentType")}>
                    {EMPLOYMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {EMPLOYMENT_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Employer" htmlFor="app-employer">
                  <Input id="app-employer" placeholder="Employer or business name" {...register("employer")} />
                </Field>
                <Field label="Monthly income (₹)" htmlFor="app-income" className="sm:col-span-2">
                  <Input id="app-income" type="number" step={1000} {...register("monthlyIncome", { valueAsNumber: true })} />
                </Field>
              </div>
            )}
          </div>

          <div className="border-t border-ink-100 pt-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">Loan details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product" htmlFor="app-product" error={errors.product?.message} required>
                <Select
                  id="app-product"
                  {...register("product", {
                    onChange: (event) => {
                      const value = event.target.value as LoanProduct;
                      setValue("interestRate", PRODUCT_RATES[value]);
                      setValue("tenureMonths", PRODUCT_TENURE[value]);
                    },
                  })}
                >
                  {PRODUCTS.map((item) => (
                    <option key={item} value={item}>
                      {PRODUCT_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Requested amount (₹)" htmlFor="app-amount" error={errors.requestedAmount?.message} required>
                <Input id="app-amount" type="number" step={10000} {...register("requestedAmount", { valueAsNumber: true })} />
              </Field>
              <Field label="Tenure (months)" htmlFor="app-tenure" error={errors.tenureMonths?.message} required>
                <Input id="app-tenure" type="number" step={6} {...register("tenureMonths", { valueAsNumber: true })} />
              </Field>
              <Field
                label="Interest rate (% p.a.)"
                htmlFor="app-rate"
                error={errors.interestRate?.message}
                hint={`Illustrative default for ${PRODUCT_LABELS[product]}`}
                required
              >
                <Input id="app-rate" type="number" step={0.25} {...register("interestRate", { valueAsNumber: true })} />
              </Field>
              <Field
                label="Purpose"
                htmlFor="app-purpose"
                error={errors.purpose?.message}
                required
                className="sm:col-span-2"
              >
                <Textarea
                  id="app-purpose"
                  className="min-h-20"
                  placeholder="Purpose of the loan and any context for credit review…"
                  {...register("purpose")}
                />
              </Field>
            </div>
          </div>

          <div className="grid gap-4 border-t border-ink-100 pt-4 sm:grid-cols-2">
            {branches.length > 1 ? (
              <Field label="Branch" htmlFor="app-branch" error={errors.branchId?.message}>
                <Select
                  id="app-branch"
                  {...register("branchId", {
                    onChange: () => setValue("ownerId", ""),
                  })}
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Assign to" htmlFor="app-owner" error={errors.ownerId?.message} hint="Defaults to you when left unassigned.">
              <Select id="app-owner" {...register("ownerId")}>
                <option value="">Unassigned — assign to me</option>
                {visibleOwners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
