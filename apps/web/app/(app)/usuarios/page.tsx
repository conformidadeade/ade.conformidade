"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Pencil, Plus } from "lucide-react";
import type { UserRole } from "@reanalise-erp/types";
import { ApiError, api } from "@/lib/api/client";
import { useAnalysts } from "@/lib/hooks/use-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  analystId: string | null;
  /**
   * `null` = conta convidada, ainda sem senha (adendo "Confirmação de
   * e-mail e recuperação de senha", 09/09/2026) — o usuário ainda não
   * clicou no link do e-mail de convite.
   */
  emailConfirmedAt: string | null;
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMINISTRADOR: "Administrador",
  LIDERANCA: "Liderança",
  ANALISTA: "Analista",
};

const UNLINKED = "__none__";

/** Select de vínculo com Analyst — só faz sentido para o perfil ANALISTA (adendo "Acesso restrito", item 2). */
function AnalystLinkSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: analysts } = useAnalysts();
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Analista vinculado</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNLINKED}>Nenhum (desvinculado)</SelectItem>
          {analysts?.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Só um usuário pode estar vinculado a cada analista por vez.
      </p>
    </div>
  );
}

export default function UsuariosPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    role: "ANALISTA" as UserRole,
    analystId: UNLINKED,
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    role: "ANALISTA" as UserRole,
    analystId: UNLINKED,
    // Vazio = não altera a senha (adendo "Deploy limpo") — permite ao
    // Administrador redefinir a senha de qualquer usuário, inclusive a
    // própria, já que ainda não existe um fluxo de "trocar no primeiro login".
    newPassword: "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/users", {
        name: createForm.name,
        email: createForm.email,
        role: createForm.role,
        analystId: createForm.role === "ANALISTA" && createForm.analystId !== UNLINKED ? createForm.analystId : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", role: "ANALISTA", analystId: UNLINKED });
      setCreateError(null);
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : "Erro ao criar usuário."),
  });

  /** Botão "Reenviar convite" (adendo "Confirmação de e-mail...", item 1). */
  const [resendFeedback, setResendFeedback] = useState<{ id: string; message: string } | null>(null);
  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => api.post<void>(`/users/${id}/resend-invite`),
    onSuccess: (_data, id) => setResendFeedback({ id, message: "Convite reenviado." }),
    onError: (err, id) =>
      setResendFeedback({ id, message: err instanceof ApiError ? err.message : "Erro ao reenviar convite." }),
  });

  const editMutation = useMutation({
    mutationFn: () =>
      api.patch(`/users/${editTarget!.id}`, {
        name: editForm.name,
        role: editForm.role,
        analystId: editForm.role === "ANALISTA" ? (editForm.analystId === UNLINKED ? null : editForm.analystId) : undefined,
        ...(editForm.newPassword ? { password: editForm.newPassword } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditTarget(null);
      setEditError(null);
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "Erro ao salvar."),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/users/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  function openEdit(u: UserRow) {
    setEditTarget(u);
    setEditForm({ name: u.name, role: u.role, analystId: u.analystId ?? UNLINKED, newPassword: "" });
    setEditError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Usuários</h1>
          <p className="text-sm text-muted-foreground">Contas de acesso ao sistema — restrito a administradores.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0">
              <Plus className="size-4" />
              Novo usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo usuário</DialogTitle>
            </DialogHeader>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Perfil</Label>
                <Select value={createForm.role} onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v as UserRole }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANALISTA">Analista</SelectItem>
                    <SelectItem value="LIDERANCA">Liderança</SelectItem>
                    <SelectItem value="ADMINISTRADOR">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {createForm.role === "ANALISTA" && (
                <AnalystLinkSelect
                  value={createForm.analystId}
                  onChange={(v) => setCreateForm((f) => ({ ...f, analystId: v }))}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Sem senha por aqui: assim que o usuário for criado, um e-mail de convite é enviado para que a
                própria pessoa confirme o e-mail e defina a senha.
              </p>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  Criar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Perfil</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Carregando…
              </TableCell>
            </TableRow>
          )}
          {data?.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>{ROLE_LABELS[u.role]}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={u.active ? "success" : "outline"}>{u.active ? "Ativo" : "Inativo"}</Badge>
                  {!u.emailConfirmedAt && <Badge variant="outline">Convite pendente</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-col items-end gap-1">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive.mutate({ id: u.id, active: !u.active })}
                    >
                      {u.active ? "Desativar" : "Reativar"}
                    </Button>
                    {!u.emailConfirmedAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={resendInviteMutation.isPending}
                        onClick={() => resendInviteMutation.mutate(u.id)}
                      >
                        <Mail className="size-4" />
                        Reenviar convite
                      </Button>
                    )}
                  </div>
                  {resendFeedback?.id === u.id && (
                    <p className="text-xs text-muted-foreground">{resendFeedback.message}</p>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {editTarget?.name}</DialogTitle>
            <DialogDescription>Ativar/desativar tem seu próprio botão na listagem.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              editMutation.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Perfil</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as UserRole }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANALISTA">Analista</SelectItem>
                  <SelectItem value="LIDERANCA">Liderança</SelectItem>
                  <SelectItem value="ADMINISTRADOR">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editForm.role === "ANALISTA" && (
              <AnalystLinkSelect
                value={editForm.analystId}
                onChange={(v) => setEditForm((f) => ({ ...f, analystId: v }))}
              />
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-new-password">Nova senha</Label>
              <Input
                id="edit-new-password"
                type="password"
                value={editForm.newPassword}
                onChange={(e) => setEditForm((f) => ({ ...f, newPassword: e.target.value }))}
                placeholder="Deixe em branco para não alterar"
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">
                Caminho manual alternativo ao convite por e-mail (ex.: usuário perdeu acesso ao e-mail) — define a
                senha na hora e confirma o e-mail automaticamente, sem precisar do link.
              </p>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={editMutation.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
