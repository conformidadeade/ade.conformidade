import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, SkillEvidenceOrigin } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { cellToText } from "../common/excel-cell-text";
import { PrismaService } from "../prisma/prisma.service";
import { ListSkillsQuery } from "./dto/list-skills.query";
import { SkillImportRowError, SkillsImportValidationError } from "./errors";

type Db = PrismaService | Prisma.TransactionClient;

export interface SkillSummary {
  id: string;
  analystId: string;
  analystName: string;
  clientId: string;
  clientName: string;
  mediaChannelId: string;
  mediaChannelName: string;
  evidenceCount: number;
  firstEvidenceAt: string;
}

export interface SkillEvidenceRow {
  id: string;
  piNumber: string;
  origin: SkillEvidenceOrigin;
  recordedByName: string;
  createdAt: string;
}

export interface ImportResult {
  rowsImported: number;
  skillsAffected: number;
}

/**
 * Mapa de Habilidades (item 6) — registro de competência histórica,
 * paralelo e independente do motor de reanálise (item 6.5). Nunca lê nem
 * escreve em AnalystClientMedia.
 */
@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Upsert da habilidade + evidência — usado pelas 3 origens (item 6.2). */
  async recordEvidence(
    input: {
      analystId: string;
      clientId: string;
      mediaChannelId: string;
      piNumber: string;
      origin: SkillEvidenceOrigin;
      recordedByUserId: string;
    },
    db: Db = this.prisma,
  ): Promise<{ id: string }> {
    const skill = await db.analystSkill.upsert({
      where: {
        analystId_clientId_mediaChannelId: {
          analystId: input.analystId,
          clientId: input.clientId,
          mediaChannelId: input.mediaChannelId,
        },
      },
      create: { analystId: input.analystId, clientId: input.clientId, mediaChannelId: input.mediaChannelId },
      update: {},
    });
    await db.analystSkillEvidence.create({
      data: {
        skillId: skill.id,
        piNumber: input.piNumber,
        origin: input.origin,
        recordedByUserId: input.recordedByUserId,
      },
    });
    return { id: skill.id };
  }

  async createManual(
    dto: { analystId: string; clientId: string; mediaChannelId: string; piNumber: string },
    userId: string,
  ): Promise<{ id: string }> {
    return this.prisma.$transaction((tx) => this.recordEvidence({ ...dto, origin: "MANUAL", recordedByUserId: userId }, tx));
  }

  async getMap(query: ListSkillsQuery): Promise<SkillSummary[]> {
    const skills = await this.prisma.analystSkill.findMany({
      where: { analystId: query.analystId, clientId: query.clientId, mediaChannelId: query.mediaChannelId },
      include: {
        analyst: true,
        client: true,
        mediaChannel: true,
        evidences: { orderBy: { createdAt: "asc" }, take: 1 },
        _count: { select: { evidences: true } },
      },
      orderBy: [{ client: { name: "asc" } }, { mediaChannel: { name: "asc" } }, { analyst: { name: "asc" } }],
    });

    return skills.map((s) => ({
      id: s.id,
      analystId: s.analystId,
      analystName: s.analyst.name,
      clientId: s.clientId,
      clientName: s.client.name,
      mediaChannelId: s.mediaChannelId,
      mediaChannelName: s.mediaChannel.name,
      evidenceCount: s._count.evidences,
      firstEvidenceAt: (s.evidences[0]?.createdAt ?? s.createdAt).toISOString(),
    }));
  }

  /** Histórico completo de evidências de uma habilidade — sem conceito de "ciclo" (item 6.4). */
  async getEvidences(skillId: string, requestingUser: AuthenticatedUser): Promise<SkillEvidenceRow[]> {
    const skill = await this.prisma.analystSkill.findUnique({ where: { id: skillId } });
    // Mesma mensagem para "não existe" e "existe mas não é sua" (adendo
    // "Acesso restrito", item 1) — não confirma para o ANALISTA que um ID
    // de outra pessoa é válido.
    if (!skill || (requestingUser.role === "ANALISTA" && skill.analystId !== requestingUser.analystId)) {
      throw new NotFoundException(`Habilidade ${skillId} não encontrada.`);
    }

    const evidences = await this.prisma.analystSkillEvidence.findMany({
      where: { skillId },
      include: { recordedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return evidences.map((e) => ({
      id: e.id,
      piNumber: e.piNumber,
      origin: e.origin,
      recordedByName: e.recordedBy.name,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  /**
   * Importação em massa (item 6.3): valida a planilha inteira antes de
   * gravar qualquer linha (tudo ou nada). PI duplicado — dentro da
   * planilha ou já existente — não é erro, vira só mais uma evidência.
   */
  async importFromWorkbook(
    buffer: Buffer,
    userId: string,
    fileMeta?: { originalName?: string; size?: number },
  ): Promise<ImportResult> {
    // Nível debug (não aparece em produção com o log level padrão) —
    // mantido de propósito, não é temporário: foi o que permitiu confirmar
    // rápido um bug real de "planilha com mais de uma aba lia sempre a
    // primeira" (ver parseWorkbook) correlacionando arquivo da requisição
    // com o que de fato foi parseado. Útil para qualquer relato parecido.
    this.logger.debug(
      `import recebido: arquivo="${fileMeta?.originalName ?? "?"}" tamanho=${fileMeta?.size ?? buffer.length}B usuario=${userId}`,
    );
    const rows = await this.parseWorkbook(buffer);

    const [analysts, clients, mediaChannels] = await Promise.all([
      this.prisma.analyst.findMany(),
      this.prisma.client.findMany(),
      this.prisma.mediaChannel.findMany(),
    ]);
    const byName = <T extends { name: string }>(items: T[]) =>
      new Map(items.map((i) => [i.name.trim().toLowerCase(), i]));
    const analystByName = byName(analysts);
    const clientByName = byName(clients);
    const mediaByName = byName(mediaChannels);

    const errors: SkillImportRowError[] = [];
    for (const r of rows) {
      if (!analystByName.has(r.analystName.toLowerCase())) {
        errors.push({ line: r.line, column: "ANALISTA", value: r.analystName });
      }
      if (!clientByName.has(r.clientName.toLowerCase())) {
        errors.push({ line: r.line, column: "CLIENTE", value: r.clientName });
      }
      if (!mediaByName.has(r.mediaName.toLowerCase())) {
        errors.push({ line: r.line, column: "MEIO", value: r.mediaName });
      }
      if (!r.piNumber) {
        errors.push({ line: r.line, column: "PI", value: "(vazio)" });
      }
    }

    if (errors.length > 0) {
      throw new SkillsImportValidationError(errors);
    }

    const skillIds = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const analyst = analystByName.get(r.analystName.toLowerCase())!;
        const client = clientByName.get(r.clientName.toLowerCase())!;
        const media = mediaByName.get(r.mediaName.toLowerCase())!;
        const skill = await this.recordEvidence(
          {
            analystId: analyst.id,
            clientId: client.id,
            mediaChannelId: media.id,
            piNumber: r.piNumber,
            origin: "IMPORTACAO",
            recordedByUserId: userId,
          },
          tx,
        );
        skillIds.add(skill.id);
      }
    });

    return { rowsImported: rows.length, skillsAffected: skillIds.size };
  }

  private static readonly REQUIRED_COLUMNS = ["ANALISTA", "CLIENTE", "MEIO", "PI"] as const;

  /** Cabeçalhos (linha 1) de uma aba, na ordem das colunas — texto plano via cellToText. */
  private readHeaders(sheet: ExcelJS.Worksheet): string[] {
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = cellToText(cell.value).trim().toUpperCase();
    });
    return headers;
  }

  private async parseWorkbook(
    buffer: Buffer,
  ): Promise<{ line: number; analystName: string; clientName: string; mediaName: string; piNumber: string }[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    if (workbook.worksheets.length === 0) {
      throw new SkillsImportValidationError([{ line: 0, column: "ANALISTA", value: "planilha vazia ou sem abas" }]);
    }

    const required = SkillsService.REQUIRED_COLUMNS;
    const sheetsHeaders = workbook.worksheets.map((s) => ({ sheet: s, headers: this.readHeaders(s) }));

    this.logger.debug(
      `planilha com ${sheetsHeaders.length} aba(s): ` +
        sheetsHeaders.map(({ sheet: s, headers }) => `"${s.name}" [${headers.filter(Boolean).join(", ")}]`).join(" | "),
    );

    // Bug real corrigido aqui: a versão anterior sempre lia
    // `workbook.worksheets[0]` — se a planilha do usuário tiver mais de uma
    // aba (ex.: uma aba de controle antiga reaproveitada + a aba nova no
    // formato pedido), e a aba certa não for a primeira, a importação lia
    // cabeçalhos de uma aba completamente diferente da que tinha os dados
    // reais, com mensagem de erro sem relação nenhuma com o que o usuário
    // preencheu. Agora procura, entre TODAS as abas, a primeira que tem as
    // 4 colunas exigidas — em qualquer ordem, não precisa ser a primeira aba.
    const match = sheetsHeaders.find(({ headers }) => required.every((c) => headers.includes(c)));

    if (!match) {
      const perSheet = sheetsHeaders
        .map(({ sheet: s, headers }) => `"${s.name}": ${headers.filter(Boolean).join(", ") || "(sem cabeçalho)"}`)
        .join(" | ");
      // Nenhuma aba tem as 4 juntas — reporta como "ausente" só o que
      // realmente falta na aba mais próxima (a com mais colunas batendo),
      // não as 4 de uma vez; isso mantém a mensagem certeira no caso comum
      // de uma única aba com 1 coluna digitada errado, e ainda mostra o
      // cabeçalho de toda aba do arquivo para o caso de aba errada.
      const bestCandidate = sheetsHeaders.reduce((best, current) => {
        const score = (h: string[]) => required.filter((c) => h.includes(c)).length;
        return score(current.headers) > score(best.headers) ? current : best;
      });
      const missingInBest = required.filter((c) => !bestCandidate.headers.includes(c));
      throw new SkillsImportValidationError(
        missingInBest.map((c) => ({
          line: 1,
          column: c,
          value: `esperado "${c}" — não encontrado. Cabeçalhos por aba do arquivo: ${perSheet}`,
        })),
      );
    }

    const { sheet, headers } = match;
    const colIndex: Partial<Record<(typeof required)[number], number>> = {};
    for (const c of required) {
      const idx = headers.indexOf(c);
      if (idx >= 0) colIndex[c] = idx + 1; // eachCell/getCell usam índice 1-based
    }

    const cellText = (row: ExcelJS.Row, col: number) => cellToText(row.getCell(col).value).trim();

    const rows: { line: number; analystName: string; clientName: string; mediaName: string; piNumber: string }[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const analystName = cellText(row, colIndex.ANALISTA!);
      const clientName = cellText(row, colIndex.CLIENTE!);
      const mediaName = cellText(row, colIndex.MEIO!);
      const piNumber = cellText(row, colIndex.PI!);
      if (!analystName && !clientName && !mediaName && !piNumber) return; // linha em branco — ignora
      rows.push({ line: rowNumber, analystName, clientName, mediaName, piNumber });
    });

    return rows;
  }
}
