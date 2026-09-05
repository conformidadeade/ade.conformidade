"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { canAccessRoute } from "@/lib/nav-items";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    // Acesso direto por URL a uma tela fora do papel do usuário (ex.: um
    // ANALISTA digitando /usuarios) — redireciona para o Dashboard em vez
    // de mostrar erro cru (adendo "Acesso restrito", item 3). A garantia
    // de verdade é no backend (RolesGuard); isto é só navegação.
    if (!canAccessRoute(pathname, role)) {
      router.replace("/dashboard");
    }
  }, [hasHydrated, accessToken, pathname, role, router]);

  if (!hasHydrated || !accessToken || !canAccessRoute(pathname, role)) return null;

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
