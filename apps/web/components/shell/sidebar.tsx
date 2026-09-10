import Image from "next/image";
import { NavList } from "./nav-list";

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
        <Image src="/brand/ade-logo.png" alt="ADE" width={32} height={32} className="rounded-full shrink-0" />
        <span className="font-semibold text-sm">ADE</span>
      </div>
      <NavList />
    </aside>
  );
}
