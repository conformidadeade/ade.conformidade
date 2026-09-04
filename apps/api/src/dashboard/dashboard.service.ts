import { Injectable } from "@nestjs/common";
import { DashboardIndicators } from "@reanalise-erp/types";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Indicadores gerenciais (item 20). Todos os indicadores "do mês" usam o
 * mesmo mês/ano do parâmetro — inclusive "liberações/devoluções por
 * cliente/meio", para manter o dashboard coerente com um único período
 * (ver docs/DECISIONS.md sobre essa escolha, que é operacional, não regra
 * de negócio). "Devoluções no mês" aqui é o contador de RELATÓRIO do item
 * 10 (toda devolução, qualquer estado) — não o contador interno da regra
 * de retorno do item 8.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getIndicators(month?: number, year?: number): Promise<DashboardIndicators> {
    const now = new Date();
    const m = month ?? now.getMonth() + 1;
    const y = year ?? now.getFullYear();
    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
    const rangeStart = new Date(y, m - 1, 1);
    const rangeEnd = new Date(y, m, 1);

    const [totalActiveAnalysts, combinationsInConstruction, combinationsReleased, returns, releaseEvents, returnEvents] =
      await Promise.all([
        this.prisma.analyst.count({ where: { active: true } }),
        this.prisma.analystClientMedia.count({ where: { status: "EM_CONSTRUCAO" } }),
        this.prisma.analystClientMedia.count({ where: { status: "LIBERADO" } }),
        this.prisma.reanalysisReturn.findMany({
          where: { monthKey },
          include: { combination: { include: { client: true, mediaChannel: true } } },
        }),
        this.prisma.reanalysisEvent.findMany({
          where: { type: "RELEASED", occurredAt: { gte: rangeStart, lt: rangeEnd } },
          include: { combination: { include: { client: true, mediaChannel: true } } },
        }),
        this.prisma.reanalysisEvent.findMany({
          where: { type: { in: ["AUTO_RETURN", "MANUAL_RETURN"] }, occurredAt: { gte: rangeStart, lt: rangeEnd } },
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
}
