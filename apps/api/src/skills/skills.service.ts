import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SkillEvidenceOrigin } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { AuthenticatedUser } from "../auth/jwt-payload";
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
  async importFromWorkbook(buffer: Buffer, userId: string): Promise<ImportResult> {
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

  private async parseWorkbook(
    buffer: Buffer,
  ): Promise<{ line: number; analystName: string; clientName: string; mediaName: string; piNumber: string }[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new SkillsImportValidationError([{ line: 0, column: "ANALISTA", value: "planilha vazia ou sem abas" }]);
    }

    const REQUIRED_COLUMNS = ["ANALISTA", "CLIENTE", "MEIO", "PI"] as const;
    const colIndex: Partial<Record<(typeof REQUIRED_COLUMNS)[number], number>> = {};
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const key = String(cell.value ?? "").trim().toUpperCase();
      if ((REQUIRED_COLUMNS as readonly string[]).includes(key)) {
        colIndex[key as (typeof REQUIRED_COLUMNS)[number]] = colNumber;
      }
    });
    const missingColumns = REQUIRED_COLUMNS.filter((c) => !colIndex[c]);
    if (missingColumns.length > 0) {
      throw new SkillsImportValidationError(
        missingColumns.map((c) => ({ line: 1, column: c, value: "coluna ausente no cabeçalho" })),
      );
    }

    const cellText = (row: ExcelJS.Row, col: number) => String(row.getCell(col).value ?? "").trim();

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
