"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PartyPopper } from "lucide-react";
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

interface RegisterProcessResult {
  combinationId: string;
  status: CombinationStatus;
  events: { type: string }[];
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function LancamentoProcessosPage() {
  const queryClient = useQueryClient();
  const { data: clients } = useClients();
  const { data: mediaChannels } = useMediaChannels();
  const { data: analysts } = useAnalysts();

  const [form, setForm] = useState({
    analystId: "",
    clientId: "",
    mediaChannelId: "",
    piNumber: "",
    analysisDate: todayIso(),
    result: "CORRETO" as "CORRETO" | "INCORRETO",
    observation: "",
  });
  const [duplicateInfo, setDuplicateInfo] = useState<{ existingProcessId: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (allowDuplicate?: boolean) =>
      api.post<RegisterProcessResult>("/release/processes", { ...form, allowDuplicate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["combinations"] });
      setForm((f) => ({ ...f, piNumber: "", observation: "" }));
      setDuplicateInfo(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.statusCode === 409 && err.body && typeof err.body === "object") {
        const body = err.body as { existingProcessId?: string };
        if (body.existingProcessId) {
          setDuplicateInfo({ existingProcessId: body.existingProcessId });
          return;
        }
      }
    },
  });

  const canSubmit = form.analystId && form.clientId && form.mediaChannelId && form.piNumber && form.analysisDate;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Lançamento de Processos</h1>
        <p className="text-sm text-muted-foreground">
          Ao lançar um processo correto, a construção da combinação é atualizada automaticamente — e ela é
          liberada sozinha ao atingir a diretriz.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(undefined);
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
                <Label htmlFor="piNumber">PI / nº do processo</Label>
                <Input
                  id="piNumber"
                  value={form.piNumber}
                  onChange={(e) => setForm((f) => ({ ...f, piNumber: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="analysisDate">Data da análise</Label>
                <Input
                  id="analysisDate"
                  type="date"
                  value={form.analysisDate}
                  onChange={(e) => setForm((f) => ({ ...f, analysisDate: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Resultado</Label>
                <Select
                  value={form.result}
                  onValueChange={(v) => setForm((f) => ({ ...f, result: v as "CORRETO" | "INCORRETO" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CORRETO">Correto</SelectItem>
                    <SelectItem value="INCORRETO">Incorreto</SelectItem>
                  </SelectContent>
                </Select>
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

            {duplicateInfo && (
              <div className="rounded-md border border-warning bg-warning/10 p-3 text-sm">
                <p className="mb-2">
                  Já existe um processo lançado com o mesmo PI, combinação e data de análise. Confirme se este é
                  um reprocessamento legítimo antes de continuar (item 23).
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => mutation.mutate(true)}>
                  Confirmar mesmo assim
                </Button>
              </div>
            )}

            {mutation.isError && !duplicateInfo && (
              <p className="text-sm text-destructive">
                {mutation.error instanceof ApiError ? mutation.error.message : "Erro ao lançar o processo."}
              </p>
            )}

            {mutation.isSuccess && (
              <div className="flex items-center gap-2 rounded-md border border-success bg-success/10 p-3 text-sm">
                {mutation.data.status === "LIBERADO" && mutation.data.events.some((e) => e.type === "RELEASED") ? (
                  <>
                    <PartyPopper className="size-4 text-success shrink-0" />
                    <span>Processo lançado — a combinação atingiu a diretriz e foi liberada automaticamente!</span>
                  </>
                ) : (
                  <span>
                    Processo lançado. Status atual: <StatusBadge status={mutation.data.status} />
                  </span>
                )}
              </div>
            )}

            <Button type="submit" disabled={!canSubmit || mutation.isPending} className="self-start">
              Lançar processo
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
