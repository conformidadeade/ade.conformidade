"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { ApiError, api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GENERIC_MESSAGE = "Se o e-mail existir em nosso sistema, enviamos as instruções de redefinição de senha.";

/**
 * "Esqueci minha senha" (adendo "Confirmação de e-mail e recuperação de
 * senha", 09/09/2026, item 2) — página pública. A resposta exibida ao
 * usuário é SEMPRE a mesma mensagem genérica, exista ou não a conta,
 * espelhando o que o backend faz (evita enumeração de contas cadastradas).
 * A única exceção é o limite de tentativas (429), que é um sinal
 * operacional legítimo de mostrar — não revela nada sobre a conta.
 */
export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post<void>("/auth/forgot-password", { email }, { skipAuth: true });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 429) {
        setError("Muitas tentativas em pouco tempo. Aguarde um pouco antes de tentar novamente.");
      } else {
        // Nunca expõe se o e-mail existe — mesmo num erro inesperado (ex.: falha de rede),
        // seguimos mostrando a mensagem genérica em vez de um erro técnico.
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center gap-2 pb-2">
          <Image src="/brand/ade-logo.png" alt="ADE" width={96} height={96} priority className="rounded-full mb-1" />
          <CardTitle className="text-lg">Esqueci minha senha</CardTitle>
          <CardDescription>Informe seu e-mail para receber as instruções de redefinição.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center gap-3 text-center py-2">
              <MailCheck className="size-10 text-emerald-600" />
              <p className="text-sm">{GENERIC_MESSAGE}</p>
              <Button asChild variant="outline" className="mt-1">
                <Link href="/login">
                  <ArrowLeft className="size-4" />
                  Voltar ao login
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="mt-1">
                {loading && <Loader2 className="size-4 animate-spin" />}
                Enviar instruções
              </Button>
              <Link href="/login" className="text-xs text-muted-foreground hover:underline text-center">
                Voltar ao login
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
