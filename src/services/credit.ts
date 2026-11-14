import { postJson } from "@/lib/api";
import type { ApplicationStatus } from "@/lib/types";

export type CreditDecisionChoice = "APPROVE" | "REJECT" | "SEND_BACK";
export type RiskBand = "LOW" | "MEDIUM" | "HIGH";

export type CreditDecisionPayload = {
  decision: CreditDecisionChoice;
  approvedAmount?: number;
  riskBand?: RiskBand;
  remarks?: string;
};

export type CreditDecisionResult = {
  id: string;
  ref: string;
  status: ApplicationStatus;
  decision: CreditDecisionChoice;
  approvedAmount: number | null;
  riskBand: RiskBand | null;
  sentBackReason: string | null;
  decidedAt: string;
  decidedByName: string;
};

export async function decideCredit(id: string, payload: CreditDecisionPayload) {
  const response = await postJson<{ item: CreditDecisionResult }>(`/credit/${id}/decision`, payload);
  return response.item;
}
