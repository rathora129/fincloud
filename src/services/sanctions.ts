import { patchJson, postJson } from "@/lib/api";
import type { ApplicationStatus, SanctionStatus } from "@/lib/types";

export type SanctionAction = "ACCEPT" | "APPROVE" | "REJECT";

export type SanctionActionPayload = {
  action: SanctionAction;
  remarks?: string;
};

export type SanctionActionResult = {
  id: string;
  ref: string;
  status: SanctionStatus;
  decidedAt: string | null;
  approvedByName: string | null;
  applicationStatus: ApplicationStatus | null;
};

export async function applySanctionAction(id: string, payload: SanctionActionPayload) {
  const response = await patchJson<{ item: SanctionActionResult }>(`/sanctions/${id}`, payload);
  return response.item;
}

export type SanctionCreatePayload = {
  applicationId: string;
  approvedAmount: number;
  interestRate: number;
  tenureMonths: number;
  processingFee?: number;
  disbursementMode: "NEFT" | "IMPS" | "UPI";
  remarks?: string;
};

export type SanctionCreateResult = {
  id: string;
  ref: string;
  status: SanctionStatus;
  applicationId: string;
  applicationRef: string;
  approvedAmount: number;
  interestRate: number;
  tenureMonths: number;
};

export async function createSanction(payload: SanctionCreatePayload) {
  const response = await postJson<{ item: SanctionCreateResult }>("/sanctions", payload);
  return response.item;
}
