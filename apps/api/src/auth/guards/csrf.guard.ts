import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Request } from "express";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const CSRF_COOKIE_NAME = "XSRF-TOKEN";
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Proteção CSRF por double-submit cookie (adendo "Segurança de sessão",
 * item 2) — mesmo padrão do `leilao-erp`
 * (`apps/api/src/common/guards/csrf.guard.ts`): no login/refresh a API
 * grava um valor aleatório em um cookie legível por JS (`XSRF-TOKEN`, ver
 * `auth-cookies.ts`); o frontend o ecoa de volta no header `X-CSRF-Token`
 * em toda requisição que muda estado (POST/PUT/PATCH/DELETE). Um site
 * atacante não consegue ler o cookie da vítima (same-origin policy),
 * então não tem como montar o header — só o app legítimo consegue.
 *
 * Rotas de leitura (GET/HEAD/OPTIONS) não passam por essa checagem (item
 * 2 do adendo: "rotas de leitura não precisam dessa validação").
 *
 * Sem cookie de sessão ainda (ex.: login, quando não existe XSRF-TOKEN
 * prévio) não há nada para comparar, então a checagem é pulada — login é
 * protegido por outros meios (credenciais + rate limiting recomendado,
 * ver DECISIONS.md), não por CSRF.
 *
 * Registrado globalmente via APP_GUARD em app.module.ts — se aplica a
 * toda rota mutante da API automaticamente, sem precisar lembrar de
 * decorar cada controller.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!MUTATING_METHODS.has(req.method)) return true;

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    if (!cookieToken) return true;

    const headerToken = req.headers[CSRF_HEADER_NAME];
    if (headerToken !== cookieToken) {
      throw new ForbiddenException("Token CSRF ausente ou inválido.");
    }
    return true;
  }
}
