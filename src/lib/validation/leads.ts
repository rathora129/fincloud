import { z } from "zod";

export const LEAD_SOURCES = ["WEBSITE", "REFERRAL", "WALK_IN", "PARTNER", "CAMPAIGN", "REPEAT_CUSTOMER"] as const;
export const LEAD_TYPES = ["NEW", "REPEAT", "PRE_APPROVED"] as const;
export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"] as const;
export const LOAN_PRODUCTS = ["PERSONAL", "BUSINESS", "HOME", "VEHICLE", "GOLD"] as const;
export const FOLLOW_UP_CHANNELS = ["CALL", "VISIT", "EMAIL", "WHATSAPP_NOTE"] as const;
export const FOLLOW_UP_OUTCOMES = ["CONNECTED", "NO_ANSWER", "INTERESTED", "NOT_INTERESTED", "CALLBACK"] as const;

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(160);
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{10,18}$/, "Enter a valid phone number (10–18 characters)");

export const leadFormSchema = z.object({
  customerName: z.string().trim().min(2, "Enter the customer name").max(120),
  phone,
  email,
  city: z.string().trim().min(2, "Enter a city").max(80),
  source: z.enum(LEAD_SOURCES),
  type: z.enum(LEAD_TYPES),
  monthlyIncome: z
    .number({ error: "Enter monthly income" })
    .min(5000, "Monthly income must be at least ₹5,000")
    .max(10000000, "Monthly income looks too high"),
  loanPurpose: z.string().trim().min(3, "Describe the loan purpose").max(160),
  notes: z.string().trim().max(1000).optional(),
  nextFollowUpAt: z.string().nullable().optional(),
});

export type LeadFormValues = z.infer<typeof leadFormSchema>;

export const leadCreateSchema = leadFormSchema.extend({
  ownerId: z.string().optional(),
  branchId: z.string().optional(),
});

export const leadPatchSchema = leadFormSchema.partial();

export const leadActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("UPDATE"), patch: leadPatchSchema }),
  z.object({ action: z.literal("ASSIGN"), ownerId: z.string().min(1, "Select an owner") }),
  z.object({ action: z.literal("STATUS"), status: z.enum(LEAD_STATUSES), note: z.string().trim().max(300).optional() }),
  z.object({
    action: z.literal("FOLLOW_UP"),
    channel: z.enum(FOLLOW_UP_CHANNELS),
    outcome: z.enum(FOLLOW_UP_OUTCOMES),
    notes: z.string().trim().min(3, "Add a short follow-up note").max(800),
    nextFollowUpAt: z.string().optional().nullable(),
  }),
  z.object({
    action: z.literal("CONVERT"),
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
    purpose: z.string().trim().min(3, "Describe the loan purpose").max(200),
    interestRate: z.number().min(1).max(40).optional(),
  }),
]);

export type LeadActionInput = z.infer<typeof leadActionSchema>;
