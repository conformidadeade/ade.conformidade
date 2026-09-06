import { NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { AuthenticatedUser } from "../auth/jwt-payload";
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

/** Permite controlar o cabeçalho exato — usado para reproduzir o bug de colunas fora de ordem e/ou rich text. */
async function buildWorkbookWithHeader(
  header: string[],
  richTextCols: number[],
  rows: string[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Habilidades");
  const headerRow = sheet.addRow(header);
  for (const col of richTextCols) {
    headerRow.getCell(col).value = { richText: [{ text: header[col - 1]! }] };
  }
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
      createMany: jest.fn(async ({ data }: any) => {
        for (const d of data as any[]) evidences.push({ id: `ev-${++seq}`, ...d });
        return { count: data.length };
      }),
    },
  };

  return {
    skills,
    evidences,
    analyst: { findMany: jest.fn(async () => seed.analysts) },
    client: { findMany: jest.fn(async () => seed.clients) },
    mediaChannel: { findMany: jest.fn(async () => seed.mediaChannels) },
    // Expostos também no nível raiz (mesmos spies do `db` usado dentro da
    // transação) só para as asserções de "quantas idas ao banco" nos testes
    // do bug de timeout — o código de produção só os chama via tx.
    analystSkill: db.analystSkill,
    analystSkillEvidence: db.analystSkillEvidence,
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

describe("SkillsService.importFromWorkbook — bug: cabeçalho fora de ordem / rich text (relatado pelo usuário)", () => {
  function buildSeed() {
    return {
      analysts: [{ id: "a1", name: "João Teste" }],
      clients: [{ id: "c1", name: "SECOM" }],
      mediaChannels: [{ id: "m1", name: "TV" }],
    };
  }

  test("cabeçalho em ordem diferente da declarada no requisito (MEIO, PI, ANALISTA, CLIENTE) é reconhecido por nome, não por posição", async () => {
    const prisma = buildPrismaFake(buildSeed());
    const service = new SkillsService(prisma as never);
    const buffer = await buildWorkbookWithHeader(
      ["MEIO", "PI", "ANALISTA", "CLIENTE"],
      [],
      [["TV", "PI-1", "João Teste", "SECOM"]],
    );

    const result = await service.importFromWorkbook(buffer, "user-1");
    expect(result.rowsImported).toBe(1);
    expect(prisma.evidences[0]).toMatchObject({ piNumber: "PI-1" });
  });

  test("causa raiz do bug relatado: célula de cabeçalho com rich text (formatação em parte do texto) — antes virava \"[object Object]\" e a coluna era dada como ausente mesmo existindo", async () => {
    const prisma = buildPrismaFake(buildSeed());
    const service = new SkillsService(prisma as never);
    // Reproduz exatamente o sintoma relatado: reordenar as colunas não
    // resolvia porque o problema seguia a CÉLULA (rich text), não a posição.
    const buffer = await buildWorkbookWithHeader(
      ["ANALISTA", "CLIENTE", "MEIO", "PI"],
      [3, 4], // MEIO e PI gravados como rich text, como uma planilha editada à mão costuma gerar
      [["João Teste", "SECOM", "TV", "PI-1"]],
    );

    const result = await service.importFromWorkbook(buffer, "user-1");
    expect(result.rowsImported).toBe(1);
  });

  test("coluna realmente ausente: mensagem de erro mostra os cabeçalhos que foram lidos de fato", async () => {
    const prisma = buildPrismaFake(buildSeed());
    const service = new SkillsService(prisma as never);
    const buffer = await buildWorkbookWithHeader(
      ["ANALISTA", "CLIENTE", "VEICULO", "PI"], // "VEICULO" no lugar de "MEIO" — coluna esperada de fato ausente
      [],
      [["João Teste", "SECOM", "TV", "PI-1"]],
    );

    try {
      await service.importFromWorkbook(buffer, "user-1");
      fail("deveria ter lançado SkillsImportValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(SkillsImportValidationError);
      const err = error as SkillsImportValidationError;
      expect(err.errors).toHaveLength(1);
      expect(err.errors[0]!.column).toBe("MEIO");
      expect(err.errors[0]!.value).toContain("ANALISTA, CLIENTE, VEICULO, PI");
    }
  });
});

describe("SkillsService.importFromWorkbook — bug (novo): planilha com mais de uma aba lia sempre a primeira", () => {
  function buildSeed() {
    return {
      analysts: [{ id: "a1", name: "João Teste" }],
      clients: [{ id: "c1", name: "SECOM" }],
      mediaChannels: [{ id: "m1", name: "TV" }],
    };
  }

  async function buildMultiSheetWorkbook(sheets: { name: string; header: string[]; rows: string[][] }[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    for (const s of sheets) {
      const sheet = workbook.addWorksheet(s.name);
      sheet.addRow(s.header);
      for (const row of s.rows) sheet.addRow(row);
    }
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  test("aba decoy antes da aba certa (reproduz o sintoma relatado) — encontra a aba com as 4 colunas em vez de travar na primeira", async () => {
    const prisma = buildPrismaFake(buildSeed());
    const service = new SkillsService(prisma as never);
    const buffer = await buildMultiSheetWorkbook([
      {
        name: "Controle Antigo",
        header: ["ANALISTA", "CLIENTE", "QTD", "IN", "JN", "MD", "ME", "RV", "TVR", "TVN", "CN", "RD", "IC", "JC"],
        rows: [["João Teste", "SECOM", "5", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"]],
      },
      {
        name: "Importar Habilidades",
        header: ["ANALISTA", "CLIENTE", "MEIO", "PI"],
        rows: [["João Teste", "SECOM", "TV", "PI-MULTISHEET"]],
      },
    ]);

    const result = await service.importFromWorkbook(buffer, "user-1");
    expect(result.rowsImported).toBe(1);
    expect(prisma.evidences[0]).toMatchObject({ piNumber: "PI-MULTISHEET" });
  });

  test("nenhuma aba tem as 4 colunas juntas: mensagem de erro lista os cabeçalhos de cada aba, não só da primeira", async () => {
    const prisma = buildPrismaFake(buildSeed());
    const service = new SkillsService(prisma as never);
    const buffer = await buildMultiSheetWorkbook([
      { name: "Só duas colunas", header: ["ANALISTA", "CLIENTE"], rows: [] },
      { name: "Outra aba qualquer", header: ["FOO", "BAR"], rows: [] },
    ]);

    try {
      await service.importFromWorkbook(buffer, "user-1");
      fail("deveria ter lançado SkillsImportValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(SkillsImportValidationError);
      const err = error as SkillsImportValidationError;
      expect(err.errors[0]!.value).toContain('"Só duas colunas": ANALISTA, CLIENTE');
      expect(err.errors[0]!.value).toContain('"Outra aba qualquer": FOO, BAR');
    }
  });
});

describe("SkillsService.getEvidences — isolamento por ANALISTA (adendo Acesso restrito, item 1)", () => {
  function buildEvidencesFake(skill: { id: string; analystId: string } | null) {
    return {
      analystSkill: { findUnique: jest.fn(async () => skill) },
      analystSkillEvidence: { findMany: jest.fn(async () => []) },
    };
  }

  test("ANALISTA acessando a própria habilidade enxerga as evidências normalmente", async () => {
    const prisma = buildEvidencesFake({ id: "skill-1", analystId: "analyst-a" });
    const service = new SkillsService(prisma as never);
    const analista: AuthenticatedUser = { id: "u-analista", role: "ANALISTA", analystId: "analyst-a" };
    await expect(service.getEvidences("skill-1", analista)).resolves.toEqual([]);
  });

  test("ANALISTA tentando acessar a habilidade de outro analista via ID manipulado recebe NotFoundException", async () => {
    const prisma = buildEvidencesFake({ id: "skill-1", analystId: "analyst-b" });
    const service = new SkillsService(prisma as never);
    const analista: AuthenticatedUser = { id: "u-analista", role: "ANALISTA", analystId: "analyst-a" };
    await expect(service.getEvidences("skill-1", analista)).rejects.toThrow(NotFoundException);
  });

  test("LIDERANCA acessa qualquer habilidade normalmente", async () => {
    const prisma = buildEvidencesFake({ id: "skill-1", analystId: "analyst-b" });
    const service = new SkillsService(prisma as never);
    const lideranca: AuthenticatedUser = { id: "u-lider", role: "LIDERANCA", analystId: null };
    await expect(service.getEvidences("skill-1", lideranca)).resolves.toEqual([]);
  });
});

describe("SkillsService.importFromWorkbook — bug (novo): timeout de transação em planilha grande", () => {
  function buildSeed() {
    return {
      analysts: [
        { id: "a1", name: "Ana Correa" },
        { id: "a2", name: "Bruno Silva" },
        { id: "a3", name: "Carla Nunes" },
      ],
      clients: [{ id: "c1", name: "SECOM" }],
      mediaChannels: [{ id: "m1", name: "TV" }],
    };
  }

  async function buildWorkbook(rows: string[][]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Habilidades");
    sheet.addRow(["ANALISTA", "CLIENTE", "MEIO", "PI"]);
    for (const row of rows) sheet.addRow(row);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  test("PI repetido entre analistas DIFERENTES (habilidades diferentes) importa com sucesso — cada um recebe sua própria evidência", async () => {
    const prisma = buildPrismaFake(buildSeed());
    const service = new SkillsService(prisma as never);
    // Mesmo PI, três analistas diferentes — regra confirmada: não é motivo de bloqueio.
    const buffer = await buildWorkbook([
      ["Ana Correa", "SECOM", "TV", "PI-COMPARTILHADO"],
      ["Bruno Silva", "SECOM", "TV", "PI-COMPARTILHADO"],
      ["Carla Nunes", "SECOM", "TV", "PI-COMPARTILHADO"],
    ]);

    const result = await service.importFromWorkbook(buffer, "user-1");

    expect(result.rowsImported).toBe(3);
    expect(result.skillsAffected).toBe(3); // 3 combinações analista+cliente+meio distintas
    expect(prisma.skills).toHaveLength(3);
    expect(prisma.evidences).toHaveLength(3);
    expect(prisma.evidences.every((e) => e.piNumber === "PI-COMPARTILHADO")).toBe(true);
    // Cada evidência aponta para a skill do analista certo, não todas para a mesma.
    const skillIds = new Set(prisma.evidences.map((e) => e.skillId));
    expect(skillIds.size).toBe(3);
  });

  test("causa raiz do bug relatado: número de idas ao banco não cresce linearmente com o número de linhas", async () => {
    const prisma = buildPrismaFake(buildSeed());
    const service = new SkillsService(prisma as never);
    // 30 linhas, mas só 3 combinações analista+cliente+meio distintas (cada
    // analista repete a mesma combinação 10x com PIs diferentes) — a versão
    // anterior fazia 2 idas ao banco POR LINHA (60 chamadas sequenciais);
    // isso, numa planilha grande de verdade, estourava o timeout padrão de
    // 5s da transação interativa do Prisma ("Transaction already closed").
    const rows: string[][] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(["Ana Correa", "SECOM", "TV", `PI-A-${i}`]);
      rows.push(["Bruno Silva", "SECOM", "TV", `PI-B-${i}`]);
      rows.push(["Carla Nunes", "SECOM", "TV", `PI-C-${i}`]);
    }
    const buffer = await buildWorkbook(rows);

    const result = await service.importFromWorkbook(buffer, "user-1");

    expect(result.rowsImported).toBe(30);
    expect(result.skillsAffected).toBe(3);
    // upsert só uma vez por combinação única (3), nunca por linha (30).
    expect(prisma.analystSkill.upsert).toHaveBeenCalledTimes(3);
    // Todas as evidências em UM único createMany, não 30 creates sequenciais.
    expect(prisma.analystSkillEvidence.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.analystSkillEvidence.create).not.toHaveBeenCalled();
    expect(prisma.evidences).toHaveLength(30);
  });
});
