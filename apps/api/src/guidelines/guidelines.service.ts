import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditLogService } from "../common/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { SetGuidelineDto } from "./dto/set-guideline.dto";

/**
 * Diretrizes (itens 4/19) — versionadas: alterar nunca sobrescreve a
 * quantidade, encerra a linha vigente e cria uma nova, atomicamente. A
 * diretriz vigente de um par Cliente+Meio passa a valer imediatamente
 * (item 4) para qualquer processo lançado dali em diante — ver
 * docs/DECISIONS.md sobre o efeito em construções já em andamento.
 */
@Injectable()
export class GuidelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async setGuideline(dto: SetGuidelineDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.guideline.findFirst({
        where: { clientId: dto.clientId, mediaChannelId: dto.mediaChannelId, active: true },
      });

      if (current && !dto.reason) {
        throw new BadRequestException(
          "Já existe uma diretriz vigente para este Cliente + Meio — informe o motivo da alteração.",
        );
      }

      if (current) {
        await tx.guideline.update({
          where: { id: current.id },
          data: { active: false, supersededAt: new Date() },
        });
      }

      const created = await tx.guideline.create({
        data: {
          clientId: dto.clientId,
          mediaChannelId: dto.mediaChannelId,
          targetCount: dto.targetCount,
          returnLimit: dto.returnLimit ?? current?.returnLimit ?? 2,
          changeReason: dto.reason,
          createdByUserId: userId,
        },
      });

      await this.auditLog.record(
        {
          userId,
          entityType: "Guideline",
          entityId: created.id,
          action: current ? "UPDATE" : "CREATE",
          before: current
            ? { targetCount: current.targetCount, returnLimit: current.returnLimit }
            : undefined,
          after: { targetCount: created.targetCount, returnLimit: created.returnLimit },
          reason: dto.reason,
        },
        tx,
      );

      return created;
    });
  }

  current(clientId: string, mediaChannelId: string) {
    return this.prisma.guideline.findFirst({ where: { clientId, mediaChannelId, active: true } });
  }

  /** Todas as diretrizes vigentes, para a tela de Configuração de Diretrizes (item 19). */
  listActive() {
    return this.prisma.guideline.findMany({
      where: { active: true },
      include: { client: true, mediaChannel: true },
      orderBy: [{ client: { name: "asc" } }, { mediaChannel: { name: "asc" } }],
    });
  }

  /** Histórico de alterações de um par Cliente+Meio (item 19). */
  history(clientId: string, mediaChannelId: string) {
    return this.prisma.guideline.findMany({
      where: { clientId, mediaChannelId },
      orderBy: { effectiveFrom: "desc" },
    });
  }
}
