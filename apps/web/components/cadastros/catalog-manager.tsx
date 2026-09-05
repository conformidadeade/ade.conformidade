"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { ApiError, api } from "@/lib/api/client";
import type { AnalystEntry, CatalogEntry } from "@/lib/api/types";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Entry = CatalogEntry & Partial<Pick<AnalystEntry, "registration">>;

interface CatalogManagerProps {
  apiPath: "clients" | "media-channels" | "analysts";
  entityLabel: string;
  withRegistration?: boolean;
  /**
   * Exibe o botão "Editar" (adendo "Acesso restrito", item 4). O endpoint
   * PATCH já existe para os três cadastros, mas por ora só é oferecido na
   * aba de Analistas — habilitar para Clientes/Meios depende de
   * confirmação (ver mensagem de fechamento do adendo).
   */
  withEdit?: boolean;
}

export function CatalogManager({ apiPath, entityLabel, withRegistration, withEdit }: CatalogManagerProps) {
  const queryClient = useQueryClient();
  const queryKey = [apiPath, "includeInactive"];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<Entry[]>(`/${apiPath}?includeInactive=true`),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", notes: "", registration: "" });
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<Entry | null>(null);
  const [editForm, setEditForm] = useState({ name: "", notes: "", registration: "" });
  const [editError, setEditError] = useState<string | null>(null);

  const [inactivateTarget, setInactivateTarget] = useState<Entry | null>(null);
  const [inactivateReason, setInactivateReason] = useState("");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: [apiPath] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Entry>(`/${apiPath}`, {
        name: createForm.name,
        notes: createForm.notes || undefined,
        ...(withRegistration ? { registration: createForm.registration || undefined } : {}),
      }),
    onSuccess: () => {
      invalidateAll();
      setCreateOpen(false);
      setCreateForm({ name: "", notes: "", registration: "" });
      setCreateError(null);
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : "Erro ao criar cadastro."),
  });

  const editMutation = useMutation({
    mutationFn: () =>
      api.patch<Entry>(`/${apiPath}/${editTarget!.id}`, {
        name: editForm.name,
        notes: editForm.notes || undefined,
        ...(withRegistration ? { registration: editForm.registration || undefined } : {}),
      }),
    onSuccess: () => {
      invalidateAll();
      setEditTarget(null);
      setEditError(null);
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "Erro ao salvar."),
  });

  function openEdit(entry: Entry) {
    setEditTarget(entry);
    setEditForm({ name: entry.name, notes: entry.notes ?? "", registration: entry.registration ?? "" });
    setEditError(null);
  }

  const inactivateMutation = useMutation({
    mutationFn: () =>
      api.post(`/${apiPath}/${inactivateTarget!.id}/inactivate`, { reason: inactivateReason }),
    onSuccess: () => {
      invalidateAll();
      setInactivateTarget(null);
      setInactivateReason("");
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/${apiPath}/${id}/activate`),
    onSuccess: invalidateAll,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              Novo {entityLabel.toLowerCase()}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo {entityLabel.toLowerCase()}</DialogTitle>
              <DialogDescription>Cadastro nunca é excluído fisicamente — apenas inativado.</DialogDescription>
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
                  autoFocus
                />
              </div>
              {withRegistration && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="registration">Matrícula / sigla</Label>
                  <Input
                    id="registration"
                    value={createForm.registration}
                    onChange={(e) => setCreateForm((f) => ({ ...f, registration: e.target.value }))}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Observações</Label>
                <Input
                  id="notes"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
              <DialogFooter>
                <Button type="submit" disabled={!createForm.name || createMutation.isPending}>
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
            {withRegistration && <TableHead>Matrícula</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                Carregando…
              </TableCell>
            </TableRow>
          )}
          {data?.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium">{entry.name}</TableCell>
              {withRegistration && <TableCell>{entry.registration ?? "—"}</TableCell>}
              <TableCell>
                <Badge variant={entry.active ? "success" : "outline"}>{entry.active ? "Ativo" : "Inativo"}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {withEdit && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(entry)}>
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                  )}
                  {entry.active ? (
                    <Button variant="outline" size="sm" onClick={() => setInactivateTarget(entry)}>
                      Inativar
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => activateMutation.mutate(entry.id)}>
                      Reativar
                    </Button>
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
            <DialogDescription>Ativar/inativar tem seu próprio botão e exige motivo à parte.</DialogDescription>
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
            {withRegistration && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-registration">Matrícula / sigla</Label>
                <Input
                  id="edit-registration"
                  value={editForm.registration}
                  onChange={(e) => setEditForm((f) => ({ ...f, registration: e.target.value }))}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-notes">Observações</Label>
              <Input
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={!editForm.name || editMutation.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!inactivateTarget} onOpenChange={(open) => !open && setInactivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inativar {inactivateTarget?.name}</DialogTitle>
            <DialogDescription>
              O cadastro deixa de aparecer nas listas de lançamento, mas todo o histórico associado é preservado.
              Informe o motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inactivate-reason">Motivo</Label>
            <Input
              id="inactivate-reason"
              value={inactivateReason}
              onChange={(e) => setInactivateReason(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!inactivateReason || inactivateMutation.isPending}
              onClick={() => inactivateMutation.mutate()}
            >
              Confirmar inativação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
