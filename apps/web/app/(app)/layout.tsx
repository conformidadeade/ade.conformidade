"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { api } from "@/lib/api/client";
import { canAccessRoute } from "@/lib/nav-items";
import { type SessionUser, useAuthStore } from "@/lib/stores/auth-store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [verified, setVerified] = useState(false);

  // Adendo "Segurança de sessão" (08/09/2026): a sessão de verdade mora no
  // cookie httpOnly, inacessível aqui — o `user` do localStorage só
  // acelera a primeira pintura. Por isso sempre revalidamos contra a API
  // no boot do app, cobrindo cookie expirado/revogado ou papel/vínculo
  // alterado desde o último acesso; nunca decidir acesso só pelo cache.
  useEffect(() => {
    if (!hasHydrated) return;
    api
      .get<{ user: SessionUser }>("/auth/me")
      .then((res) => setSession(res.user))
      .catch(() => {
        clearSession();
        router.replace("/login");
      })
      .finally(() => setVerified(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  useEffect(() => {
    if (!verified || !user) return;
    // Acesso direto por URL a uma tela fora do papel do usuário (ex.: um
    // ANALISTA digitando /usuarios) — redireciona para o Dashboard em vez
    // de mostrar erro cru (adendo "Acesso restrito", item 3). A garantia
    // de verdade é no backend (RolesGuard); isto é só navegação.
    if (!canAccessRoute(pathname, user.role)) {
      router.replace("/dashboard");
    }
  }, [verified, user, pathname, router]);

  if (!hasHydrated || !verified || !user || !canAccessRoute(pathname, user.role)) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
