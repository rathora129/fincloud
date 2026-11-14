import { patchJson, postJson } from "@/lib/api";

export type BlacklistEntryInput = {
  name: string;
  pan?: string;
  phone: string;
  reason: string;
  source: "Internal review" | "Collections" | "Credit" | "Operations" | "Branch";
};

export type GrievanceStatus = "OPEN" | "IN_REVIEW" | "RESOLVED";

export type GrievanceUpdateInput = {
  status: GrievanceStatus;
  note?: string;
};

export async function addBlacklistEntry(input: BlacklistEntryInput) {
  return postJson<{ entry: { id: string } }>("/blacklist", input);
}

export async function updateGrievance(id: string, input: GrievanceUpdateInput) {
  return patchJson<{ grievance: { id: string; status: GrievanceStatus } }>(`/grievances/${id}`, input);
}
