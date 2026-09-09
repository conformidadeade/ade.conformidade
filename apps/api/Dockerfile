# syntax=docker/dockerfile:1
#
# Dockerfile de produção para a API (adendo "Deploy em produção: Vercel +
# Railway + Cloudflare", 09/09/2026). Builda com o contexto do MONOREPO
# inteiro (a API depende de packages/types e packages/release-engine via
# workspace:*) — por isso este build precisa rodar com o contexto na raiz
# do repositório, não em apps/api:
#
#   docker build -f apps/api/Dockerfile .        (a partir da raiz do repo)
#
# No Railway: configure "Dockerfile Path" = apps/api/Dockerfile mantendo o
# Root Directory do serviço como a raiz do repositório (não apps/api) — ver
# docs/DEPLOY.md para o passo a passo completo no painel.
#
# NÃO usa `pnpm deploy` (o comando "certo" do pnpm para empacotar um único
# pacote do workspace com só suas dependências de produção resolvidas) —
# testado localmente e encontrado quebrado: a partir do pnpm 11.19 há uma
# regressão conhecida (pnpm/pnpm#13754) em que os pacotes workspace:*
# ficam symlinkados de volta para FORA da pasta extraída, o que quebraria
# em runtime num container isolado. Em vez disso, builda e depois faz
# `pnpm install --prod` NO LUGAR (mantendo a árvore do monorepo intacta —
# packages/*, apps/api — então os symlinks internos continuam válidos) e
# copia só o necessário para a imagem final. Resultado: imagem final não é
# tão enxuta quanto `pnpm deploy` prometeria (o store `.pnpm` compartilhado
# do workspace inteiro vem junto, não só as dependências da API), mas
# funciona de verdade — testado localmente rodando `node dist/main.js` com
# as dependências podadas, incluindo login e `prisma migrate deploy` via
# `npx`. Otimizar o tamanho da imagem fica para depois, sem bloquear o
# deploy funcionando.
#
# Node 22 (não 20): pnpm 11 usa o módulo interno `node:sqlite`, disponível
# só a partir do Node 22.13 — com Node 20 o build falha com
# ERR_UNKNOWN_BUILTIN_MODULE em "pnpm install" (visto de verdade num
# primeiro deploy no Railway, corrigido depois).

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- build: instala o workspace inteiro, gera o Prisma Client, builda
# types -> release-engine -> api (nesta ordem, via turbo) e então poda
# devDependencies do node_modules (mantendo a estrutura de pastas do
# workspace intacta) ----
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @reanalise-erp/api prisma:generate
RUN pnpm exec turbo run build --filter=@reanalise-erp/api...
# CI=true evita o prompt interativo de confirmação do pnpm ao remover
# devDependencies (não há TTY dentro do build do Docker).
RUN CI=true pnpm install --prod --frozen-lockfile

# ---- runtime: imagem final — só o necessário para rodar a API, sem o
# código-fonte/dependências do apps/web ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/.npmrc ./
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api
WORKDIR /repo/apps/api

# Aplica as migrations pendentes e só então sobe a API — banco de
# produção nasce vazio (adendo "Deploy limpo"), então isto é seguro de
# rodar a cada deploy: não há nada para "quebrar" recriando do zero.
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/main.js"]
