import { getJson, patchJson, postJson } from "@/lib/api";
import type { ApplicationActionInput, ApplicationCreateValues } from "@/lib/validation/applications";
import type {
  ApplicationCounts,
  ApplicationDetailView,
  ApplicationListItem,
  ApplicationOptions,
} from "@/server/applications";

export type ApplicationWorkspaceResponse = {
  items: ApplicationListItem[];
  counts: ApplicationCounts;
  options: ApplicationOptions;
};

export type ApplicationQuery = {
  tab?: string;
  q?: string;
  status?: string;
  product?: string;
  owner?: string;
  branch?: string;
  from?: string;
  to?: string;
};

export function fetchApplications(query: ApplicationQuery) {
  return getJson<ApplicationWorkspaceResponse>("/applications", query);
}

export function fetchApplication(id: string) {
  return getJson<ApplicationDetailView>(`/applications/${id}`);
}

export function createApplicationRequest(input: ApplicationCreateValues) {
  return postJson<{ id: string; ref: string }>("/applications", input);
}

export function applicationActionRequest(id: string, action: ApplicationActionInput) {
  return patchJson<{ ok: boolean }>(`/applications/${id}`, action);
}
