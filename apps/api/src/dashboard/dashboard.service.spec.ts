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
  origin: "REANALISE" | "CLIENTE";
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
 * DashboardService realmente usa. Adendo "Dashboard: mostrar totais de
 * todos os períodos" (08/09/2026): nem `reanalysisReturn.findMany` nem
 * `reanalysisEvent.findMany` recebem mais filtro de mês/data — o fake
 * reflete isso não aceitando/aplicando `monthKey` nem `occurredAt`.
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
        expect(where).not.toHaveProperty("monthKey");
        return data.returns
          .filter((r) => where.origin === undefined || r.origin === where.origin)
          .filter((r) => comboMatches(comboById.get(r.combinationId)!, where.combination ?? {}))
          .map((r) => {
            const combo = comboById.get(r.combinationId)!;
            return { ...r, combination: { ...combo, client: CLIENT[combo.clientId as "c1" | "c2"], mediaChannel: MEDIA[combo.mediaChannelId as "m1" | "m2"] } };
          });
      }),
    },
    reanalysisEvent: {
      findMany: jest.fn(async ({ where }: any) => {
        expect(where).not.toHaveProperty("occurredAt");
        const types: string[] = where.type?.in ?? [where.type];
        return data.events
          .filter((e) => types.includes(e.type))
          .filter((e) => comboMatches(comboById.get(e.combinationId)!, where.combination ?? {}))
          .map((e) => {
            const combo = comboById.get(e.combinationId)!;
            return { ...e, combination: { ...combo, client: CLIENT[combo.clientId as "c1" | "c2"], mediaChannel: MEDIA[combo.mediaChannelId as "m1" | "m2"] } };
          });
      }),
    },
  };
}

describe("DashboardService — totais de todos os períodos (adendo 08/09/2026)", () => {
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
      // Propositalmente em meses/anos bem diferentes — prova que o total
      // não é escopado a um mês corrente.
      returns: [
        { id: "r1", combinationId: "combo1", monthKey: "2024-01", origin: "REANALISE" as const },
        { id: "r2", combinationId: "combo3", monthKey: "2025-06", origin: "CLIENTE" as const },
        { id: "r3", combinationId: "combo2", monthKey: "2026-09", origin: "CLIENTE" as const },
      ],
      events: [
        { id: "e1", combinationId: "combo1", type: "RELEASED", occurredAt: at("2023-03-05") },
        { id: "e2", combinationId: "combo3", type: "RELEASED", occurredAt: at("2026-09-06") },
      ],
    };
  }

  test("sem filtro: indicadores somam TODOS os períodos, não só o mês corrente", async () => {
    const prisma = buildPrismaFake(buildFixture());
    const service = new DashboardService(prisma as never);
    const result = await service.getIndicators({});
    expect(result.totalActiveAnalysts).toBe(2);
    expect(result.combinationsReleased).toBe(2);
    expect(result.combinationsInConstruction).toBe(1);
    // r1 (2024) + r2 (2025) + r3 (2026) — os 3, mesmo espalhados em anos diferentes.
    expect(result.reportedReturnsTotal).toBe(3);
    // e1 (2023) + e2 (2026) — os 2.
    expect(result.releasesTotal).toBe(2);
  });

  test("adendo 'Origem da devolução': indicador 'devoluções por origem' soma todos os períodos (1 REANALISE, 2 CLIENTE)", async () => {
    const prisma = buildPrismaFake(buildFixture());
    const service = new DashboardService(prisma as never);
    const result = await service.getIndicators({});
    expect(result.reportedReturnsByOrigin).toEqual(
      expect.arrayContaining([
        { origin: "REANALISE", count: 1 },
        { origin: "CLIENTE", count: 2 },
      ]),
    );
  });

  test("filtro por origem=CLIENTE retorna só os registros dessa origem, em todos os períodos", async () => {
    const prisma = buildPrismaFake(buildFixture());
    const service = new DashboardService(prisma as never);
    const result = await service.getIndicators({ origin: "CLIENTE" });
    expect(result.reportedReturnsTotal).toBe(2); // r2 + r3
    expect(result.reportedReturnsByOrigin).toEqual(
      expect.arrayContaining([
        { origin: "REANALISE", count: 0 },
        { origin: "CLIENTE", count: 2 },
      ]),
    );
    // Filtro de origem não recorta indicadores que não são devolução.
    expect(result.combinationsReleased).toBe(2);
    expect(result.releasesTotal).toBe(2);
  });

  test("filtrado por analista específico → indicadores batem só com os dados daquele analista, em todos os períodos", async () => {
    const prisma = buildPrismaFake(buildFixture());
    const service = new DashboardService(prisma as never);
    const result = await service.getIndicators({ analystId: "a1" });

    expect(result.totalActiveAnalysts).toBe(1);
    expect(result.combinationsReleased).toBe(1); // só combo1 (a1)
    expect(result.combinationsInConstruction).toBe(1); // só combo2 (a1)
    expect(result.reportedReturnsTotal).toBe(2); // r1 + r3, ambas de a1
    expect(result.releasesTotal).toBe(1); // e1, de a1
    expect(result.releasesByClient).toEqual([{ clientId: "c1", clientName: "SECOM", count: 1 }]);
  });

  test("filtrado por cliente + meio específicos → indicadores batem só com a combinação selecionada, em todos os períodos", async () => {
    const prisma = buildPrismaFake(buildFixture());
    const service = new DashboardService(prisma as never);
    const result = await service.getIndicators({ clientId: "c1", mediaChannelId: "m1" });

    expect(result.totalActiveAnalysts).toBe(2); // a1 e a2 têm combinação para c1+m1
    expect(result.combinationsReleased).toBe(2); // combo1 + combo3
    expect(result.combinationsInConstruction).toBe(0);
    expect(result.reportedReturnsTotal).toBe(2); // r1 + r2, exclui r3 (c2/m2)
    expect(result.releasesTotal).toBe(2); // e1 + e2
  });
});
