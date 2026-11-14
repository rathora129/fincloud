import { patchJson, postJson } from "@/lib/api";
import type { RoleCode } from "@/lib/types";

export type UserDto = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: RoleCode;
  designation: string;
  branchId: string;
  status: "ACTIVE" | "INACTIVE";
  avatarColor: string;
  lastLoginAt: string | null;
  createdAt: string;
  branchName: string;
  isSelf: boolean;
};

export type UserFormInput = {
  name: string;
  email: string;
  phone: string;
  role: RoleCode;
  designation: string;
  branchId: string;
};

export type UpdateUserPayload =
  | ({ action: "UPDATE" } & UserFormInput)
  | { action: "SET_STATUS"; status: "ACTIVE" | "INACTIVE" };

export async function createUser(input: UserFormInput) {
  return postJson<{ user: UserDto }>("/users", input);
}

export async function updateUser(id: string, input: UpdateUserPayload) {
  return patchJson<{ user: UserDto }>(`/users/${id}`, input);
}

export async function setUserStatus(id: string, status: "ACTIVE" | "INACTIVE") {
  return updateUser(id, { action: "SET_STATUS", status });
}
