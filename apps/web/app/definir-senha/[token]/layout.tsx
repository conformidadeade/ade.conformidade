import type { Metadata } from "next";

// page.tsx é Client Component ("use client"), que não pode exportar
// `metadata` — mesmo padrão de app/login/layout.tsx.
export const metadata: Metadata = {
  title: { absolute: "Definir senha — ADE" },
};

export default function DefinirSenhaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
