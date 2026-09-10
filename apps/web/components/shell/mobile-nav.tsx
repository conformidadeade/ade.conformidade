"use client";

import { useState } from "react";
import Image from "next/image";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavList } from "./nav-list";

/**
 * Menu hambúrguer para mobile (adendo "Navegação e layout responsivo para
 * mobile", 09/09/2026, item 1) — só aparece abaixo do breakpoint `md`
 * (ver classe `md:hidden` no trigger); em telas `md`+ a Sidebar fixa
 * continua exatamente como antes, sem nenhuma mudança de comportamento.
 *
 * Painel deslizante lateral sobre o mesmo primitivo Radix Dialog já usado
 * em `components/ui/dialog.tsx` (evita adicionar uma dependência nova só
 * para isto) — overlay + Escape + clique fora já fecham de graça; o
 * fechamento ao navegar é feito manualmente via `onNavigate` (não é
 * comportamento padrão do Dialog, que não sabe que um clique em `<Link>`
 * deveria contar como "fechar").
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir menu" className="md:hidden">
          <Menu className="size-5" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 md:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border md:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
        >
          <DialogPrimitive.Title className="sr-only">Menu de navegação</DialogPrimitive.Title>
          <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border shrink-0">
            <Image src="/brand/ade-logo.png" alt="ADE" width={32} height={32} className="rounded-full shrink-0" />
            <span className="font-semibold text-sm flex-1">ADE</span>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar menu">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <NavList onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
