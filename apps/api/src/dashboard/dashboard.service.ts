import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DashboardIndicators, ReturnOrigin } from "@reanalise-erp/types";
import { PrismaService } from "../prisma/prisma.service";

export interface DashboardFilters {
  analystId?: string;
  clientId?: string;
  mediaChannelId?: string;
  /** Adendo "Origem da devolução" — só se aplica aos indicadores baseados
   * em ReanalysisReturn (devoluções, por cliente/meio/origem); não recorta
   * combinationsInConstruction/combinationsReleased/releasesTotal, que não
   * têm origem (não são devoluções). */
  origin?: ReturnOrigin;
}

const ORIGINS: ReturnOrigin[] = ["REANALISE", "CLIENTE"];

/**
 * Indicadores gerenciais (item 20). Adendo "Dashboard: mostrar totais de
 * todos os períodos" (08/09/2026) — decisão confirmada com a liderança:
 * removido o escopo mensal. Todo indicador/gráfico aqui é um TOTAL
 * ACUMULADO desde sempre, não um filtro de período (não há seletor de mês
 * — o comportamento é sempre "todos os períodos"). "Devoluções" aqui é o
 * contador de RELATÓRIO do item 10 (toda devolução, qualquer estado) — não
 * o contador interno da regra de retorno do item 8.
 *
 * IMPORTANTE: isso é só sobre a apresentação deste dashboard gerencial.
 * `packages/release-engine` e seu `monthlyReturnCount`/`monthKey` (regra
 * "2 devoluções no mês" que retorna uma combinação liberada à reanálise)
 * são business logic completamente separada e não foram tocados por este
 * adendo — nem o Mapa de Liberação, que continua com seu próprio filtro de
 * mês/ano para a coluna "Devoluções no mês" (ver `CombinationsService`).
 *
 * Filtros de Analista/Cliente/Meio/Origem (adendos Fase 2 item 3 e "Origem
 * da devolução"): continuam recortando os dados normalmente — só a
 * dimensão de tempo foi removida.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getIndicators(filters: DashboardFilters = {}): Promise<DashboardIndicators> {
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
        where: { origin: filters.origin, combination: combinationWhere },
        include: { combination: { include: { client: true, mediaChannel: true } } },
      }),
      this.prisma.reanalysisEvent.findMany({
        where: { type: "RELEASED", combination: combinationWhere },
        include: { combination: { include: { client: true, mediaChannel: true } } },
      }),
      this.prisma.reanalysisEvent.findMany({
        where: {
          type: { in: ["AUTO_RETURN", "MANUAL_RETURN"] },
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

    // Adendo "Origem da devolução", item 5 — sempre as duas origens
    // presentes (mesmo com contagem 0), para o indicador não "sumir" da
    // tela quando uma origem não teve nenhuma devolução.
    const returnsByOrigin = new Map<ReturnOrigin, number>(ORIGINS.map((o) => [o, 0]));
    for (const r of returns) {
      returnsByOrigin.set(r.origin as ReturnOrigin, (returnsByOrigin.get(r.origin as ReturnOrigin) ?? 0) + 1);
    }

    return {
      totalActiveAnalysts,
      combinationsInConstruction,
      combinationsReleased,
      returnsToReanalysisTotal: returnEvents.length,
      reportedReturnsTotal: returns.length,
      releasesTotal: releaseEvents.length,
      releasesByClient: [...releasesByClient.values()].sort((a, b) => b.count - a.count),
      releasesByMediaChannel: [...releasesByMediaChannel.values()].sort((a, b) => b.count - a.count),
      returnsByClient: [...byClient.values()].sort((a, b) => b.count - a.count),
      returnsByMediaChannel: [...byMediaChannel.values()].sort((a, b) => b.count - a.count),
      reportedReturnsByOrigin: ORIGINS.map((origin) => ({ origin, count: returnsByOrigin.get(origin) ?? 0 })),
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
