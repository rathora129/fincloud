import { getJson, patchJson, postJson } from "@/lib/api";
import type { LeadActionInput, LeadFormValues } from "@/lib/validation/leads";
import type { LeadCounts, LeadDetailView, LeadListItem, LeadOptions } from "@/server/leads";

export type LeadWorkspaceResponse = {
  items: LeadListItem[];
  counts: LeadCounts;
  options: LeadOptions;
};

export type LeadQuery = {
  tab?: string;
  q?: string;
  status?: string;
  source?: string;
  owner?: string;
  branch?: string;
  from?: string;
  to?: string;
};

export function fetchLeads(query: LeadQuery) {
  return getJson<LeadWorkspaceResponse>("/leads", query);
}

export function fetchLead(id: string) {
  return getJson<LeadDetailView>(`/leads/${id}`);
}

export function createLeadRequest(input: LeadFormValues & { ownerId?: string; branchId?: string }) {
  return postJson<{ id: string; ref: string }>("/leads", input);
}

export function leadActionRequest(id: string, action: LeadActionInput) {
  return patchJson<{ ok?: boolean; applicationId?: string; applicationRef?: string }>(`/leads/${id}`, action);
}
