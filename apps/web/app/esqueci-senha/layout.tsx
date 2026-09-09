import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Esqueci minha senha — ADE" },
};

export default function EsqueciSenhaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
