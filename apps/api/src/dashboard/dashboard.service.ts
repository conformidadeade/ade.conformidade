import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DashboardIndicators } from "@reanalise-erp/types";
import { PrismaService } from "../prisma/prisma.service";

export interface DashboardFilters {
  analystId?: string;
  clientId?: string;
  mediaChannelId?: string;
}

/**
 * Indicadores gerenciais (item 20). Todos os indicadores "do mês" usam o
 * mesmo mês/ano do parâmetro — inclusive "liberações/devoluções por
 * cliente/meio", para manter o dashboard coerente com um único período
 * (ver docs/DECISIONS.md sobre essa escolha, que é operacional, não regra
 * de negócio). "Devoluções no mês" aqui é o contador de RELATÓRIO do item
 * 10 (toda devolução, qualquer estado) — não o contador interno da regra
 * de retorno do item 8.
 *
 * Filtros de Analista/Cliente/Meio (adendo Fase 2, item 3): recortam a
 * fatia de dados dentro do mesmo escopo mensal — não mudam o período.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getIndicators(month: number | undefined, year: number | undefined, filters: DashboardFilters = {}): Promise<DashboardIndicators> {
    const now = new Date();
    const m = month ?? now.getMonth() + 1;
    const y = year ?? now.getFullYear();
    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
    const rangeStart = new Date(y, m - 1, 1);
    const rangeEnd = new Date(y, m, 1);

    const combinationWhere: Prisma.AnalystClientMediaWhereInput = {
      analystId: filters.analystId,
      clientId: filters.clientId,
      mediaChannelId: filters.mediaChannelId,
    };
    const hasClientOrMediaFilter = Boolean(filters.clientId || filters.mediaChannelId);

    const [
      totalActiveAnalysts,
      combinationsInConstruction,
      combinationsReleased,
      returns,
      releaseEvents,
      returnEvents,
    ] = await Promise.all([
      this.countActiveAnalysts(filters, hasClientOrMediaFilter),
      this.prisma.analystClientMedia.count({ where: { status: "EM_CONSTRUCAO", ...combinationWhere } }),
      this.prisma.analystClientMedia.count({ where: { status: "LIBERADO", ...combinationWhere } }),
      this.prisma.reanalysisReturn.findMany({
        where: { monthKey, combination: combinationWhere },
        include: { combination: { include: { client: true, mediaChannel: true } } },
      }),
      this.prisma.reanalysisEvent.findMany({
        where: { type: "RELEASED", occurredAt: { gte: rangeStart, lt: rangeEnd }, combination: combinationWhere },
        include: { combination: { include: { client: true, mediaChannel: true } } },
      }),
      this.prisma.reanalysisEvent.findMany({
        where: {
          type: { in: ["AUTO_RETURN", "MANUAL_RETURN"] },
          occurredAt: { gte: rangeStart, lt: rangeEnd },
          combination: combinationWhere,
        },
      }),
    ]);

    const byClient = new Map<string, { clientId: string; clientName: string; count: number }>();
    const byMediaChannel = new Map<string, { mediaChannelId: string; mediaChannelName: string; count: number }>();
    for (const r of returns) {
      const c = r.combination.client;
      const mc = r.combination.mediaChannel;
      byClient.set(c.id, { clientId: c.id, clientName: c.name, count: (byClient.get(c.id)?.count ?? 0) + 1 });
      byMediaChannel.set(mc.id, {
        mediaChannelId: mc.id,
        mediaChannelName: mc.name,
        count: (byMediaChannel.get(mc.id)?.count ?? 0) + 1,
      });
    }

    const releasesByClient = new Map<string, { clientId: string; clientName: string; count: number }>();
    const releasesByMediaChannel = new Map<string, { mediaChannelId: string; mediaChannelName: string; count: number }>();
    for (const e of releaseEvents) {
      const c = e.combination.client;
      const mc = e.combination.mediaChannel;
      releasesByClient.set(c.id, {
        clientId: c.id,
        clientName: c.name,
        count: (releasesByClient.get(c.id)?.count ?? 0) + 1,
      });
      releasesByMediaChannel.set(mc.id, {
        mediaChannelId: mc.id,
        mediaChannelName: mc.name,
        count: (releasesByMediaChannel.get(mc.id)?.count ?? 0) + 1,
      });
    }

    return {
      totalActiveAnalysts,
      combinationsInConstruction,
      combinationsReleased,
      returnsToReanalysisThisMonth: returnEvents.length,
      reportedReturnsThisMonth: returns.length,
      releasesThisMonth: releaseEvents.length,
      releasesByClient: [...releasesByClient.values()].sort((a, b) => b.count - a.count),
      releasesByMediaChannel: [...releasesByMediaChannel.values()].sort((a, b) => b.count - a.count),
      returnsByClient: [...byClient.values()].sort((a, b) => b.count - a.count),
      returnsByMediaChannel: [...byMediaChannel.values()].sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Sem filtro: total geral de analistas ativos (comportamento original).
   * Com analista filtrado: 1 ou 0, conforme ele esteja ativo.
   * Com cliente/meio filtrado (sem analista): quantos analistas ativos
   * distintos têm alguma combinação para aquele cliente/meio.
   */
  private async countActiveAnalysts(filters: DashboardFilters, hasClientOrMediaFilter: boolean): Promise<number> {
    if (filters.analystId) {
      const analyst = await this.prisma.analyst.findUnique({ where: { id: filters.analystId } });
      return analyst?.active ? 1 : 0;
    }
    if (hasClientOrMediaFilter) {
      const rows = await this.prisma.analystClientMedia.findMany({
        where: {
          clientId: filters.clientId,
          mediaChannelId: filters.mediaChannelId,
          analyst: { active: true },
        },
        select: { analystId: true },
        distinct: ["analystId"],
      });
      return rows.length;
    }
    return this.prisma.analyst.count({ where: { active: true } });
  }
}
