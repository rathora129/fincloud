import { patchJson } from "@/lib/api";
import type { ApplicationStatus, DisbursementStatus } from "@/lib/types";

export type DisbursementAction = "PROCESS" | "RECOMMEND" | "AUTHORIZE" | "COMPLETE" | "REJECT";

export type DisbursementActionPayload = {
  action: DisbursementAction;
  remarks?: string;
};

export type DisbursementActionResult = {
  id: string;
  ref: string;
  status: DisbursementStatus;
  bankRef: string | null;
  processedAt: string | null;
  loanAccountRef: string | null;
  applicationStatus: ApplicationStatus | null;
  scheduleCount: number;
};

export async function applyDisbursementAction(id: string, payload: DisbursementActionPayload) {
  const response = await patchJson<{ item: DisbursementActionResult }>(`/disbursements/${id}`, payload);
  return response.item;
}
