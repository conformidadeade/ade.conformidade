import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PasswordService } from "../auth/password.service";
import { AuditLogService } from "../common/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

/** Mensagem única para o unique constraint de User.analystId (adendo "Acesso restrito", item 2). */
const ANALYST_ALREADY_LINKED_MESSAGE =
  "Este analista já está vinculado a outro usuário. Desvincule-o primeiro antes de vincular a um novo.";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateUserDto, performedByUserId: string) {
    if (dto.analystId) {
      await this.assertAnalystExists(dto.analystId);
    }
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: dto.role,
          analystId: dto.analystId,
        },
        select: { id: true, name: true, email: true, role: true, active: true, analystId: true, createdAt: true },
      });
      await this.auditLog.record({
        userId: performedByUserId,
        entityType: "User",
        entityId: user.id,
        action: "CREATE",
        after: user,
      });
      return user;
    } catch (error) {
      throw this.translateUniqueConstraint(error);
    }
  }

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        analystId: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async update(id: string, dto: UpdateUserDto, performedByUserId: string) {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id } });

    // `undefined` = campo ausente do corpo, não mexe no vínculo atual;
    // `null`/string = valor explícito do formulário (ver UpdateUserDto).
    if (dto.analystId !== undefined && dto.analystId !== null) {
      await this.assertAnalystExists(dto.analystId);
    }

    try {
      const after = await this.prisma.user.update({
        where: { id },
        data: {
          name: dto.name,
          role: dto.role,
          active: dto.active,
          ...(dto.analystId !== undefined ? { analystId: dto.analystId } : {}),
        },
        select: { id: true, name: true, email: true, role: true, active: true, analystId: true },
      });
      await this.auditLog.record({
        userId: performedByUserId,
        entityType: "User",
        entityId: id,
        action: "UPDATE",
        before: { name: before.name, role: before.role, active: before.active, analystId: before.analystId },
        after,
      });
      return after;
    } catch (error) {
      throw this.translateUniqueConstraint(error);
    }
  }

  private async assertAnalystExists(analystId: string): Promise<void> {
    const analyst = await this.prisma.analyst.findUnique({ where: { id: analystId } });
    if (!analyst) {
      throw new BadRequestException("Analista não encontrado.");
    }
  }

  /** Distingue o unique de email do unique de analystId — mesma exceção P2002 para os dois. */
  private translateUniqueConstraint(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      if (target.includes("analystId")) {
        return new ConflictException(ANALYST_ALREADY_LINKED_MESSAGE);
      }
      return new ConflictException("Já existe um usuário com este e-mail.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return new NotFoundException("Usuário não encontrado.");
    }
    return error as Error;
  }
}
