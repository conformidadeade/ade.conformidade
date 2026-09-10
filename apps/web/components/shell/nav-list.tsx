"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav-items";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";

/**
 * Lista de navegação — fonte única para a Sidebar (desktop) e o MobileNav
 * (adendo "Navegação e layout responsivo para mobile", 09/09/2026): mesmos
 * itens, mesma regra de visibilidade por papel (`NAV_ITEMS` de
 * `lib/nav-items.ts`, já compartilhada com a guarda de rota em
 * `(app)/layout.tsx`). Evita duas listas que podem divergir com o tempo.
 */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);

  const items = NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)));

  return (
    <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
