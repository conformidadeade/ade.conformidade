"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardIndicators } from "@reanalise-erp/types";
import { api } from "@/lib/api/client";
import { useAnalysts, useClients, useMediaChannels } from "@/lib/hooks/use-catalog";
import { IndicatorCard } from "@/components/dashboard/indicator-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const ALL = "__all__";

export default function DashboardPage() {
  const [analystId, setAnalystId] = useState(ALL);
  const [clientId, setClientId] = useState(ALL);
  const [mediaChannelId, setMediaChannelId] = useState(ALL);

  const { data: analysts } = useAnalysts();
  const { data: clients } = useClients();
  const { data: mediaChannels } = useMediaChannels();

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (analystId !== ALL) params.set("analystId", analystId);
    if (clientId !== ALL) params.set("clientId", clientId);
    if (mediaChannelId !== ALL) params.set("mediaChannelId", mediaChannelId);
    return params.toString();
  }, [analystId, clientId, mediaChannelId]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", query],
    queryFn: () => api.get<DashboardIndicators>(`/dashboard${query ? `?${query}` : ""}`),
  });

  const hasFilter = analystId !== ALL || clientId !== ALL || mediaChannelId !== ALL;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground capitalize">{monthLabel}</p>
      </div>

      <Card>
        <CardContent className="pt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {hasFilter && (
            <p className="text-xs text-muted-foreground -mt-2">
              Indicadores recalculados para o recorte selecionado — o período continua sendo o mês corrente.
            </p>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <IndicatorCard label="Analistas ativos" value={data.totalActiveAnalysts} />
            <IndicatorCard label="Combinações em construção" value={data.combinationsInConstruction} />
            <IndicatorCard label="Combinações liberadas" value={data.combinationsReleased} />
            <IndicatorCard label="Liberações no mês" value={data.releasesThisMonth} />
            <IndicatorCard label="Retornos no mês" value={data.returnsToReanalysisThisMonth} />
            <IndicatorCard label="Devoluções no mês" value={data.reportedReturnsThisMonth} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Liberações por cliente" data={data.releasesByClient.map((r) => ({ name: r.clientName, value: r.count }))} />
            <ChartCard title="Devoluções por cliente" data={data.returnsByClient.map((r) => ({ name: r.clientName, value: r.count }))} />
            <ChartCard
              title="Liberações por meio"
              data={data.releasesByMediaChannel.map((r) => ({ name: r.mediaChannelName, value: r.count }))}
            />
            <ChartCard
              title="Devoluções por meio"
              data={data.returnsByMediaChannel.map((r) => ({ name: r.mediaChannelName, value: r.count }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem dados no período.</div>
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
