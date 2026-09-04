import { Injectable } from "@nestjs/common";
import { AuditLogService } from "../common/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCatalogEntryDto, InactivateDto, UpdateCatalogEntryDto } from "./dto/catalog-entry.dto";

/** Cadastro de Clientes (item 18) — nunca excluído fisicamente, apenas inativado. */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateCatalogEntryDto, userId: string) {
    const client = await this.prisma.client.create({ data: dto });
    await this.auditLog.record({ userId, entityType: "Client", entityId: client.id, action: "CREATE", after: client });
    return client;
  }

  list(includeInactive = false) {
    return this.prisma.client.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: "asc" },
    });
  }

  async update(id: string, dto: UpdateCatalogEntryDto, userId: string) {
    const before = await this.prisma.client.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.client.update({ where: { id }, data: dto });
    await this.auditLog.record({ userId, entityType: "Client", entityId: id, action: "UPDATE", before, after });
    return after;
  }

  async inactivate(id: string, dto: InactivateDto, userId: string) {
    const before = await this.prisma.client.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.client.update({ where: { id }, data: { active: false } });
    await this.auditLog.record({
      userId,
      entityType: "Client",
      entityId: id,
      action: "INACTIVATE",
      before,
      after,
      reason: dto.reason,
    });
    return after;
  }

  async activate(id: string, userId: string) {
    const before = await this.prisma.client.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.client.update({ where: { id }, data: { active: true } });
    await this.auditLog.record({ userId, entityType: "Client", entityId: id, action: "ACTIVATE", before, after });
    return after;
  }
}
