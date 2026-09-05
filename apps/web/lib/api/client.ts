"use client";

import { useAuthStore } from "@/lib/stores/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Não tenta refresh automático em 401 — usado pelo próprio login/refresh. */
  skipAuth?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const { refreshToken, setSession, clearSession, user } = useAuthStore.getState();
  if (!refreshToken) {
    clearSession();
    return false;
  }
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    clearSession();
    return false;
  }
  const data = (await response.json()) as {
    accessToken: string;
    refreshToken: string;
    user: SessionUserResponse;
  };
  setSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: user ?? { id: data.user.id, name: data.user.name, email: data.user.email, role: data.user.role },
  });
  return true;
}

interface SessionUserResponse {
  id: string;
  name: string;
  email: string;
  role: "ADMINISTRADOR" | "LIDERANCA" | "ANALISTA";
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { body, skipAuth, headers, ...rest } = options;
  const accessToken = useAuthStore.getState().accessToken;

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken && !skipAuth ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && !skipAuth && !isRetry) {
    refreshPromise ??= refreshSession().finally(() => {
      refreshPromise = null;
    });
    const refreshed = await refreshPromise;
    if (refreshed) {
      return request<T>(path, options, true);
    }
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const message = (data && typeof data === "object" && "message" in data ? String(data.message) : null) ?? response.statusText;
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

/** Upload multipart (ex.: importação de planilha) — sem Content-Type manual, o browser define o boundary. */
async function postFile<T>(path: string, formData: FormData, isRetry = false): Promise<T> {
  const accessToken = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: formData,
  });

  if (response.status === 401 && !isRetry) {
    refreshPromise ??= refreshSession().finally(() => {
      refreshPromise = null;
    });
    const refreshed = await refreshPromise;
    if (refreshed) return postFile<T>(path, formData, true);
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const message = (data && typeof data === "object" && "message" in data ? String(data.message) : null) ?? response.statusText;
    throw new ApiError(response.status, message, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  postFile: <T>(path: string, formData: FormData) => postFile<T>(path, formData),
};
