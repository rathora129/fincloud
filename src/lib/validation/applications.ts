import { z } from "zod";
import { LOAN_PRODUCTS } from "./leads";

export const APPLICATION_STATUSES = [
  "NEW",
  "IN_PROCESS",
  "RECOMMENDED",
  "SENT_BACK",
  "CREDIT_APPROVED",
  "CREDIT_REJECTED",
  "SANCTIONED",
  "DISBURSEMENT_PENDING",
  "DISBURSED",
  "CLOSED",
] as const;

export const DOCUMENT_STATUSES = ["PENDING", "UPLOADED", "VERIFIED", "REJECTED"] as const;
export const VERIFICATION_FIELDS = ["identity", "address", "employment", "income"] as const;

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(160);
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{10,18}$/, "Enter a valid phone number (10–18 characters)");

const loanFields = {
  product: z.enum(LOAN_PRODUCTS),
  requestedAmount: z
    .number({ error: "Enter the requested amount" })
    .min(10000, "Minimum request is ₹10,000")
    .max(100000000, "Requested amount looks too high"),
  tenureMonths: z
    .number({ error: "Enter the tenure" })
    .int("Tenure must be a whole number of months")
    .min(6, "Minimum tenure is 6 months")
    .max(360, "Maximum tenure is 360 months"),
  interestRate: z.number({ error: "Enter a rate" }).min(1, "Rate must be above 1%").max(40, "Rate must be below 40%"),
  purpose: z.string().trim().min(3, "Describe the loan purpose").max(200),
};

export const applicationCreateSchema = z
  .object({
    customerId: z.string().optional(),
    customerName: z.string().trim().max(120).optional(),
    customerPhone: z.union([phone, z.literal("")]).optional(),
    customerEmail: z.union([email, z.literal("")]).optional(),
    customerCity: z.string().trim().max(80).optional(),
    employmentType: z.enum(["SALARIED", "SELF_EMPLOYED", "BUSINESS_OWNER"]).optional(),
    employer: z.string().trim().max(120).optional(),
    monthlyIncome: z.number().min(0).max(10000000).optional(),
    ownerId: z.string().optional(),
    branchId: z.string().optional(),
    ...loanFields,
  })
  .superRefine((value, ctx) => {
    if (value.customerId) return;
    if (!value.customerName || value.customerName.length < 2) {
      ctx.addIssue({ code: "custom", path: ["customerName"], message: "Enter the customer name" });
    }
    if (!value.customerPhone) {
      ctx.addIssue({ code: "custom", path: ["customerPhone"], message: "Enter a valid phone number" });
    }
    if (!value.customerEmail) {
      ctx.addIssue({ code: "custom", path: ["customerEmail"], message: "Enter a valid email address" });
    }
    if (!value.customerCity || value.customerCity.length < 2) {
      ctx.addIssue({ code: "custom", path: ["customerCity"], message: "Enter a city" });
    }
  });

export type ApplicationCreateValues = z.infer<typeof applicationCreateSchema>;

export const applicationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    patch: z.object({
      product: z.enum(LOAN_PRODUCTS),
      requestedAmount: z.number().min(10000).max(100000000),
      tenureMonths: z.number().int().min(6).max(360),
      interestRate: z.number().min(1).max(40),
      purpose: z.string().trim().min(3).max(200),
      ownerId: z.string().optional(),
    }),
  }),
  z.object({ action: z.literal("SUBMIT") }),
  z.object({
    action: z.literal("DOCUMENT"),
    documentId: z.string().min(1),
    status: z.enum(DOCUMENT_STATUSES),
  }),
  z.object({
    action: z.literal("VERIFICATION"),
    field: z.enum(VERIFICATION_FIELDS),
    status: z.enum(["PENDING", "VERIFIED", "FAILED"]),
  }),
  z.object({ action: z.literal("RECOMMEND"), creditOfficerId: z.string().optional() }),
  z.object({ action: z.literal("RESUBMIT") }),
]);

export type ApplicationActionInput = z.infer<typeof applicationActionSchema>;
