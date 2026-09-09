import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthTokenService } from "./auth-token.service";
import { JwtPayload } from "./jwt-payload";
import { PasswordService } from "./password.service";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: SessionUserDto;
}

export interface SessionUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  analystId: string | null;
}

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias — mantido em sincronia com JWT_REFRESH_TTL

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly authTokens: AuthTokenService,
    private readonly email: EmailService,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      throw new UnauthorizedException("Credenciais inválidas.");
    }
    // Conta convidada, ainda sem senha (adendo "Confirmação de e-mail e
    // recuperação de senha") — mensagem clara e distinta de "credenciais
    // inválidas", para o usuário saber que precisa confirmar o e-mail,
    // não que digitou a senha errada.
    if (!user.passwordHash) {
      throw new UnauthorizedException("Conta ainda não confirmada — verifique seu e-mail para definir a senha.");
    }
    const valid = await this.passwords.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException("Credenciais inválidas.");
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const accessToken = this.signAccessToken({ sub: user.id, role: user.role, analystId: user.analystId });
    const refreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, analystId: user.analystId },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.passwords.hashOpaqueToken(refreshToken);
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record) {
      throw new UnauthorizedException("Sessão expirada, faça login novamente.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || !user.active) {
      throw new UnauthorizedException("Usuário inativo.");
    }

    // Rotação: revoga o token usado e emite um novo par (mitiga replay de refresh token roubado).
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });

    const accessToken = this.signAccessToken({ sub: user.id, role: user.role, analystId: user.analystId });
    const newRefreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, analystId: user.analystId },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.passwords.hashOpaqueToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * GET /auth/me (adendo "Segurança de sessão", item 3) — usado no boot do
   * SPA para confirmar se a sessão (cookie) ainda é válida e obter os
   * dados do usuário; o JWT decodificado (`AuthenticatedUser`, via
   * `@CurrentUser()`) só tem id/role/analystId, não name/email, então
   * este endpoint busca o registro completo. Também revalida no banco
   * (ao contrário de confiar cegamente no payload do token) — cobre conta
   * desativada ou com vínculo de analista alterado desde a emissão do
   * token de acesso.
   */
  async getMe(userId: string): Promise<SessionUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) {
      throw new UnauthorizedException("Usuário inválido ou inativo.");
    }
    return { id: user.id, name: user.name, email: user.email, role: user.role, analystId: user.analystId };
  }

  /**
   * Confirma o convite de uma conta nova, definindo a senha pela primeira
   * vez (adendo "Confirmação de e-mail e recuperação de senha", item 1).
   */
  async confirmInvite(token: string, password: string): Promise<void> {
    const consumed = await this.authTokens.consume(token, "INVITE");
    if (!consumed) {
      throw new UnauthorizedException("Link de confirmação inválido ou expirado. Peça um novo convite ao administrador.");
    }
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.user.update({
      where: { id: consumed.userId },
      data: { passwordHash, emailConfirmedAt: new Date() },
    });
  }

  /**
   * Recuperação de senha self-service (item 2). Deliberadamente não lança
   * erro nem indica de nenhuma forma observável se o e-mail existe ou não
   * — o controller sempre responde a mesma mensagem genérica, para não
   * permitir enumeração de contas cadastradas. Só emite/envia o token de
   * verdade se a conta existir E já estiver confirmada (uma conta ainda
   * convidada usa o fluxo de convite, não este).
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !user.passwordHash || !user.emailConfirmedAt) {
      return;
    }
    const token = await this.authTokens.issue(user.id, "PASSWORD_RESET");
    const link = `${this.frontendUrl()}/redefinir-senha/${token}`;
    // Falha no envio não deve derrubar a requisição (a resposta ao
    // cliente já é genérica de qualquer forma) — só loga; o usuário pode
    // tentar de novo, ou o admin pode redefinir manualmente como fallback.
    await this.email.sendPasswordResetEmail(user.email, user.name, link).catch(() => undefined);
  }

  /**
   * Redefine a senha via token de recuperação. Revoga todas as sessões
   * ativas do usuário (refresh tokens) — se alguém pediu reset, é
   * razoável assumir que a sessão anterior pode estar comprometida.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const consumed = await this.authTokens.consume(token, "PASSWORD_RESET");
    if (!consumed) {
      throw new UnauthorizedException("Link de redefinição inválido ou expirado. Peça um novo em 'Esqueci minha senha'.");
    }
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: consumed.userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: consumed.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /** URL do frontend para montar os links dos e-mails — reaproveita CORS_ORIGIN (já é essa mesma URL). */
  private frontendUrl(): string {
    return this.config.get<string>("CORS_ORIGIN", "http://localhost:4002");
  }

  private signAccessToken(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "15m",
    });
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const token = this.passwords.generateOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.passwords.hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return token;
  }
}
