import { patchJson, postJson } from "@/lib/api";
import type { CollectionStatus } from "@/lib/types";
import type {
  CollectionMutationResult,
  RecordRepaymentResult,
  RepaymentMode,
} from "@/server/collections";

export type LogContactInput = { note: string; nextActionAt?: string | null };
export type SetPtpInput = { ptpAmount: number; ptpDate: string };
export type MoveStatusInput = Extract<CollectionStatus, "RECOVERY" | "LEGAL">;

export const collectionsService = {
  logContact(caseId: string, input: LogContactInput) {
    return patchJson<CollectionMutationResult>(`/collections/${caseId}`, {
      action: "LOG_CONTACT",
      ...input,
    });
  },
  setPtp(caseId: string, input: SetPtpInput) {
    return patchJson<CollectionMutationResult>(`/collections/${caseId}`, {
      action: "SET_PTP",
      ...input,
    });
  },
  moveStatus(caseId: string, status: MoveStatusInput) {
    return patchJson<CollectionMutationResult>(`/collections/${caseId}`, {
      action: "MOVE_STATUS",
      status,
    });
  },
  resolve(caseId: string, note: string) {
    return patchJson<CollectionMutationResult>(`/collections/${caseId}`, {
      action: "RESOLVE",
      note,
    });
  },
  recordRepayment(repaymentId: string, mode: RepaymentMode) {
    return postJson<RecordRepaymentResult>(`/repayments/${repaymentId}`, { mode });
  },
};
