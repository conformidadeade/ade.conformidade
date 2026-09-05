import { randomUUID } from "crypto";
import { CombinationNotFoundError, DuplicateProcessError, GuidelineNotConfiguredError } from "./errors";
import { ReleaseService } from "./release.service";
import { InMemoryReleaseRepository } from "./testing/in-memory-release.repository";

describe("ReleaseService (orquestração sobre release-engine)", () => {
  let repo: InMemoryReleaseRepository;
  let service: ReleaseService;
  let analystId: string;
  let clientId: string;
  let mediaChannelId: string;
  let userId: string;

  beforeEach(() => {
    repo = new InMemoryReleaseRepository();
    service = new ReleaseService(repo);
    analystId = randomUUID();
    clientId = randomUUID();
    mediaChannelId = randomUUID();
    userId = randomUUID();
    repo.setGuideline(clientId, mediaChannelId, 5);
  });

  test("lançar processo correto sem diretriz configurada falha com erro claro", async () => {
    repo.guidelines.clear();
    await expect(
      service.registerProcess({
        analystId,
        clientId,
        mediaChannelId,
        piNumber: "PI-1",
        analysisDate: new Date("2026-01-05"),
        result: "CORRETO",
        recordedByUserId: userId,
      }),
    ).rejects.toThrow(GuidelineNotConfiguredError);
  });

  test("5 processos corretos liberam automaticamente a combinação (item 6)", async () => {
    let result;
    for (let i = 0; i < 5; i++) {
      result = await service.registerProcess({
        analystId,
        clientId,
        mediaChannelId,
        piNumber: `PI-${i}`,
        analysisDate: new Date(2026, 0, i + 1),
        result: "CORRETO",
        recordedByUserId: userId,
      });
    }
    expect(result!.status).toBe("LIBERADO");
    expect(repo.processes).toHaveLength(5);
    expect(repo.events.some((e) => e.type === "RELEASED")).toBe(true);
  });

  test("PI duplicado (mesma combinação+PI+data) é bloqueado por padrão", async () => {
    await service.registerProcess({
      analystId,
      clientId,
      mediaChannelId,
      piNumber: "PI-1",
      analysisDate: new Date("2026-01-05"),
      result: "CORRETO",
      recordedByUserId: userId,
    });
    await expect(
      service.registerProcess({
        analystId,
        clientId,
        mediaChannelId,
        piNumber: "PI-1",
        analysisDate: new Date("2026-01-05"),
        result: "CORRETO",
        recordedByUserId: userId,
      }),
    ).rejects.toThrow(DuplicateProcessError);
  });

  test("PI duplicado é aceito quando allowDuplicate=true (reprocessamento legítimo, item 23)", async () => {
    await service.registerProcess({
      analystId,
      clientId,
      mediaChannelId,
      piNumber: "PI-1",
      analysisDate: new Date("2026-01-05"),
      result: "CORRETO",
      recordedByUserId: userId,
    });
    const result = await service.registerProcess({
      analystId,
      clientId,
      mediaChannelId,
      piNumber: "PI-1",
      analysisDate: new Date("2026-01-05"),
      result: "CORRETO",
      recordedByUserId: userId,
      allowDuplicate: true,
    });
    expect(repo.processes).toHaveLength(2);
    expect(result.status).toBe("EM_CONSTRUCAO");
  });

  test("processo INCORRETO é registrado mas não altera a construção", async () => {
    const result = await service.registerProcess({
      analystId,
      clientId,
      mediaChannelId,
      piNumber: "PI-1",
      analysisDate: new Date("2026-01-05"),
      result: "INCORRETO",
      recordedByUserId: userId,
    });
    expect(result.status).toBe("EM_CONSTRUCAO");
    expect(repo.processes).toHaveLength(1);
    expect(repo.events).toHaveLength(0);
  });

  test("lançamento sem 'result' (tela de Lançamento não oferece mais a escolha, item 2) grava CORRETO por padrão", async () => {
    const result = await service.registerProcess({
      analystId,
      clientId,
      mediaChannelId,
      piNumber: "PI-1",
      analysisDate: new Date("2026-01-05"),
      recordedByUserId: userId,
    });
    expect(result.status).toBe("EM_CONSTRUCAO");
    expect(repo.processes).toHaveLength(1);
    expect(repo.processes[0]!.result).toBe("CORRETO");
    expect(repo.events.some((e) => e.type === "PROCESS_CORRECT")).toBe(true);
  });

  test("registrar devolução numa combinação inexistente falha com erro claro", async () => {
    await expect(
      service.registerReturn({
        analystId,
        clientId,
        mediaChannelId,
        piNumber: "PI-1",
        reason: "erro",
        occurredAt: new Date("2026-01-10"),
        registeredByUserId: userId,
      }),
    ).rejects.toThrow(CombinationNotFoundError);
  });

  test("2ª devolução no mês de combinação liberada retorna à reanálise e é auditável (itens 8/13)", async () => {
    for (let i = 0; i < 5; i++) {
      await service.registerProcess({
        analystId,
        clientId,
        mediaChannelId,
        piNumber: `PI-${i}`,
        analysisDate: new Date(2026, 0, i + 1),
        result: "CORRETO",
        recordedByUserId: userId,
      });
    }
    await service.registerReturn({
      analystId,
      clientId,
      mediaChannelId,
      piNumber: "PI-reclamacao-1",
      reason: "r1",
      occurredAt: new Date("2026-01-10"),
      registeredByUserId: userId,
    });
    const result = await service.registerReturn({
      analystId,
      clientId,
      mediaChannelId,
      piNumber: "PI-reclamacao-2",
      reason: "r2",
      occurredAt: new Date("2026-01-20"),
      registeredByUserId: userId,
    });
    expect(result.status).toBe("RETORNADO");
    expect(repo.returns).toHaveLength(2);
    expect(repo.returns[1]!.contextState).toBe("LIBERADO");
    expect(repo.events.some((e) => e.type === "AUTO_RETURN")).toBe(true);
  });

  test("devolução com PI correspondente a um processo já lançado vincula processId automaticamente (item 1)", async () => {
    await service.registerProcess({
      analystId,
      clientId,
      mediaChannelId,
      piNumber: "PI-777",
      analysisDate: new Date("2026-01-05"),
      result: "CORRETO",
      recordedByUserId: userId,
    });
    const result = await service.registerReturn({
      analystId,
      clientId,
      mediaChannelId,
      piNumber: "PI-777",
      reason: "erro encontrado depois",
      occurredAt: new Date("2026-01-15"),
      registeredByUserId: userId,
    });
    expect(result).toBeTruthy();
    expect(repo.returns).toHaveLength(1);
    expect(repo.returns[0]!.piNumber).toBe("PI-777");
    expect(repo.returns[0]!.processId).toBe(repo.processes[0]!.id);
  });

  test("devolução com PI sem processo correspondente segue normalmente com processId nulo (caso normal para LIBERADO, item 1)", async () => {
    // Combinação chega a LIBERADO — a partir daqui, processos enviados ao
    // cliente não passam mais pela reanálise, então o PI reclamado nunca
    // teve um AnalyzedProcess correspondente lançado no sistema.
    for (let i = 0; i < 5; i++) {
      await service.registerProcess({
        analystId,
        clientId,
        mediaChannelId,
        piNumber: `PI-${i}`,
        analysisDate: new Date(2026, 0, i + 1),
        result: "CORRETO",
        recordedByUserId: userId,
      });
    }
    const result = await service.registerReturn({
      analystId,
      clientId,
      mediaChannelId,
      piNumber: "PI-nunca-analisado",
      reason: "reclamação do cliente",
      occurredAt: new Date("2026-01-15"),
      registeredByUserId: userId,
    });
    expect(result.status).toBe("LIBERADO");
    expect(repo.returns).toHaveLength(1);
    expect(repo.returns[0]!.piNumber).toBe("PI-nunca-analisado");
    expect(repo.returns[0]!.processId).toBeUndefined();
  });

  test("reset manual em combinação LIBERADO é rejeitado pelo motor de regras", async () => {
    for (let i = 0; i < 5; i++) {
      await service.registerProcess({
        analystId,
        clientId,
        mediaChannelId,
        piNumber: `PI-${i}`,
        analysisDate: new Date(2026, 0, i + 1),
        result: "CORRETO",
        recordedByUserId: userId,
      });
    }
    await expect(
      service.manualReset({
        analystId,
        clientId,
        mediaChannelId,
        reason: "x",
        occurredAt: new Date("2026-01-10"),
        performedByUserId: userId,
      }),
    ).rejects.toThrow();
  });

  test("retorno manual de combinação liberada registra evento MANUAL_RETURN", async () => {
    for (let i = 0; i < 5; i++) {
      await service.registerProcess({
        analystId,
        clientId,
        mediaChannelId,
        piNumber: `PI-${i}`,
        analysisDate: new Date(2026, 0, i + 1),
        result: "CORRETO",
        recordedByUserId: userId,
      });
    }
    const result = await service.manualReturn({
      analystId,
      clientId,
      mediaChannelId,
      reason: "decisão da liderança",
      occurredAt: new Date("2026-01-10"),
      performedByUserId: userId,
    });
    expect(result.status).toBe("RETORNADO");
    expect(repo.events.some((e) => e.type === "MANUAL_RETURN")).toBe(true);
  });
});
