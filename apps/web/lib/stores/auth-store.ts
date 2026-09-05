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
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  hasHydrated: boolean;
  setSession: (input: { accessToken: string; refreshToken: string; user: SessionUser }) => void;
  clearSession: () => void;
}

/**
 * Sessão de uso interno (item 21) guardada em localStorage via zustand
 * persist. Para uma exposição além de rede interna/VPN, o padrão de
 * cookies httpOnly + CSRF usado no leilao-erp é mais resistente a roubo de
 * token via XSS — ver docs/DECISIONS.md.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hasHydrated: false,
      setSession: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
      clearSession: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: "reanalise-erp-auth",
      onRehydrateStorage: () => (state) => {
        if (state) state.hasHydrated = true;
      },
    },
  ),
);
