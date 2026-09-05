"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  Settings2,
  Undo2,
  Users,
} from "lucide-react";
import type { UserRole } from "@reanalise-erp/types";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[]; // undefined = todos os perfis autenticados
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/mapa", label: "Mapa de Liberação", icon: MapIcon },
  { href: "/mapa-habilidades", label: "Mapa de Habilidades", icon: GraduationCap },
  { href: "/lancamentos", label: "Lançamento de Processos", icon: ClipboardList, roles: ["LIDERANCA", "ADMINISTRADOR"] },
  { href: "/devolucoes", label: "Devoluções", icon: Undo2, roles: ["LIDERANCA", "ADMINISTRADOR"] },
  { href: "/diretrizes", label: "Diretrizes", icon: ListChecks, roles: ["LIDERANCA", "ADMINISTRADOR"] },
  { href: "/cadastros", label: "Cadastros", icon: Settings2, roles: ["LIDERANCA", "ADMINISTRADOR"] },
  { href: "/usuarios", label: "Usuários", icon: Users, roles: ["ADMINISTRADOR"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);

  const items = NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)));

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
        <div className="size-7 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center text-sm font-bold">
          R
        </div>
        <span className="font-semibold text-sm">ADE</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
    </aside>
  );
}
