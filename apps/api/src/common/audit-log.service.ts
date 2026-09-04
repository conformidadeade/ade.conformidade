import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditLogInput {
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

/**
 * Grava em `audit_logs` (item 24). Usado para CRUD de cadastros, diretrizes
 * e usuários — mudanças de estado de uma combinação usam ReanalysisEvent,
 * que carrega contexto de domínio próprio (ver módulo release).
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditLogInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        userId: input.userId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
        reason: input.reason,
      },
    });
  }
}
