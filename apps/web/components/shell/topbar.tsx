"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/stores/auth-store";
import { ThemeToggle } from "./theme-toggle";

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: "Administrador",
  LIDERANCA: "Liderança",
  ANALISTA: "Analista",
};

export function Topbar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {user && (
          <div className="hidden sm:flex flex-col items-end leading-tight mr-1">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</span>
          </div>
        )}
        <Button variant="ghost" size="icon" aria-label="Sair" onClick={handleLogout}>
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
