import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Request, Response } from "express";
import { REFRESH_TOKEN_COOKIE, clearAuthCookies, setAuthCookies } from "./auth-cookies";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { ConfirmInviteDto } from "./dto/confirm-invite.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthenticatedUser } from "./jwt-payload";
import { PasswordService } from "./password.service";

/**
 * Sessão via cookie httpOnly + CSRF (adendo "Segurança de sessão",
 * 08/09/2026) — login/refresh não retornam mais token nenhum no corpo da
 * resposta (só `{ user }`); os tokens vão em `Set-Cookie` (ver
 * `auth-cookies.ts`). O refresh token é lido do cookie de sessão, nunca
 * do corpo da requisição — por isso não há mais `RefreshDto`.
 *
 * confirm-invite/forgot-password/reset-password (adendo "Confirmação de
 * e-mail e recuperação de senha", 09/09/2026) são rotas públicas — sem
 * `JwtAuthGuard`, de propósito (ninguém tem sessão ainda nesse ponto).
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto.email, dto.password);
    setAuthCookies(res, this.config, this.passwords, result);
    return { user: result.user };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException("Sessão expirada, faça login novamente.");
    }
    const result = await this.authService.refresh(refreshToken);
    setAuthCookies(res, this.config, this.passwords, result);
    return { user: result.user };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    clearAuthCookies(res, this.config);
  }

  /** Confirma se a sessão (cookie) ainda é válida — usado no boot do SPA (adendo, item 3). */
  @Get("me")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id).then((sessionUser) => ({ user: sessionUser }));
  }

  /** Define a senha de uma conta convidada pela primeira vez (item 1). */
  @Post("confirm-invite")
  @HttpCode(204)
  confirmInvite(@Body() dto: ConfirmInviteDto): Promise<void> {
    return this.authService.confirmInvite(dto.token, dto.password);
  }

  /**
   * "Esqueci minha senha" (item 2). Sempre 204, mesma resposta exista ou
   * não a conta — nunca revela se um e-mail está cadastrado (item 2:
   * evitar enumeração). Throttle nos protege de spam de e-mail/abuso de
   * cota do provedor (item 3, obrigatório — não só sinalizado).
   */
  @Post("forgot-password")
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto.email);
  }

  /** Redefine a senha via token de recuperação (item 2). */
  @Post("reset-password")
  @HttpCode(204)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
