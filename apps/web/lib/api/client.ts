"use client";

import { type SessionUser, useAuthStore } from "@/lib/stores/auth-store";

/**
 * Adendo "Deploy em produção" (09/09/2026) — revisão de 09/09/2026: URL
 * ABSOLUTA de novo (não mais um caminho relativo via proxy). A ideia
 * original era um proxy same-origin (`rewrites()` do Next.js repassando
 * `/api/*` pro Railway, escondendo do navegador que são domínios
 * diferentes) — abandonada depois de confirmado em produção que a Vercel
 * recusa fazer esse proxy pro range de IP do Railway
 * (`DNS_HOSTNAME_RESOLVED_PRIVATE`, limitação de infraestrutura entre os
 * dois provedores, não corrigível por configuração nossa).
 *
 * O navegador agora fala DIRETO com a API (`api.<domínio>`), uma origem
 * genuinamente diferente do frontend (`www.<domínio>`) — a sessão
 * continua funcionando porque o cookie é emitido com
 * `Domain=.<domínio-raiz>` (ver `apps/api/src/auth/auth-cookies.ts`),
 * válido para os dois subdomínios; e porque os dois são "same-site"
 * (mesmo domínio registrável), então `SameSite=Lax` no cookie continua
 * sendo enviado nessas chamadas sem precisar de `SameSite=None`. CORS
 * explícito no backend (`CORS_ORIGIN`) cobre a parte de origem cruzada.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";
const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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

/** Lê o cookie legível `XSRF-TOKEN` (a API o grava no login/refresh) para ecoar no header — ver CsrfGuard no backend. */
function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * A sessão vive só em cookies httpOnly — aqui não tocamos em token algum,
 * mas ainda assim atualizamos o `user` em cache com o que a API acabou de
 * devolver (nunca o cache antigo do store): é o que faz um vínculo
 * Analyst feito pelo admin em outra aba aparecer sem precisar de
 * logout/login manual (adendo "Acesso restrito", item 2), mesmo quando a
 * atualização acontece via este refresh silencioso em vez do boot do app.
 */
async function refreshSession(): Promise<boolean> {
  const csrfToken = readCsrfToken();
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : undefined,
  });
  if (!response.ok) {
    useAuthStore.getState().clearSession();
    return false;
  }
  const data = (await response.json()) as { user: SessionUser };
  useAuthStore.getState().setSession(data.user);
  return true;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { body, skipAuth, headers, method, ...rest } = options;
  const csrfToken = readCsrfToken();
  const isMutating = MUTATING_METHODS.has((method ?? "GET").toUpperCase());

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(isMutating && csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
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
  const csrfToken = readCsrfToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : undefined,
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

/** Baixa um arquivo autenticado (exportações, item 4) e dispara o save do navegador. */
async function downloadFile(path: string, filename: string, isRetry = false): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include" });

  if (response.status === 401 && !isRetry) {
    refreshPromise ??= refreshSession().finally(() => {
      refreshPromise = null;
    });
    const refreshed = await refreshPromise;
    if (refreshed) return downloadFile(path, filename, true);
  }

  if (!response.ok) {
    const text = await response.text();
    let message = response.statusText;
    try {
      message = JSON.parse(text)?.message ?? message;
    } catch {
      /* corpo não era JSON — mantém statusText */
    }
    throw new ApiError(response.status, message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  postFile: <T>(path: string, formData: FormData) => postFile<T>(path, formData),
  download: (path: string, filename: string) => downloadFile(path, filename),
};
