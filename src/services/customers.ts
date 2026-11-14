import { getJson } from "@/lib/api";
import type {
  CustomerCounts,
  CustomerDetailView,
  CustomerListItem,
} from "@/server/customers";

export type CustomerWorkspaceResponse = {
  items: CustomerListItem[];
  counts: CustomerCounts;
  branches: { id: string; name: string }[];
};

export type CustomerQuery = {
  tab?: string;
  q?: string;
  kyc?: string;
  branch?: string;
  employment?: string;
};

export function fetchCustomers(query: CustomerQuery) {
  return getJson<CustomerWorkspaceResponse>("/customers", query);
}

export function fetchCustomer(id: string) {
  return getJson<CustomerDetailView>(`/customers/${id}`);
}
