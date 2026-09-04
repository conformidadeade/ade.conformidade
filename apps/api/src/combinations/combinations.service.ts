import { Injectable } from "@nestjs/common";
import { CombinationSummary } from "@reanalise-erp/types";
import { PrismaService } from "../prisma/prisma.service";
import { ListCombinationsQuery } from "./dto/list-combinations.query";

/** Mapa de Liberação de Reanálise (item 16). */
@Injectable()
export class CombinationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMap(query: ListCombinationsQuery): Promise<CombinationSummary[]> {
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;

    const combinations = await this.prisma.analystClientMedia.findMany({
      where: {
        analystId: query.analystId,
        clientId: query.clientId,
        mediaChannelId: query.mediaChannelId,
        status: query.status,
      },
      include: { analyst: true, client: true, mediaChannel: true },
      orderBy: [{ client: { name: "asc" } }, { mediaChannel: { name: "asc" } }, { analyst: { name: "asc" } }],
    });

    if (combinations.length === 0) return [];

    const activeGuidelines = await this.prisma.guideline.findMany({ where: { active: true } });
    const targetByPair = new Map(
      activeGuidelines.map((g) => [`${g.clientId}:${g.mediaChannelId}`, g.targetCount]),
    );

    // "Devoluções no mês" (item 16) é o indicador de relatório do item 10:
    // TODA devolução registrada no mês, independentemente do estado da
    // combinação no momento — não é o mesmo contador que decide o retorno
    // à reanálise (esse é interno ao estado, ver monthlyReturnCount).
    const returnCounts = await this.prisma.reanalysisReturn.groupBy({
      by: ["combinationId"],
      where: { combinationId: { in: combinations.map((c) => c.id) }, monthKey },
      _count: { _all: true },
    });
    const returnCountByCombination = new Map(returnCounts.map((r) => [r.combinationId, r._count._all]));

    return combinations.map((c) => {
      const guidelineTarget = targetByPair.get(`${c.clientId}:${c.mediaChannelId}`) ?? 0;
      const missingCount =
        c.status === "LIBERADO" ? 0 : Math.max(guidelineTarget - c.constructionCount, 0);

      return {
        id: c.id,
        analystId: c.analystId,
        analystName: c.analyst.name,
        clientId: c.clientId,
        clientName: c.client.name,
        mediaChannelId: c.mediaChannelId,
        mediaChannelName: c.mediaChannel.name,
        status: c.status,
        guidelineTarget,
        constructionCount: c.constructionCount,
        missingCount,
        monthlyReturnCount: returnCountByCombination.get(c.id) ?? 0,
        monthlyReturnMonthKey: monthKey,
        lastMovementAt: c.lastMovementAt?.toISOString() ?? null,
        releasedAt: c.releasedAt?.toISOString() ?? null,
        lastReturnAt: c.lastReturnAt?.toISOString() ?? null,
        lastReturnReason: c.lastReturnReason,
      };
    });
  }
}
