"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav-items";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);

  const items = NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)));

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
        <Image src="/brand/ade-logo.png" alt="ADE" width={32} height={32} className="rounded-full shrink-0" />
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
