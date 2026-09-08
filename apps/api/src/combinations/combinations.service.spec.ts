import { NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { CombinationsService } from "./combinations.service";

const LIDERANCA_USER: AuthenticatedUser = { id: "u-lider", role: "LIDERANCA", analystId: null };

interface FakeProcess {
  id: string;
  combinationId: string;
  piNumber: string;
  result: "CORRETO" | "INCORRETO";
  analysisDate: Date;
  createdAt: Date;
  recordedByName: string;
}
interface FakeEvent {
  id: string;
  combinationId: string;
  type: string;
  createdAt: Date;
}

function buildPrismaFake(data: {
  combination: { id: string; status: string; constructionCount: number; analystId?: string } | null;
  events: FakeEvent[];
  processes: FakeProcess[];
}) {
  return {
    analystClientMedia: {
      findUnique: jest.fn(async ({ where }: any) => (data.combination?.id === where.id ? data.combination : null)),
    },
    reanalysisEvent: {
      findFirst: jest.fn(async ({ where }: any) => {
        const matches = data.events
          .filter((e) => e.combinationId === where.combinationId && where.type.in.includes(e.type))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] ?? null;
      }),
    },
    analyzedProcess: {
      findMany: jest.fn(async ({ where, take }: any) => {
        const rows = data.processes
          .filter((p) => p.combinationId === where.combinationId)
          .filter((p) => p.result === where.result)
          .filter((p) => !where.createdAt || p.createdAt > where.createdAt.gt)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, take);
        return rows.map((p) => ({ ...p, recordedBy: { name: p.recordedByName } }));
      }),
    },
  };
}

describe("CombinationsService.getCurrentCycleProcesses (adendo Fase 2, item 5)", () => {
  const at = (d: string) => new Date(d);
  const process = (id: string, createdAt: string, result: "CORRETO" | "INCORRETO" = "CORRETO"): FakeProcess => ({
    id,
    combinationId: "combo1",
    piNumber: `PI-${id}`,
    result,
    analysisDate: at(createdAt),
    createdAt: at(createdAt),
    recordedByName: "Fulano",
  });

  test("combinação inexistente lança NotFoundException", async () => {
    const prisma = buildPrismaFake({ combination: null, events: [], processes: [] });
    const service = new CombinationsService(prisma as never);
    await expect(service.getCurrentCycleProcesses("nope", LIDERANCA_USER)).rejects.toThrow(NotFoundException);
  });

  test("3 devoluções no histórico, mas só 1 reset recente → lista mostra só o ciclo atual e bate com o progresso", async () => {
    const prisma = buildPrismaFake({
      combination: { id: "combo1", status: "EM_CONSTRUCAO", constructionCount: 2 },
      events: [
        // 2 eventos de devolução ANTERIORES ao reset mais recente não contam mais que o último.
        { id: "ev1", combinationId: "combo1", type: "RETURN_RESET", createdAt: at("2026-01-05") },
        { id: "ev2", combinationId: "combo1", type: "RETURN_RESET", createdAt: at("2026-01-10") },
        { id: "ev3", combinationId: "combo1", type: "MANUAL_RESET", createdAt: at("2026-01-15") },
      ],
      processes: [
        process("p1", "2026-01-01"), // antes de qualquer reset — não deve aparecer
        process("p2", "2026-01-08"), // entre ev1 e ev2 — não deve aparecer
        process("p3", "2026-01-16"), // depois do reset mais recente (ev3)
        process("p4", "2026-01-17"), // depois do reset mais recente (ev3)
      ],
    });
    const service = new CombinationsService(prisma as never);
    const result = await service.getCurrentCycleProcesses("combo1", LIDERANCA_USER);

    expect(result.constructionCount).toBe(2);
    expect(result.processes).toHaveLength(2);
    expect(result.processes.map((p) => p.piNumber)).toEqual(["PI-p3", "PI-p4"]);
  });

  test("sem nenhum reset/retorno anterior, o ciclo é desde sempre", async () => {
    const prisma = buildPrismaFake({
      combination: { id: "combo1", status: "EM_CONSTRUCAO", constructionCount: 3 },
      events: [],
      processes: [process("p1", "2026-01-01"), process("p2", "2026-01-02"), process("p3", "2026-01-03")],
    });
    const service = new CombinationsService(prisma as never);
    const result = await service.getCurrentCycleProcesses("combo1", LIDERANCA_USER);
    expect(result.processes.map((p) => p.piNumber)).toEqual(["PI-p1", "PI-p2", "PI-p3"]);
  });

  test("combinação LIBERADA: processos lançados depois da liberação não entram na lista (o corte é o constructionCount)", async () => {
    const prisma = buildPrismaFake({
      combination: { id: "combo1", status: "LIBERADO", constructionCount: 5 },
      events: [],
      processes: [
        process("p1", "2026-01-01"),
        process("p2", "2026-01-02"),
        process("p3", "2026-01-03"),
        process("p4", "2026-01-04"),
        process("p5", "2026-01-05"), // liberou aqui — constructionCount trava em 5
        process("p6", "2026-01-10"), // lançado depois de já LIBERADO — não conta mais
      ],
    });
    const service = new CombinationsService(prisma as never);
    const result = await service.getCurrentCycleProcesses("combo1", LIDERANCA_USER);
    expect(result.processes).toHaveLength(5);
    expect(result.processes.map((p) => p.piNumber)).not.toContain("PI-p6");
  });
});

