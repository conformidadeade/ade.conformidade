import type { NextConfig } from "next";

/**
 * Adendo "Deploy em produção: Vercel + Railway + Cloudflare" (09/09/2026).
 *
 * Nunca hardcode o domínio do backend aqui (nem o do Railway, nem o
 * "final" quando o domínio próprio existir) — sempre via env var. Em dev
 * local aponta para a API local (localhost:4001); em produção, para a URL
 * do backend no Railway (configurada no painel da Vercel).
 *
 * Não é `NEXT_PUBLIC_*` de propósito: só o SERVIDOR do Next.js precisa
 * saber esse destino para fazer o proxy — o navegador nunca faz uma
 * requisição direta a ele, só ao próprio domínio do frontend (`/api/*`).
 */
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:4001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // Repassa toda chamada /api/* para o backend — do ponto de vista
        // do navegador, front e API são a MESMA origem (necessário para o
        // cookie de sessão httpOnly, adendo "Segurança de sessão"). O
        // backend não tem prefixo /api nas suas próprias rotas (ex.:
        // POST /auth/login), então o destino aqui NÃO repete o /api.
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/:path*`,
      },
    ];
  },
};

export default nextConfig;
