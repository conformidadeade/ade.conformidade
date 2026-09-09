import { Injectable } from "@nestjs/common";
import { AuthTokenType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "./password.service";

const TTL_MS: Record<AuthTokenType, number> = {
  INVITE: 48 * 60 * 60 * 1000, // 48h
  PASSWORD_RESET: 60 * 60 * 1000, // 1h
};

/**
 * Tokens de uso único enviados por e-mail (adendo "Confirmação de e-mail
 * e recuperação de senha", 09/09/2026) — mesmo padrão de hash/expiração
 * já usado para o refresh token (nunca o valor puro persistido).
 * Compartilhado entre UsersService (emite convite) e AuthController
 * (confirma convite, emite/consome reset de senha).
 */
@Injectable()
export class AuthTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  /** Invalida qualquer token não usado do mesmo tipo antes de emitir um novo — nunca dois válidos ao mesmo tempo. */
  async issue(userId: string, type: AuthTokenType): Promise<string> {
    await this.invalidatePending(userId, type);
    const token = this.passwords.generateOpaqueToken();
    await this.prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash: this.passwords.hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + TTL_MS[type]),
      },
    });
    return token;
  }

  async invalidatePending(userId: string, type: AuthTokenType): Promise<void> {
    await this.prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  /** Consome um token — nulo se não existir, já usado, ou expirado (mesma mensagem para os três, não vaza qual). */
  async consume(tokenPlain: string, type: AuthTokenType): Promise<{ userId: string } | null> {
    const tokenHash = this.passwords.hashOpaqueToken(tokenPlain);
    const record = await this.prisma.authToken.findFirst({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record) return null;
    await this.prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return { userId: record.userId };
  }
}
