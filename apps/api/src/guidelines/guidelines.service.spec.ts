import { BadRequestException } from "@nestjs/common";
import { AuditLogService } from "../common/audit-log.service";
import { GuidelinesService } from "./guidelines.service";

function buildPrismaMock(currentGuideline: { id: string; targetCount: number; returnLimit: number } | null) {
  const updateMock = jest.fn();
  const createMock = jest.fn().mockImplementation(({ data }) => ({
    id: "new-guideline-id",
    ...data,
  }));
  const findFirstMock = jest.fn().mockResolvedValue(currentGuideline);

  const tx = { guideline: { findFirst: findFirstMock, update: updateMock, create: createMock } };
  const prisma = {
    $transaction: jest.fn().mockImplementation((work: (tx: unknown) => unknown) => work(tx)),
  };
  return { prisma, tx, updateMock, createMock, findFirstMock };
}

describe("GuidelinesService (versionamento de diretriz, itens 4/19)", () => {
  test("primeira diretriz do par não exige motivo", async () => {
    const { prisma, updateMock, createMock } = buildPrismaMock(null);
    const auditLog = { record: jest.fn() } as unknown as AuditLogService;
    const service = new GuidelinesService(prisma as never, auditLog);

    const result = await service.setGuideline(
      { clientId: "c1", mediaChannelId: "m1", targetCount: 5 },
      "user-1",
    );

    expect(updateMock).not.toHaveBeenCalled(); // nada a encerrar
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetCount: 5, returnLimit: 2 }) }),
    );
    expect(result.targetCount).toBe(5);
  });

  test("alterar diretriz vigente sem motivo é rejeitado", async () => {
    const { prisma } = buildPrismaMock({ id: "g1", targetCount: 5, returnLimit: 2 });
    const auditLog = { record: jest.fn() } as unknown as AuditLogService;
    const service = new GuidelinesService(prisma as never, auditLog);

    await expect(
      service.setGuideline({ clientId: "c1", mediaChannelId: "m1", targetCount: 8 }, "user-1"),
    ).rejects.toThrow(BadRequestException);
  });

  test("alterar diretriz vigente com motivo encerra a antiga e cria uma nova versão (nunca sobrescreve)", async () => {
    const { prisma, updateMock, createMock } = buildPrismaMock({ id: "g1", targetCount: 5, returnLimit: 2 });
    const auditLog = { record: jest.fn() } as unknown as AuditLogService;
    const service = new GuidelinesService(prisma as never, auditLog);

    await service.setGuideline(
      { clientId: "c1", mediaChannelId: "m1", targetCount: 8, reason: "aumento de volume" },
      "user-1",
    );

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "g1" },
        data: expect.objectContaining({ active: false }),
      }),
    );
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetCount: 8, returnLimit: 2 }) }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", reason: "aumento de volume" }),
      expect.anything(),
    );
  });
});
