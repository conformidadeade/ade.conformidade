import { DashboardService } from "./dashboard.service";

interface FakeCombo {
  id: string;
  analystId: string;
  clientId: string;
  mediaChannelId: string;
  status: "EM_CONSTRUCAO" | "LIBERADO" | "RETORNADO";
}
interface FakeReturn {
  id: string;
  combinationId: string;
  monthKey: string;
}
interface FakeEvent {
  id: string;
  combinationId: string;
  type: string;
  occurredAt: Date;
}

const CLIENT = { c1: { id: "c1", name: "SECOM" }, c2: { id: "c2", name: "GDF" } };
const MEDIA = { m1: { id: "m1", name: "TV" }, m2: { id: "m2", name: "Radio" } };

function comboMatches(c: FakeCombo, where: { analystId?: string; clientId?: string; mediaChannelId?: string; status?: string }) {
  if (where.status !== undefined && c.status !== where.status) return false;
  if (where.analystId !== undefined && c.analystId !== where.analystId) return false;
  if (where.clientId !== undefined && c.clientId !== where.clientId) return false;
  if (where.mediaChannelId !== undefined && c.mediaChannelId !== where.mediaChannelId) return false;
  return true;
}

/**
 * Fake mínimo do PrismaService — implementa só as formas de query que
 * DashboardService realmente usa, o suficiente para verificar o
 * comportamento dos filtros do adendo Fase 2, item 3.
 */
function buildPrismaFake(data: {
  analysts: { id: string; active: boolean }[];
  combinations: FakeCombo[];
  returns: FakeReturn[];
  events: FakeEvent[];
}) {
  const comboById = new Map(data.combinations.map((c) => [c.id, c]));

  return {
    analyst: {
      count: jest.fn(async ({ where }: any) => data.analysts.filter((a) => a.active === where.active).length),
      findUnique: jest.fn(async ({ where }: any) => data.analysts.find((a) => a.id === where.id) ?? null),
    },
    analystClientMedia: {
      count: jest.fn(async ({ where }: any) => data.combinations.filter((c) => comboMatches(c, where)).length),
      findMany: jest.fn(async ({ where, distinct }: any) => {
        const rows = data.combinations.filter((c) => {
          if (where.clientId !== undefined && c.clientId !== where.clientId) return false;
          if (where.mediaChannelId !== undefined && c.mediaChannelId !== where.mediaChannelId) return false;
          if (where.analyst?.active !== undefined) {
            const analyst = data.analysts.find((a) => a.id === c.analystId);
            if (analyst?.active !== where.analyst.active) return false;
          }
          return true;
        });
        if (distinct?.includes("analystId")) {
          const seen = new Set<string>();
          return rows.filter((r) => (seen.has(r.analystId) ? false : (seen.add(r.analystId), true)));
        }
        return rows;
      }),
    },
    reanalysisReturn: {
      findMany: jest.fn(async ({ where }: any) => {
        return data.returns
          .filter((r) => r.monthKey === where.monthKey)
          .filter((r) => comboMatches(comboById.get(r.combinationId)!, where.combination ?? {}))
          .map((r) => {
            const combo = comboById.get(r.combinationId)!;
            return { ...r, combination: { ...combo, client: CLIENT[combo.clientId as "c1" | "c2"], mediaChannel: MEDIA[combo.mediaChannelId as "m1" | "m2"] } };
          });
      }),
    },
    reanalysisEvent: {
      findMany: jest.fn(async ({ where }: any) => {
        const types: string[] = where.type?.in ?? [where.type];
        return data.events
          .filter((e) => types.includes(e.type))
          .filter((e) => e.occurredAt >= where.occurredAt.gte && e.occurredAt < where.occurredAt.lt)
          .filter((e) => comboMatches(comboById.get(e.combinationId)!, where.combination ?? {}))
          .map((e) => {
            const combo = comboById.get(e.combinationId)!;
            return { ...e, combination: { ...combo, client: CLIENT[combo.clientId as "c1" | "c2"], mediaChannel: MEDIA[combo.mediaChannelId as "m1" | "m2"] } };
          });
      }),
    },
  };
}

describe("DashboardService — filtros de Analista/Cliente/Meio (adendo Fase 2, item 3)", () => {
  const at = (d: string) => new Date(d);

  function buildFixture() {
    return {
      analysts: [
        { id: "a1", active: true },
        { id: "a2", active: true },
      ],
      combinations: [
        { id: "combo1", analystId: "a1", clientId: "c1", mediaChannelId: "m1", status: "LIBERADO" as const },
        { id: "combo2", analystId: "a1", clientId: "c2", mediaChannelId: "m2", status: "EM_CONSTRUCAO" as const },
        { id: "combo3", analystId: "a2", clientId: "c1", mediaChannelId: "m1", status: "LIBERADO" as const },
      ],
      returns: [
        { id: "r1", combinationId: "combo1", monthKey: "2026-09" },
        { id: "r2", combinationId: "combo3", monthKey: "2026-09" },
        { id: "r3", combinationId: "combo2", monthKey: "2026-09" },
      ],
      events: [
        { id: "e1", combinationId: "combo1", type: "RELEASED", occurredAt: at("2026-09-05") },
        { id: "e2", combinationId: "combo3", type: "RELEASED", occurredAt: at("2026-09-06") },
      ],
    };
  }

  test("sem filtro: comportamento idêntico ao atual (visão geral do mês)", async () => {
    const prisma = buildPrismaFake(buildFixture());
    const service = new DashboardService(prisma as never);
    const result = await service.getIndicators(9, 2026, {});
    expect(result.totalActiveAnalysts).toBe(2);
    expect(result.combinationsReleased).toBe(2);
    expect(result.combinationsInConstruction).toBe(1);
    expect(result.reportedReturnsThisMonth).toBe(3);
    expect(result.releasesThisMonth).toBe(2);
  });

  test("filtrado por analista específico → indicadores batem só com os dados daquele analista", async () => {
    const prisma = buildPrismaFake(buildFixture());
    const service = new DashboardService(prisma as never);
    const result = await service.getIndicators(9, 2026, { analystId: "a1" });

    expect(result.totalActiveAnalysts).toBe(1);
    expect(result.combinationsReleased).toBe(1); // só combo1 (a1)
    expect(result.combinationsInConstruction).toBe(1); // só combo2 (a1)
    expect(result.reportedReturnsThisMonth).toBe(2); // r1 + r3, ambas de a1
    expect(result.releasesThisMonth).toBe(1); // e1, de a1
    expect(result.releasesByClient).toEqual([{ clientId: "c1", clientName: "SECOM", count: 1 }]);
  });

  test("filtrado por cliente + meio específicos → indicadores batem só com a combinação selecionada", async () => {
    const prisma = buildPrismaFake(buildFixture());
    const service = new DashboardService(prisma as never);
    const result = await service.getIndicators(9, 2026, { clientId: "c1", mediaChannelId: "m1" });

    expect(result.totalActiveAnalysts).toBe(2); // a1 e a2 têm combinação para c1+m1
    expect(result.combinationsReleased).toBe(2); // combo1 + combo3
    expect(result.combinationsInConstruction).toBe(0);
    expect(result.reportedReturnsThisMonth).toBe(2); // r1 + r2, exclui r3 (c2/m2)
    expect(result.releasesThisMonth).toBe(2); // e1 + e2
  });
});
