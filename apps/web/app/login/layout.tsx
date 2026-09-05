import type { Metadata } from "next";

// app/login/page.tsx é Client Component ("use client"), que não pode exportar
// `metadata` — por isso o nome completo do sistema fica neste layout, que
// só existe para isso (a tela de login é onde o nome completo faz sentido).
export const metadata: Metadata = {
  // `absolute` ignora o template "%s · ADE" do layout raiz — senão o título
  // virava "ADE — Administração de Dados e Estratégias · ADE" (duplicado).
  title: { absolute: "ADE — Administração de Dados e Estratégias" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
