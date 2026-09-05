import { NotFoundException } from "@nestjs/common";
import { CombinationsService } from "./combinations.service";

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
  combination: { id: string; status: string; constructionCount: number } | null;
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
    await expect(service.getCurrentCycleProcesses("nope")).rejects.toThrow(NotFoundException);
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
    const result = await service.getCurrentCycleProcesses("combo1");

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
    const result = await service.getCurrentCycleProcesses("combo1");
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
    const result = await service.getCurrentCycleProcesses("combo1");
    expect(result.processes).toHaveLength(5);
    expect(result.processes.map((p) => p.piNumber)).not.toContain("PI-p6");
  });
});
