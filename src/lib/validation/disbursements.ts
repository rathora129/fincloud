import { z } from "zod";
import { DISBURSEMENT_MODES } from "./sanctions";

export const disbursementCreateSchema = z.object({
  sanctionId: z.string().trim().min(1, "Select an approved sanction."),
  amount: z.coerce
    .number({ error: "Enter the disbursement amount." })
    .finite()
    .positive("Disbursement amount must be greater than zero.")
    .max(100_000_000, "Amount looks too high."),
  mode: z.enum(DISBURSEMENT_MODES),
  remarks: z.string().trim().max(600, "Remarks must be 600 characters or fewer.").optional(),
});

export type DisbursementCreateInput = z.infer<typeof disbursementCreateSchema>;
