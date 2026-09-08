import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ACCESS_TOKEN_COOKIE } from "../auth-cookies";
import { AuthenticatedUser, JwtPayload } from "../jwt-payload";

/**
 * O SPA autentica via cookie httpOnly (adendo "Segurança de sessão",
 * 08/09/2026 — imune a roubo de token por XSS); o header `Authorization:
 * Bearer` continua aceito para integrações/Swagger que não mantêm cookie
 * de navegador (ex.: testar pela UI do /docs). Cookie tem prioridade
 * quando os dois estão presentes.
 */
function extractFromCookie(req: Request): string | null {
  return req?.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractFromCookie, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_ACCESS_SECRET"),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return { id: payload.sub, role: payload.role, analystId: payload.analystId };
  }
}
