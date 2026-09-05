import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditLogService } from "../common/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCatalogEntryDto, InactivateDto, UpdateCatalogEntryDto } from "./dto/catalog-entry.dto";

/** Cadastro de Meios de veiculação (item 18) — nunca excluído fisicamente, apenas inativado. */
@Injectable()
export class MediaChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateCatalogEntryDto, userId: string) {
    try {
      const mediaChannel = await this.prisma.mediaChannel.create({ data: dto });
      await this.auditLog.record({
        userId,
        entityType: "MediaChannel",
        entityId: mediaChannel.id,
        action: "CREATE",
        after: mediaChannel,
      });
      return mediaChannel;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Já existe um meio com este nome.");
      }
      throw error;
    }
  }

  list(includeInactive = false) {
    return this.prisma.mediaChannel.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: "asc" },
    });
  }

  async update(id: string, dto: UpdateCatalogEntryDto, userId: string) {
    const before = await this.prisma.mediaChannel.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.mediaChannel.update({ where: { id }, data: dto });
    await this.auditLog.record({ userId, entityType: "MediaChannel", entityId: id, action: "UPDATE", before, after });
    return after;
  }

  async inactivate(id: string, dto: InactivateDto, userId: string) {
    const before = await this.prisma.mediaChannel.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.mediaChannel.update({ where: { id }, data: { active: false } });
    await this.auditLog.record({
      userId,
      entityType: "MediaChannel",
      entityId: id,
      action: "INACTIVATE",
      before,
      after,
      reason: dto.reason,
    });
    return after;
  }

  async activate(id: string, userId: string) {
    const before = await this.prisma.mediaChannel.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.mediaChannel.update({ where: { id }, data: { active: true } });
    await this.auditLog.record({ userId, entityType: "MediaChannel", entityId: id, action: "ACTIVATE", before, after });
    return after;
  }
}
