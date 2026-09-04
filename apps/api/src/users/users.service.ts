import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PasswordService } from "../auth/password.service";
import { AuditLogService } from "../common/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateUserDto, performedByUserId: string) {
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
        select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Já existe um usuário com este e-mail.");
      }
      throw error;
    }
  }

  list() {
    return this.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true },
      orderBy: { name: "asc" },
    });
  }

  async update(id: string, dto: UpdateUserDto, performedByUserId: string) {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.user.update({
      where: { id },
      data: { name: dto.name, role: dto.role, active: dto.active },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    await this.auditLog.record({
      userId: performedByUserId,
      entityType: "User",
      entityId: id,
      action: "UPDATE",
      before: { name: before.name, role: before.role, active: before.active },
      after,
    });
    return after;
  }
}
