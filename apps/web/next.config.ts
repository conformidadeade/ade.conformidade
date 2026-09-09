import type { NextConfig } from "next";

/**
 * Adendo "Deploy em produção" (09/09/2026) — sem rewrites(). A ideia
 * original era um proxy same-origin repassando /api/* pro Railway, mas a
 * Vercel recusa fazer esse proxy pro range de IP do Railway
 * (DNS_HOSTNAME_RESOLVED_PRIVATE, confirmado em produção — limitação de
 * infraestrutura entre os dois provedores). O frontend agora chama a API
 * diretamente por uma URL absoluta (NEXT_PUBLIC_API_URL, ver
 * apps/web/lib/api/client.ts); a sessão funciona entre as duas origens
 * via cookie de domínio compartilhado (COOKIE_DOMAIN=".<domínio-raiz>"
 * no backend) + CORS explícito, não mais via "mesma origem" estrita.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
