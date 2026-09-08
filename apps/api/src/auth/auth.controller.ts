import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { REFRESH_TOKEN_COOKIE, clearAuthCookies, setAuthCookies } from "./auth-cookies";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthenticatedUser } from "./jwt-payload";
import { PasswordService } from "./password.service";

/**
 * Sessão via cookie httpOnly + CSRF (adendo "Segurança de sessão",
 * 08/09/2026) — login/refresh não retornam mais token nenhum no corpo da
 * resposta (só `{ user }`); os tokens vão em `Set-Cookie` (ver
 * `auth-cookies.ts`). O refresh token é lido do cookie de sessão, nunca
 * do corpo da requisição — por isso não há mais `RefreshDto`.
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
}
