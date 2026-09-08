"use client";

import type { UserRole } from "@reanalise-erp/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Analyst vinculado ao login (adendo "Acesso restrito", item 2) — null se ainda não vinculado. */
  analystId: string | null;
}

interface AuthState {
  user: SessionUser | null;
  hasHydrated: boolean;
  setSession: (user: SessionUser) => void;
  clearSession: () => void;
}

/**
 * Adendo "Segurança de sessão: migrar de localStorage para cookie httpOnly
 * + CSRF" (08/09/2026) — a sessão de verdade agora vive em cookies
 * httpOnly (ver apps/api/src/auth/auth-cookies.ts), inacessíveis a este
 * código por design (mitiga roubo de token via XSS, necessário porque o
 * sistema vai ter acesso externo). O que fica em localStorage aqui é só
 * uma cópia de exibição do usuário para hidratar a UI instantaneamente
 * (evita uma tela em branco enquanto a primeira chamada de rede resolve);
 * a fonte de verdade é sempre revalidada via GET /auth/me no boot do app
 * (ver app/(app)/layout.tsx) — nunca confiar só nesta cópia para decidir
 * acesso.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hasHydrated: false,
      setSession: (user) => set({ user }),
      clearSession: () => set({ user: null }),
    }),
    {
      name: "reanalise-erp-auth",
      onRehydrateStorage: () => (state) => {
        if (state) state.hasHydrated = true;
      },
    },
  ),
);
