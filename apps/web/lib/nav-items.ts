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

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[]; // undefined = todos os perfis autenticados
}

/**
 * Fonte única para o menu (Sidebar) e para a guarda de rota
 * ((app)/layout.tsx) — evita as duas listas divergirem (adendo "Acesso
 * restrito", item 3). Um ANALISTA só tem 3 itens sem `roles` aqui: Mapa,
 * Mapa de Habilidades e Dashboard.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/mapa", label: "Mapa de Liberação", icon: MapIcon },
  { href: "/mapa-habilidades", label: "Mapa de Habilidades", icon: GraduationCap },
  { href: "/lancamentos", label: "Lançamento de Processos", icon: ClipboardList, roles: ["LIDERANCA", "ADMINISTRADOR"] },
  { href: "/devolucoes", label: "Devoluções", icon: Undo2, roles: ["LIDERANCA", "ADMINISTRADOR"] },
  { href: "/diretrizes", label: "Diretrizes", icon: ListChecks, roles: ["LIDERANCA", "ADMINISTRADOR"] },
  { href: "/cadastros", label: "Cadastros", icon: Settings2, roles: ["LIDERANCA", "ADMINISTRADOR"] },
  { href: "/usuarios", label: "Usuários", icon: Users, roles: ["ADMINISTRADOR"] },
];

/** true se o papel pode acessar a rota (correspondência pelo prefixo do href). */
export function canAccessRoute(pathname: string, role: UserRole | undefined): boolean {
  const item = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (!item) return true; // rota fora do menu (ex.: /login) — guarda de acesso não se aplica aqui
  return !item.roles || (!!role && item.roles.includes(role));
}
