"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardIndicators, ReturnOrigin } from "@reanalise-erp/types";
import { api } from "@/lib/api/client";
import { useAnalysts, useClients, useMediaChannels } from "@/lib/hooks/use-catalog";
import { useAuthStore } from "@/lib/stores/auth-store";
import { AnalystNotLinked } from "@/components/analyst-not-linked";
import { IndicatorCard } from "@/components/dashboard/indicator-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "__all__";

export default function DashboardPage() {
  const role = useAuthStore((s) => s.user?.role);
  const ownAnalystId = useAuthStore((s) => s.user?.analystId);
  const isAnalista = role === "ANALISTA";

  const [analystId, setAnalystId] = useState(ALL);
  const [clientId, setClientId] = useState(ALL);
  const [mediaChannelId, setMediaChannelId] = useState(ALL);
  const [origin, setOrigin] = useState(ALL);

  const { data: analysts } = useAnalysts();
  const { data: clients } = useClients();
  const { data: mediaChannels } = useMediaChannels();

  const query = useMemo(() => {
    const params = new URLSearchParams();
    // Para ANALISTA o backend ignora e sobrescreve isso de qualquer forma
    // (adendo "Acesso restrito", item 1) — nem enviamos o parâmetro.
    if (!isAnalista && analystId !== ALL) params.set("analystId", analystId);
    if (clientId !== ALL) params.set("clientId", clientId);
    if (mediaChannelId !== ALL) params.set("mediaChannelId", mediaChannelId);
    if (origin !== ALL) params.set("origin", origin);
    return params.toString();
  }, [analystId, clientId, mediaChannelId, origin, isAnalista]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", query],
    queryFn: () => api.get<DashboardIndicators>(`/dashboard${query ? `?${query}` : ""}`),
    enabled: !isAnalista || !!ownAnalystId,
  });

  const hasFilter =
    (!isAnalista && analystId !== ALL) || clientId !== ALL || mediaChannelId !== ALL || origin !== ALL;

  if (isAnalista && !ownAnalystId) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Indicadores acumulados desde o início do uso do sistema.</p>
        </div>
        <AnalystNotLinked />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Indicadores acumulados desde o início do uso do sistema.</p>
      </div>

      <Card>
        <CardContent className={cn("pt-5 grid grid-cols-1 gap-3", isAnalista ? "sm:grid-cols-3" : "sm:grid-cols-4")}>
          {!isAnalista && (
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
          )}
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
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger>
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as origens</SelectItem>
              <SelectItem value={"REANALISE" satisfies ReturnOrigin}>Reanálise</SelectItem>
              <SelectItem value={"CLIENTE" satisfies ReturnOrigin}>Cliente</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {hasFilter && (
            <p className="text-xs text-muted-foreground -mt-2">
              Indicadores recalculados para o recorte selecionado.
            </p>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* "Analistas ativos" é um número da empresa toda — não recalculado
               para o ANALISTA (ver observação sobre este indicador). */}
            {!isAnalista && <IndicatorCard label="Analistas ativos" value={data.totalActiveAnalysts} />}
            <IndicatorCard
              label={isAnalista ? "Minhas combinações em construção" : "Combinações em construção"}
              value={data.combinationsInConstruction}
            />
            <IndicatorCard
              label={isAnalista ? "Minhas combinações liberadas" : "Combinações liberadas"}
              value={data.combinationsReleased}
            />
            <IndicatorCard
              label={isAnalista ? "Minhas liberações" : "Liberações"}
              value={data.releasesTotal}
            />
            <IndicatorCard
              label={isAnalista ? "Meus retornos à reanálise" : "Retornos à reanálise"}
              value={data.returnsToReanalysisTotal}
            />
            <IndicatorCard
              label={isAnalista ? "Minhas devoluções" : "Devoluções"}
              value={data.reportedReturnsTotal}
            />
            <IndicatorCard
              label={isAnalista ? "Minhas devoluções — Reanálise" : "Devoluções — Reanálise"}
              value={data.reportedReturnsByOrigin.find((o) => o.origin === "REANALISE")?.count ?? 0}
            />
            <IndicatorCard
              label={isAnalista ? "Minhas devoluções — Cliente" : "Devoluções — Cliente"}
              value={data.reportedReturnsByOrigin.find((o) => o.origin === "CLIENTE")?.count ?? 0}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title={isAnalista ? "Minhas liberações por cliente" : "Liberações por cliente"}
              data={data.releasesByClient.map((r) => ({ name: r.clientName, value: r.count }))}
              emptyLabel="Nenhuma liberação registrada para este recorte."
            />
            <ChartCard
              title={isAnalista ? "Minhas devoluções por cliente" : "Devoluções por cliente"}
              data={data.returnsByClient.map((r) => ({ name: r.clientName, value: r.count }))}
              emptyLabel="Nenhuma devolução registrada para este recorte."
            />
            <ChartCard
              title={isAnalista ? "Minhas liberações por meio" : "Liberações por meio"}
              data={data.releasesByMediaChannel.map((r) => ({ name: r.mediaChannelName, value: r.count }))}
              emptyLabel="Nenhuma liberação registrada para este recorte."
            />
            <ChartCard
              title={isAnalista ? "Minhas devoluções por meio" : "Devoluções por meio"}
              data={data.returnsByMediaChannel.map((r) => ({ name: r.mediaChannelName, value: r.count }))}
              emptyLabel="Nenhuma devolução registrada para este recorte."
            />
          </div>
        </>
      )}
    </div>
  );
}

function ChartCard({
  title,
  data,
  emptyLabel,
}: {
  title: string;
  data: { name: string; value: number }[];
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground text-center px-4">{emptyLabel}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
