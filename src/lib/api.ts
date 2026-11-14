import axios, { AxiosError } from "axios";

export class ApiClientError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 20_000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: { code?: string; message?: string; details?: unknown } }>) => {
    const status = error.response?.status ?? 0;
    const code = error.response?.data?.error?.code ?? "NETWORK_ERROR";
    const message =
      error.response?.data?.error?.message ??
      (status === 0 ? "Network unavailable. Please check your connection." : "Request failed. Please retry.");

    if (status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?expired=1&next=${next}`);
    }

    return Promise.reject(new ApiClientError(status, code, message));
  },
);

export function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please retry.";
}

export async function getJson<T>(url: string, params?: Record<string, string | number | undefined>) {
  const response = await api.get<T>(url, { params });
  return response.data;
}

export async function postJson<T>(url: string, body?: unknown) {
  const response = await api.post<T>(url, body);
  return response.data;
}

export async function patchJson<T>(url: string, body?: unknown) {
  const response = await api.patch<T>(url, body);
  return response.data;
}

export async function putJson<T>(url: string, body?: unknown) {
  const response = await api.put<T>(url, body);
  return response.data;
}
