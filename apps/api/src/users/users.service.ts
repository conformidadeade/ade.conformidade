import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { AuthTokenService } from "../auth/auth-token.service";
import { PasswordService } from "../auth/password.service";
import { AuditLogService } from "../common/audit-log.service";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

/** Mensagem única para o unique constraint de User.analystId (adendo "Acesso restrito", item 2). */
const ANALYST_ALREADY_LINKED_MESSAGE =
  "Este analista já está vinculado a outro usuário. Desvincule-o primeiro antes de vincular a um novo.";

const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  analystId: true,
  lastLoginAt: true,
  createdAt: true,
  emailConfirmedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly auditLog: AuditLogService,
    private readonly authTokens: AuthTokenService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Adendo "Confirmação de e-mail e recuperação de senha" (09/09/2026) —
   * a conta nasce sem senha (`passwordHash: null`) e um convite é enviado
   * por e-mail. Se o envio falhar, a conta já foi criada normalmente
   * (não é revertida) — o admin ainda tem "Reenviar convite" como
   * caminho alternativo, então uma falha de e-mail não trava o cadastro.
   */
  async create(dto: CreateUserDto, performedByUserId: string) {
    if (dto.analystId) {
      await this.assertAnalystExists(dto.analystId);
    }
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash: null,
          role: dto.role,
          analystId: dto.analystId,
        },
        select: USER_LIST_SELECT,
      });
      await this.auditLog.record({
        userId: performedByUserId,
        entityType: "User",
        entityId: user.id,
        action: "CREATE",
        after: user,
      });
      await this.sendInvite(user.id, user.name, user.email);
      return user;
    } catch (error) {
      throw this.translateUniqueConstraint(error);
    }
  }

  list() {
    return this.prisma.user.findMany({
      select: USER_LIST_SELECT,
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

    // Troca de senha (adendo "Deploy limpo") — hash calculado antes do
    // update, mesmo mecanismo usado em create(); nunca logada em texto
    // puro nem incluída no audit log (select/before/after abaixo nunca
    // trazem passwordHash). Continua existindo como caminho alternativo
    // manual ao fluxo de convite/reset por e-mail (adendo "Confirmação de
    // e-mail...", item 4 — nunca removido). Se o admin definir a senha de
    // uma conta ainda não confirmada por aqui, ela passa a valer
    // imediatamente — carimba emailConfirmedAt também, se ainda não tinha.
    const passwordHash = dto.password ? await this.passwords.hash(dto.password) : undefined;

    try {
      const after = await this.prisma.user.update({
        where: { id },
        data: {
          name: dto.name,
          role: dto.role,
          active: dto.active,
          ...(dto.analystId !== undefined ? { analystId: dto.analystId } : {}),
          ...(passwordHash !== undefined ? { passwordHash } : {}),
          ...(passwordHash !== undefined && !before.emailConfirmedAt ? { emailConfirmedAt: new Date() } : {}),
        },
        select: USER_LIST_SELECT,
      });
      await this.auditLog.record({
        userId: performedByUserId,
        entityType: "User",
        entityId: id,
        action: "UPDATE",
        before: { name: before.name, role: before.role, active: before.active, analystId: before.analystId },
        after: { ...after, passwordChanged: passwordHash !== undefined },
      });
      return after;
    } catch (error) {
      throw this.translateUniqueConstraint(error);
    }
  }

  /** Botão "Reenviar convite" (item 1) — invalida qualquer convite anterior e manda um novo. */
  async resendInvite(id: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (user.passwordHash) {
      throw new BadRequestException("Esta conta já confirmou o e-mail e definiu senha — não há convite para reenviar.");
    }
    await this.sendInvite(user.id, user.name, user.email);
  }

  private async sendInvite(userId: string, name: string, email: string): Promise<void> {
    const token = await this.authTokens.issue(userId, "INVITE");
    const frontendUrl = this.config.get<string>("CORS_ORIGIN", "http://localhost:4002");
    const link = `${frontendUrl}/definir-senha/${token}`;
    try {
      await this.email.sendInviteEmail(email, name, link);
    } catch (error) {
      // Não propaga — a conta já foi criada/já existe; "Reenviar convite" é o caminho de recuperação.
      this.logger.error(`Falha ao enviar convite para ${email}: ${(error as Error).message}`);
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
