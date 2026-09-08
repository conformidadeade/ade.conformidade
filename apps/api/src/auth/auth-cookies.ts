import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import { CSRF_COOKIE_NAME } from "./guards/csrf.guard";
import { PasswordService } from "./password.service";

/**
 * Transporte de sessão via cookie httpOnly + CSRF double-submit (adendo
 * "Segurança de sessão: migrar de localStorage para cookie httpOnly +
 * CSRF", 08/09/2026) — mesmo padrão já usado no `leilao-erp`
 * (`apps/api/src/modules/auth/auth-cookies.ts`), adaptado à estrutura de
 * módulos deste repositório. Motivo: o sistema vai ter acesso externo, e
 * `localStorage` é legível por qualquer script executado na página
 * (vulnerável a roubo de token via XSS); um cookie `httpOnly` não é.
 *
 * Não muda a lógica de rotação de refresh token (`RefreshToken` com hash,
 * revogação) já existente em `AuthService` — só o transporte.
 */
export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

/** Mantido em sincronia manualmente com JWT_ACCESS_TTL (padrão "15m" — ver AuthService.signAccessToken). */
const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
/** Mantido em sincronia manualmente com REFRESH_TTL_MS em AuthService. */
const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Caminho restrito do refresh token — só trafega para as próprias rotas de
 * auth, nunca para o resto da API. Adendo "Deploy em produção" (09/09/2026):
 * o path de um cookie é sempre relativo ao que o NAVEGADOR pediu, não ao
 * que o backend "realmente" atende — e com o proxy same-origin da Vercel
 * (`rewrites()` em next.config.ts), o navegador SEMPRE chama `/api/auth/…`,
 * nunca `/auth/…` diretamente. Por isso o prefixo `/api` aqui, mesmo o
 * backend não tendo esse prefixo nas próprias rotas — errar isso quebraria
 * silenciosamente o refresh (cookie gravado, mas nunca reenviado pelo
 * navegador por não bater o path).
 */
const REFRESH_COOKIE_PATH = "/api/auth";

function cookieBase(config: ConfigService) {
  return {
    // "secure" exige HTTPS — obrigatório em produção (exposição externa
    // confirmada), mas quebraria o dev local em http://localhost. Ligado
    // por padrão; só desligado explicitamente via env em dev.
    secure: config.get<string>("COOKIE_SECURE", "true") === "true",
    // Deixe SEMPRE vazio (host-only cookie) — inclusive em produção. Com o
    // proxy same-origin da Vercel, o navegador nunca fala diretamente com
    // o Railway; ele só vê o próprio domínio do frontend, e é a esse
    // domínio que o cookie precisa ficar implicitamente restrito. Definir
    // aqui o domínio do Railway quebraria o cookie (o navegador rejeita/
    // ignora um Domain que não bate com quem respondeu à requisição do
    // ponto de vista dele). Só existe para um cenário futuro hipotético
    // sem proxy (ex.: subdomínios tipo api.<dominio> + app.<dominio>
    // compartilhando sessão) — não é o caso hoje.
    domain: config.get<string>("COOKIE_DOMAIN") || undefined,
    // "lax": cobre o caso normal de SPA same-site (login por formulário,
    // navegação) sem quebrar nada hoje; não usamos links de terceiros que
    // dependam do cookie ser enviado em navegação cross-site, então não há
    // motivo para o "strict" mais restritivo custar alguma funcionalidade —
    // mas "lax" já barra o caso clássico de CSRF via <img>/fetch de outro
    // site (que usa POST, não navegação de topo). Documentado aqui por ser
    // a escolha pedida para registrar explicitamente (adendo, item 1).
    sameSite: "lax" as const,
  };
}

export function setAuthCookies(
  res: Response,
  config: ConfigService,
  passwords: PasswordService,
  tokens: { accessToken: string; refreshToken: string },
) {
  const base = cookieBase(config);

  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...base,
    httpOnly: true,
    path: "/",
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...base,
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  });
  // Legível por JS de propósito — é a metade "conhecida pelo cliente" do
  // padrão double-submit (ver CsrfGuard). Não é secreto por si só; o que
  // protege é um atacante de outro site não conseguir LER este cookie
  // (same-origin policy) para montar o header correspondente.
  res.cookie(CSRF_COOKIE_NAME, passwords.generateOpaqueToken(), {
    ...base,
    httpOnly: false,
    path: "/",
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  });
}

export function clearAuthCookies(res: Response, config: ConfigService) {
  const base = cookieBase(config);
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...base, path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
  res.clearCookie(CSRF_COOKIE_NAME, { ...base, path: "/" });
}
