import { ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as ExcelJS from "exceljs";
import request from "supertest";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { PrismaService } from "../prisma/prisma.service";
import { SkillsController } from "./skills.controller";
import { SkillsService } from "./skills.service";

/**
 * Teste de INTEGRAÇÃO (não unitário): sobe o controller de verdade,
 * passando pelo FileInterceptor/multer real, e envia um upload multipart
 * de verdade via supertest — não chama o parser diretamente. É o que
 * pega justamente o tipo de bug relatado (arquivo/aba errada sendo lida)
 * que um teste unitário do parser isolado não cobriria, porque exercita
 * a mesma via de entrada (rota HTTP + multipart) que o navegador usa.
 */
describe("POST /skills/import (integração — multipart real)", () => {
  let app: INestApplication;

  const LIDERANCA_USER: AuthenticatedUser = { id: "u-lider", role: "LIDERANCA", analystId: null };

  const fakePrisma = {
    analyst: { findMany: async () => [{ id: "a1", name: "Maria Fase2" }] },
    client: { findMany: async () => [{ id: "c1", name: "SECOM" }] },
    mediaChannel: { findMany: async () => [{ id: "m1", name: "TV" }] },
    $transaction: async (work: (tx: unknown) => unknown) =>
      work({
        analystSkill: {
          upsert: async ({ create }: any) => ({ id: "skill-1", ...create }),
        },
        analystSkillEvidence: {
          create: async ({ data }: any) => ({ id: "ev-1", ...data }),
        },
      }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SkillsController],
      providers: [SkillsService, { provide: PrismaService, useValue: fakePrisma }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = LIDERANCA_USER;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function buildXlsx(sheets: { name: string; header: string[]; rows: (string | number)[][] }[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    for (const s of sheets) {
      const sheet = wb.addWorksheet(s.name);
      sheet.addRow(s.header);
      for (const row of s.rows) sheet.addRow(row);
    }
    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  test("planilha de aba única, cabeçalho correto → importa de verdade pela rota HTTP", async () => {
    const buffer = await buildXlsx([
      { name: "Habilidades", header: ["ANALISTA", "CLIENTE", "MEIO", "PI"], rows: [["Maria Fase2", "SECOM", "TV", "PI-HTTP-1"]] },
    ]);

    const res = await request(app.getHttpServer())
      .post("/skills/import")
      .attach("file", buffer, "planilha.xlsx")
      .expect(201);

    expect(res.body).toEqual({ rowsImported: 1, skillsAffected: 1 });
  });

  test("bug relatado: planilha com 2 abas (uma decoy antes da correta) — a resposta de erro/sucesso corresponde ao ARQUIVO ENVIADO NESTA REQUISIÇÃO, não a outra planilha", async () => {
    // Aba 1 é uma decoy que imita uma planilha antiga (matriz de meios como
    // colunas) — o bug original sempre lia workbook.worksheets[0] e reportava
    // esses cabeçalhos, mesmo a aba certa existindo mais adiante no arquivo.
    const buffer = await buildXlsx([
      { name: "Controle Antigo", header: ["ANALISTA", "CLIENTE", "QTD", "TV", "RD"], rows: [["Maria Fase2", "SECOM", 5, 1, 0]] },
      { name: "Importar Habilidades", header: ["ANALISTA", "CLIENTE", "MEIO", "PI"], rows: [["Maria Fase2", "SECOM", "TV", "PI-HTTP-2"]] },
    ]);

    const res = await request(app.getHttpServer())
      .post("/skills/import")
      .attach("file", buffer, "planilha-duas-abas.xlsx")
      .expect(201);

    // Encontrou a aba certa (a 2ª) em vez de travar nos cabeçalhos da 1ª.
    expect(res.body).toEqual({ rowsImported: 1, skillsAffected: 1 });
  });

  test("nenhuma aba tem as 4 colunas: a resposta de erro lista os cabeçalhos de CADA aba desta requisição específica", async () => {
    const buffer = await buildXlsx([
      { name: "Aba A", header: ["X", "Y"], rows: [] },
      { name: "Aba B", header: ["ANALISTA", "CLIENTE"], rows: [] },
    ]);

    const res = await request(app.getHttpServer())
      .post("/skills/import")
      .attach("file", buffer, "planilha-sem-coluna.xlsx")
      .expect(422);

    const body = res.body as { errors: { column: string; value: string }[] };
    expect(body.errors.every((e) => e.value.includes('"Aba A": X, Y') && e.value.includes('"Aba B": ANALISTA, CLIENTE'))).toBe(
      true,
    );
  });

  test("duas requisições seguidas com arquivos diferentes não se confundem (isolamento entre requisições)", async () => {
    const bufferA = await buildXlsx([
      { name: "S", header: ["ANALISTA", "CLIENTE", "MEIO", "PI"], rows: [["Maria Fase2", "SECOM", "TV", "PI-ISOLA-A"]] },
    ]);
    const bufferB = await buildXlsx([{ name: "S", header: ["X"], rows: [] }]);

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer()).post("/skills/import").attach("file", bufferA, "a.xlsx"),
      request(app.getHttpServer()).post("/skills/import").attach("file", bufferB, "b.xlsx"),
    ]);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(422);
  });
});
