import { z } from "zod";

export const DISBURSEMENT_MODES = ["NEFT", "IMPS", "UPI"] as const;

export const sanctionCreateSchema = z.object({
  applicationId: z.string().trim().min(1, "Select a credit-approved application."),
  approvedAmount: z.coerce
    .number({ error: "Enter the sanction amount." })
    .finite()
    .positive("Sanction amount must be greater than zero."),
  interestRate: z.coerce
    .number({ error: "Enter the interest rate." })
    .min(0.5, "Interest rate must be at least 0.5%.")
    .max(48, "Interest rate must not exceed 48%."),
  tenureMonths: z.coerce
    .number({ error: "Enter the tenure." })
    .int("Tenure must be a whole number of months.")
    .min(1, "Minimum tenure is 1 month.")
    .max(360, "Maximum tenure is 360 months."),
  processingFee: z.coerce.number().min(0, "Processing fee cannot be negative.").max(1_000_000).optional(),
  disbursementMode: z.enum(DISBURSEMENT_MODES),
  remarks: z.string().trim().max(600, "Remarks must be 600 characters or fewer.").optional(),
});

export type SanctionCreateInput = z.infer<typeof sanctionCreateSchema>;
