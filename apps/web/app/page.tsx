"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function RootPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!hasHydrated) return;
    // Só um chute rápido a partir do cache local — se estiver errado (ex.:
    // cookie expirou), o AuthGuard de app/(app)/layout.tsx corrige.
    router.replace(user ? "/dashboard" : "/login");
  }, [hasHydrated, user, router]);

  return null;
}
