import type { LeadStatus, LoanProduct } from "./types";

export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["QUALIFIED", "LOST"],
  QUALIFIED: ["CONVERTED", "LOST"],
  CONVERTED: [],
  LOST: ["CONTACTED"],
};

export const PRODUCT_RATES: Record<LoanProduct, number> = {
  PERSONAL: 14.5,
  BUSINESS: 16.25,
  HOME: 9.5,
  VEHICLE: 11.25,
  GOLD: 12,
};

export const PRODUCT_TENURE: Record<LoanProduct, number> = {
  PERSONAL: 36,
  BUSINESS: 48,
  HOME: 180,
  VEHICLE: 60,
  GOLD: 12,
};

export function nextLeadStatuses(status: LeadStatus): LeadStatus[] {
  return LEAD_TRANSITIONS[status] ?? [];
}
