"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CombinationStatus, CombinationSummary } from "@reanalise-erp/types";
import { api } from "@/lib/api/client";
import { useAnalysts, useClients, useMediaChannels } from "@/lib/hooks/use-catalog";
import { CycleDrilldownDialog } from "@/components/combinations/cycle-drilldown-dialog";
import { ExportButtons } from "@/components/export-buttons";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const QUICK_FILTERS: { label: string; status?: CombinationStatus }[] = [
  { label: "Todos" },
  { label: "Liberados", status: "LIBERADO" },
  { label: "Em construção", status: "EM_CONSTRUCAO" },
  { label: "Retornados", status: "RETORNADO" },
];

const ALL = "__all__";

export default function MapaLiberacaoPage() {
  const [clientId, setClientId] = useState<string>(ALL);
  const [mediaChannelId, setMediaChannelId] = useState<string>(ALL);
  const [analystId, setAnalystId] = useState<string>(ALL);
  const [status, setStatus] = useState<CombinationStatus | undefined>(undefined);
  const [drilldown, setDrilldown] = useState<{ id: string; label: string } | null>(null);

  const { data: clients } = useClients();
  const { data: mediaChannels } = useMediaChannels();
  const { data: analysts } = useAnalysts();

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (clientId !== ALL) params.set("clientId", clientId);
    if (mediaChannelId !== ALL) params.set("mediaChannelId", mediaChannelId);
    if (analystId !== ALL) params.set("analystId", analystId);
    if (status) params.set("status", status);
    return params.toString();
  }, [clientId, mediaChannelId, analystId, status]);

  const { data, isLoading } = useQuery({
    queryKey: ["combinations", query],
    queryFn: () => api.get<CombinationSummary[]>(`/combinations?${query}`),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Mapa de Liberação de Reanálise</h1>
          <p className="text-sm text-muted-foreground">
            Situação de todas as combinações Analista + Cliente + Meio. Clique numa linha para ver os PIs do
            ciclo atual.
          </p>
        </div>
        <ExportButtons basePath="/combinations" baseFilename="mapa-liberacao" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map((f) => (
          <Button
            key={f.label}
            variant={status === f.status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatus(f.status)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os clientes</SelectItem>
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={mediaChannelId} onValueChange={setMediaChannelId}>
            <SelectTrigger>
              <SelectValue placeholder="Meio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os meios</SelectItem>
              {mediaChannels?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={analystId} onValueChange={setAnalystId}>
            <SelectTrigger>
              <SelectValue placeholder="Analista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os analistas</SelectItem>
              {analysts?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Analista</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Meio</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Construção</TableHead>
                <TableHead className="text-right">Faltantes</TableHead>
                <TableHead className="text-right">Devoluções no mês</TableHead>
                <TableHead>Última movimentação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhuma combinação encontrada para os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
              {data?.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    setDrilldown({
                      id: row.id,
                      label: `${row.analystName} · ${row.clientName} · ${row.mediaChannelName}`,
                    })
                  }
                >
                  <TableCell className="font-medium">{row.analystName}</TableCell>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell>{row.mediaChannelName}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.constructionCount}/{row.guidelineTarget || "?"}
                  </TableCell>
                  <TableCell
                    className={cn("text-right tabular-nums", row.missingCount === 0 && "text-muted-foreground")}
                  >
                    {row.status === "LIBERADO" ? "—" : row.missingCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.monthlyReturnCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.lastMovementAt ? new Date(row.lastMovementAt).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CycleDrilldownDialog
        combinationId={drilldown?.id ?? null}
        label={drilldown?.label ?? ""}
        onClose={() => setDrilldown(null)}
      />
    </div>
  );
}
