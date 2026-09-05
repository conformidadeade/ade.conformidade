import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditLogService } from "../common/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAnalystDto, InactivateDto, UpdateAnalystDto } from "./dto/catalog-entry.dto";

/** Cadastro de Analistas (item 18) — nunca excluído fisicamente, apenas inativado. */
@Injectable()
export class AnalystsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateAnalystDto, userId: string) {
    try {
      const analyst = await this.prisma.analyst.create({ data: dto });
      await this.auditLog.record({ userId, entityType: "Analyst", entityId: analyst.id, action: "CREATE", after: analyst });
      return analyst;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Já existe um analista com este nome.");
      }
      throw error;
    }
  }

  list(includeInactive = false) {
    return this.prisma.analyst.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: "asc" },
    });
  }

  async update(id: string, dto: UpdateAnalystDto, userId: string) {
    const before = await this.prisma.analyst.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.analyst.update({ where: { id }, data: dto });
    await this.auditLog.record({ userId, entityType: "Analyst", entityId: id, action: "UPDATE", before, after });
    return after;
  }

  async inactivate(id: string, dto: InactivateDto, userId: string) {
    const before = await this.prisma.analyst.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.analyst.update({ where: { id }, data: { active: false } });
    await this.auditLog.record({
      userId,
      entityType: "Analyst",
      entityId: id,
      action: "INACTIVATE",
      before,
      after,
      reason: dto.reason,
    });
    return after;
  }

  async activate(id: string, userId: string) {
    const before = await this.prisma.analyst.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.analyst.update({ where: { id }, data: { active: true } });
    await this.auditLog.record({ userId, entityType: "Analyst", entityId: id, action: "ACTIVATE", before, after });
    return after;
  }
}
