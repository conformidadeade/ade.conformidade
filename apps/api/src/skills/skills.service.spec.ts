import * as ExcelJS from "exceljs";
import { SkillsImportValidationError } from "./errors";
import { SkillsService } from "./skills.service";

async function buildWorkbookBuffer(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Habilidades");
  sheet.addRow(["ANALISTA", "CLIENTE", "MEIO", "PI"]);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

interface FakeSkill {
  id: string;
  analystId: string;
  clientId: string;
  mediaChannelId: string;
}
interface FakeEvidence {
  id: string;
  skillId: string;
  piNumber: string;
  origin: string;
  recordedByUserId: string;
}

function buildPrismaFake(seed: {
  analysts: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  mediaChannels: { id: string; name: string }[];
}) {
  const skills: FakeSkill[] = [];
  const evidences: FakeEvidence[] = [];
  let seq = 0;

  const upsertSkill = (input: { analystId: string; clientId: string; mediaChannelId: string }) => {
    let skill = skills.find(
      (s) => s.analystId === input.analystId && s.clientId === input.clientId && s.mediaChannelId === input.mediaChannelId,
    );
    if (!skill) {
      skill = { id: `skill-${++seq}`, ...input };
      skills.push(skill);
    }
    return skill;
  };

  const db = {
    analystSkill: { upsert: jest.fn(async ({ create }: any) => upsertSkill(create)) },
    analystSkillEvidence: {
      create: jest.fn(async ({ data }: any) => {
        const evidence = { id: `ev-${++seq}`, ...data };
        evidences.push(evidence);
        return evidence;
      }),
    },
  };

  return {
    skills,
    evidences,
    analyst: { findMany: jest.fn(async () => seed.analysts) },
    client: { findMany: jest.fn(async () => seed.clients) },
    mediaChannel: { findMany: jest.fn(async () => seed.mediaChannels) },
    $transaction: jest.fn(async (work: (tx: unknown) => unknown) => work(db)),
  };
}

describe("SkillsService.importFromWorkbook (adendo Fase 2, item 6.3)", () => {
  function buildSeed() {
    return {
      analysts: [{ id: "a1", name: "João Teste" }],
      clients: [{ id: "c1", name: "SECOM" }],
      mediaChannels: [{ id: "m1", name: "TV" }],
    };
  }

  test("planilha com cliente inexistente é rejeitada inteira, nenhuma linha gravada, relatório aponta linha e valor", async () => {
    const prisma = buildPrismaFake(buildSeed());
    const service = new SkillsService(prisma as never);
    const buffer = await buildWorkbookBuffer([
      ["João Teste", "SECOM", "TV", "PI-1"],
      ["João Teste", "CLIENTE-QUE-NAO-EXISTE", "TV", "PI-2"],
    ]);

    await expect(service.importFromWorkbook(buffer, "user-1")).rejects.toThrow(SkillsImportValidationError);

    try {
      await service.importFromWorkbook(buffer, "user-1");
    } catch (error) {
      expect(error).toBeInstanceOf(SkillsImportValidationError);
      const err = error as SkillsImportValidationError;
      expect(err.errors).toEqual([{ line: 3, column: "CLIENTE", value: "CLIENTE-QUE-NAO-EXISTE" }]);
    }
    expect(prisma.skills).toHaveLength(0);
    expect(prisma.evidences).toHaveLength(0);
  });

  test("planilha 100% válida, com PI repetido entre linhas, cria/atualiza habilidades e grava todas as evidências", async () => {
    const prisma = buildPrismaFake(buildSeed());
    const service = new SkillsService(prisma as never);
    const buffer = await buildWorkbookBuffer([
      ["João Teste", "SECOM", "TV", "PI-100"],
      ["João Teste", "SECOM", "TV", "PI-100"], // PI repetido — não é erro, vira 2ª evidência
      ["João Teste", "SECOM", "TV", "PI-200"],
    ]);

    const result = await service.importFromWorkbook(buffer, "user-1");

    expect(result.rowsImported).toBe(3);
    expect(result.skillsAffected).toBe(1); // mesma combinação analista+cliente+meio nas 3 linhas
    expect(prisma.skills).toHaveLength(1);
    expect(prisma.evidences).toHaveLength(3);
    expect(prisma.evidences.every((e) => e.origin === "IMPORTACAO")).toBe(true);
  });

  test("resolução de nome é case-insensitive e com espaços nas pontas", async () => {
    const prisma = buildPrismaFake(buildSeed());
    const service = new SkillsService(prisma as never);
    const buffer = await buildWorkbookBuffer([["  joão teste  ", "secom", "tv", "PI-1"]]);

    const result = await service.importFromWorkbook(buffer, "user-1");
    expect(result.rowsImported).toBe(1);
    expect(prisma.skills).toHaveLength(1);
  });
});
