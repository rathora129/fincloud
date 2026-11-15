import { patchJson, postJson } from "@/lib/api";
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

export type DisbursementCreatePayload = {
  sanctionId: string;
  amount: number;
  mode: "NEFT" | "IMPS" | "UPI";
  remarks?: string;
};

export type DisbursementCreateResult = {
  id: string;
  ref: string;
  status: DisbursementStatus;
  sanctionId: string;
  applicationId: string;
  amount: number;
  mode: "NEFT" | "IMPS" | "UPI";
};

export async function createDisbursement(payload: DisbursementCreatePayload) {
  const response = await postJson<{ item: DisbursementCreateResult }>("/disbursements", payload);
  return response.item;
}
