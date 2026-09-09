"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { ApiError, api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Confirmação de convite (adendo "Confirmação de e-mail e recuperação de
 * senha", 09/09/2026, item 1) — página pública, sem sessão nenhuma: o
 * link vem do e-mail de convite enviado pelo backend
 * (`EmailService.sendInviteEmail`), no formato `/definir-senha/:token`.
 */
export default function DefinirSenhaPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      await api.post<void>("/auth/confirm-invite", { token: params.token, password }, { skipAuth: true });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível confirmar seu e-mail. Tente novamente em instantes.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center gap-2 pb-2">
          <Image src="/brand/ade-logo.png" alt="ADE" width={96} height={96} priority className="rounded-full mb-1" />
          <CardTitle className="text-lg">Definir senha</CardTitle>
          <CardDescription>Confirme seu e-mail e escolha uma senha para acessar o ADE.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="flex flex-col items-center gap-3 text-center py-2">
              <CheckCircle2 className="size-10 text-emerald-600" />
              <p className="text-sm">Senha definida com sucesso. Você já pode entrar.</p>
              <Button asChild className="mt-1">
                <Link href="/login">Ir para o login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="mt-1">
                {loading && <Loader2 className="size-4 animate-spin" />}
                Definir senha
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Link expirado ou já usado? Peça um novo convite ao administrador.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
