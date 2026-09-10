"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { ApiError, api } from "@/lib/api/client";
import { useClients, useGuidelines, useMediaChannels } from "@/lib/hooks/use-catalog";
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

export default function DiretrizesPage() {
  const queryClient = useQueryClient();
  const { data: guidelines, isLoading } = useGuidelines();
  const { data: clients } = useClients();
  const { data: mediaChannels } = useMediaChannels();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ clientId: "", mediaChannelId: "", targetCount: "", returnLimit: "2", reason: "" });
  const [error, setError] = useState<string | null>(null);

  const existing = guidelines?.find(
    (g) => g.clientId === form.clientId && g.mediaChannelId === form.mediaChannelId,
  );

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/guidelines", {
        clientId: form.clientId,
        mediaChannelId: form.mediaChannelId,
        targetCount: Number(form.targetCount),
        returnLimit: Number(form.returnLimit),
        reason: form.reason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guidelines"] });
      setOpen(false);
      setForm({ clientId: "", mediaChannelId: "", targetCount: "", returnLimit: "2", reason: "" });
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erro ao salvar a diretriz."),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Configuração de Diretrizes</h1>
          <p className="text-sm text-muted-foreground">
            Quantidade de processos corretos necessária para liberação, por Cliente + Meio. Alterar nunca
            sobrescreve — encerra a diretriz vigente e cria uma nova versão, com efeito imediato.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0">
              <Plus className="size-4" />
              Nova / alterar diretriz
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Definir diretriz</DialogTitle>
              <DialogDescription>
                Selecione o Cliente + Meio. Se já houver uma diretriz vigente para o par, o motivo da alteração é
                obrigatório.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Cliente</Label>
                  <Select value={form.clientId} onValueChange={(v) => setForm((f) => ({ ...f, clientId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Meio</Label>
                  <Select
                    value={form.mediaChannelId}
                    onValueChange={(v) => setForm((f) => ({ ...f, mediaChannelId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {mediaChannels?.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {existing && (
                <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/40 p-2">
                  Diretriz vigente: {existing.targetCount} processos corretos, retorno após{" "}
                  {existing.returnLimit} devoluções no mês.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="targetCount">Quantidade necessária</Label>
                  <Input
                    id="targetCount"
                    type="number"
                    min={1}
                    value={form.targetCount}
                    onChange={(e) => setForm((f) => ({ ...f, targetCount: e.target.value }))}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="returnLimit">Devoluções/mês p/ retorno</Label>
                  <Input
                    id="returnLimit"
                    type="number"
                    min={1}
                    value={form.returnLimit}
                    onChange={(e) => setForm((f) => ({ ...f, returnLimit: e.target.value }))}
                    required
                  />
                </div>
              </div>

              {existing && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reason">Motivo da alteração</Label>
                  <Input
                    id="reason"
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    required
                  />
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={!form.clientId || !form.mediaChannelId || !form.targetCount || mutation.isPending}
                >
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Meio</TableHead>
            <TableHead className="text-right">Quantidade</TableHead>
            <TableHead className="text-right">Regra de devolução</TableHead>
            <TableHead>Vigente desde</TableHead>
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
          {guidelines?.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="font-medium">{g.client?.name}</TableCell>
              <TableCell>{g.mediaChannel?.name}</TableCell>
              <TableCell className="text-right tabular-nums">{g.targetCount}</TableCell>
              <TableCell className="text-right tabular-nums">{g.returnLimit}/mês</TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(g.effectiveFrom).toLocaleDateString("pt-BR")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