describe("CombinationsService.getMap — filtro de Origem (adendo 'Origem da devolução', 08/09/2026)", () => {
  interface FakeCombo {
    id: string;
    analystId: string;
    clientId: string;
    mediaChannelId: string;
    status: string;
    constructionCount: number;
  }
  interface FakeReturnRow {
    combinationId: string;
    monthKey: string;
    origin: "REANALISE" | "CLIENTE";
  }

  function buildMapPrismaFake(combos: FakeCombo[], returns: FakeReturnRow[]) {
    const names = { a1: "Ana", a2: "Bruno", cl1: "SECOM", cl2: "GDF", m1: "TV", m2: "Radio" } as Record<string, string>;
    return {
      analystClientMedia: {
        findMany: jest.fn(async ({ where }: any) => {
          return combos
            .filter((c) => where.analystId === undefined || c.analystId === where.analystId)
            .filter((c) => where.clientId === undefined || c.clientId === where.clientId)
            .filter((c) => where.mediaChannelId === undefined || c.mediaChannelId === where.mediaChannelId)
            .filter((c) => where.status === undefined || c.status === where.status)
            .filter((c) => {
              if (!where.returns) return true;
              const { monthKey, origin } = where.returns.some;
              return returns.some((r) => r.combinationId === c.id && r.monthKey === monthKey && r.origin === origin);
            })
            .map((c) => ({
              ...c,
              analyst: { name: names[c.analystId] },
              client: { name: names[c.clientId] },
              mediaChannel: { name: names[c.mediaChannelId] },
            }));
        }),
      },
      guideline: { findMany: jest.fn(async () => []) },
      reanalysisReturn: {
        groupBy: jest.fn(async ({ where }: any) => {
          const ids: string[] = where.combinationId.in;
          const counts = new Map<string, number>();
          for (const r of returns) {
            if (r.monthKey === where.monthKey && ids.includes(r.combinationId)) {
              counts.set(r.combinationId, (counts.get(r.combinationId) ?? 0) + 1);
            }
          }
          return [...counts.entries()].map(([combinationId, count]) => ({ combinationId, _count: { _all: count } }));
        }),
      },
    };
  }

  const combos: FakeCombo[] = [
    { id: "c1", analystId: "a1", clientId: "cl1", mediaChannelId: "m1", status: "LIBERADO", constructionCount: 5 },
    { id: "c2", analystId: "a1", clientId: "cl2", mediaChannelId: "m2", status: "LIBERADO", constructionCount: 5 },
    { id: "c3", analystId: "a2", clientId: "cl1", mediaChannelId: "m1", status: "LIBERADO", constructionCount: 5 },
  ];
  const returns: FakeReturnRow[] = [
    { combinationId: "c1", monthKey: "2026-09", origin: "REANALISE" },
    { combinationId: "c2", monthKey: "2026-09", origin: "CLIENTE" },
  ];

  test("sem filtro de origem: todas as combinações aparecem, como hoje", async () => {
    const prisma = buildMapPrismaFake(combos, returns);
    const service = new CombinationsService(prisma as never);
    const result = await service.getMap({ month: 9, year: 2026 } as never);
    expect(result.map((r) => r.id).sort()).toEqual(["c1", "c2", "c3"]);
  });

  test("origin=CLIENTE: só combinações com devolução de origem CLIENTE no mês", async () => {
    const prisma = buildMapPrismaFake(combos, returns);
    const service = new CombinationsService(prisma as never);
    const result = await service.getMap({ month: 9, year: 2026, origin: "CLIENTE" } as never);
    expect(result.map((r) => r.id)).toEqual(["c2"]);
  });

  test("origin=REANALISE: só combinações com devolução de origem REANALISE no mês (c3, sem devolução nenhuma, fica de fora)", async () => {
    const prisma = buildMapPrismaFake(combos, returns);
    const service = new CombinationsService(prisma as never);
    const result = await service.getMap({ month: 9, year: 2026, origin: "REANALISE" } as never);
    expect(result.map((r) => r.id)).toEqual(["c1"]);
  });
});

describe("CombinationsService.getCurrentCycleProcesses — isolamento por ANALISTA (adendo Acesso restrito, item 1)", () => {
  const at = (d: string) => new Date(d);

  test("ANALISTA acessando a própria combinação enxerga o drill-down normalmente", async () => {
    const prisma = buildPrismaFake({
      combination: { id: "combo1", status: "EM_CONSTRUCAO", constructionCount: 1, analystId: "analyst-a" },
      events: [],
      processes: [
        {
          id: "p1",
          combinationId: "combo1",
          piNumber: "PI-1",
          result: "CORRETO",
          analysisDate: at("2026-01-01"),
          createdAt: at("2026-01-01"),
          recordedByName: "Fulano",
        },
      ],
    });
    const service = new CombinationsService(prisma as never);
    const analista: AuthenticatedUser = { id: "u-analista", role: "ANALISTA", analystId: "analyst-a" };
    const result = await service.getCurrentCycleProcesses("combo1", analista);
    expect(result.processes).toHaveLength(1);
  });

  test("ANALISTA tentando acessar a combinação de outro analista via ID manipulado recebe NotFoundException", async () => {
    const prisma = buildPrismaFake({
      combination: { id: "combo1", status: "EM_CONSTRUCAO", constructionCount: 1, analystId: "analyst-b" },
      events: [],
      processes: [],
    });
    const service = new CombinationsService(prisma as never);
    const analista: AuthenticatedUser = { id: "u-analista", role: "ANALISTA", analystId: "analyst-a" };
    await expect(service.getCurrentCycleProcesses("combo1", analista)).rejects.toThrow(NotFoundException);
  });
});
