"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import type { CombinationStatus } from "@reanalise-erp/types";
import { ApiError, api } from "@/lib/api/client";
import { useAnalysts, useClients, useMediaChannels } from "@/lib/hooks/use-catalog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface RegisterReturnResult {
  combinationId: string;
  status: CombinationStatus;
  events: { type: string }[];
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function DevolucoesPage() {
  const queryClient = useQueryClient();
  const { data: clients } = useClients();
  const { data: mediaChannels } = useMediaChannels();
  const { data: analysts } = useAnalysts();

  const [form, setForm] = useState({
    analystId: "",
    clientId: "",
    mediaChannelId: "",
    piNumber: "",
    reason: "",
    observation: "",
    occurredAt: todayIso(),
  });

  const mutation = useMutation({
    mutationFn: () => api.post<RegisterReturnResult>("/release/returns", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["combinations"] });
      setForm((f) => ({ ...f, piNumber: "", reason: "", observation: "" }));
    },
  });

  const canSubmit =
    form.analystId && form.clientId && form.mediaChannelId && form.piNumber && form.reason && form.occurredAt;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Devoluções</h1>
        <p className="text-sm text-muted-foreground">
          O sistema identifica automaticamente a situação atual da combinação e aplica a regra correspondente —
          zera a construção vigente, ou soma na regra de retorno mensal se já estiver liberada. O nº do PI é
          sempre aceito, mesmo quando o processo nunca passou pela reanálise (caso comum para combinações já
          liberadas) — o vínculo com um lançamento existente, quando houver, é feito automaticamente.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div className="flex flex-col gap-1.5">
                <Label>Analista</Label>
                <Select value={form.analystId} onValueChange={(v) => setForm((f) => ({ ...f, analystId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {analysts?.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="piNumber">Nº do PI</Label>
                <Input
                  id="piNumber"
                  value={form.piNumber}
                  onChange={(e) => setForm((f) => ({ ...f, piNumber: e.target.value }))}
                  placeholder="Sempre aceito, mesmo sem processo lançado"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="occurredAt">Data</Label>
                <Input
                  id="occurredAt"
                  type="date"
                  value={form.occurredAt}
                  onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reason">Motivo</Label>
                <Input
                  id="reason"
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="observation">Observação</Label>
              <Textarea
                id="observation"
                value={form.observation}
                onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))}
              />
            </div>

            {mutation.isError && (
              <p className="text-sm text-destructive">
                {mutation.error instanceof ApiError ? mutation.error.message : "Erro ao registrar a devolução."}
              </p>
            )}

            {mutation.isSuccess && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
                {mutation.data.events.some((e) => e.type === "AUTO_RETURN") ? (
                  <>
                    <AlertTriangle className="size-4 text-destructive shrink-0" />
                    <span>
                      Devolução registrada — esta foi a 2ª devolução do mês e a combinação{" "}
                      <strong>retornou à reanálise</strong>.
                    </span>
                  </>
                ) : (
                  <span>
                    Devolução registrada. Status atual: <StatusBadge status={mutation.data.status} />
                  </span>
                )}
              </div>
            )}

            <Button type="submit" disabled={!canSubmit || mutation.isPending} className="self-start">
              Registrar devolução
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
