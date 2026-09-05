import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AnalystsService } from "./analysts.service";
import { ClientsService } from "./clients.service";
import { MediaChannelsService } from "./media-channels.service";

function duplicateNameError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`name`)", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

function buildAuditLogFake() {
  return { record: jest.fn() };
}

describe("Catalog services — nome duplicado vira 409, não 500 (bug encontrado durante verificação manual)", () => {
  test("ClientsService.create traduz P2002 em ConflictException", async () => {
    const prisma = { client: { create: jest.fn().mockRejectedValue(duplicateNameError()) } };
    const service = new ClientsService(prisma as never, buildAuditLogFake() as never);
    await expect(service.create({ name: "SECOM" }, "user-1")).rejects.toThrow(ConflictException);
  });

  test("MediaChannelsService.create traduz P2002 em ConflictException", async () => {
    const prisma = { mediaChannel: { create: jest.fn().mockRejectedValue(duplicateNameError()) } };
    const service = new MediaChannelsService(prisma as never, buildAuditLogFake() as never);
    await expect(service.create({ name: "TV" }, "user-1")).rejects.toThrow(ConflictException);
  });

  test("AnalystsService.create traduz P2002 em ConflictException", async () => {
    const prisma = { analyst: { create: jest.fn().mockRejectedValue(duplicateNameError()) } };
    const service = new AnalystsService(prisma as never, buildAuditLogFake() as never);
    await expect(service.create({ name: "João Teste" }, "user-1")).rejects.toThrow(ConflictException);
  });
});
