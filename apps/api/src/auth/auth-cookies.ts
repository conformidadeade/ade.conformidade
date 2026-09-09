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
 * auth, nunca para o resto da API. `/auth` (sem prefixo) porque o
 * navegador chama a API DIRETAMENTE (ver nota sobre o abandono do proxy
 * same-origin logo abaixo), então o path bate com a rota real do backend.
 */
const REFRESH_COOKIE_PATH = "/auth";

function cookieBase(config: ConfigService) {
  return {
    // "secure" exige HTTPS — obrigatório em produção (exposição externa
    // confirmada), mas quebraria o dev local em http://localhost. Ligado
    // por padrão; só desligado explicitamente via env em dev.
    secure: config.get<string>("COOKIE_SECURE", "true") === "true",
    // Adendo "Deploy em produção" (09/09/2026) — revisão de 09/09/2026:
    // a ideia original era um proxy same-origin via rewrites() do Next.js
    // (front e API parecendo o MESMO domínio pro navegador), com
    // COOKIE_DOMAIN sempre vazio. Abandonado depois de confirmado em
    // produção que a Vercel classifica o range de IP do Railway como
    // "privado" (DNS_HOSTNAME_RESOLVED_PRIVATE) e recusa fazer o proxy —
    // limitação de infraestrutura entre os dois provedores, não algo
    // corrigível por configuração de DNS/hostname (testado com hostnames
    // diferentes apontando pro mesmo IP, mesmo erro).
    //
    // Solução adotada: cookie de DOMÍNIO COMPARTILHADO entre subdomínios
    // do mesmo domínio raiz — COOKIE_DOMAIN=".adeonline.com.br" (com
    // ponto na frente) em produção, deixando o cookie válido tanto para
    // www.adeonline.com.br (frontend) quanto api.adeonline.com.br
    // (backend). O navegador considera os dois "same-site" (mesmo
    // domínio registrável) mesmo não sendo "same-origin" — SameSite=Lax
    // abaixo continua funcionando normalmente nesse cenário, sem precisar
    // de "None". Em dev local, deixe vazio (cookie host-only, cada porta
    // de localhost já é "same-site" o bastante para Lax funcionar).
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
