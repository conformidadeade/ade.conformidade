# ADE — Administração de Dados e Estratégias

Sistema interno para controlar o processo de reanálise de processos de
mídia e o mecanismo de liberação de analistas por combinação
**Analista + Cliente + Meio de veiculação**, substituindo o controle hoje
feito em planilhas.

> O repositório (`reanalise-erp`) mantém o nome técnico original — só a marca
> voltada ao usuário (título, telas, logo) passou a se chamar **ADE**.

Ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para a modelagem completa,
[`docs/DECISIONS.md`](docs/DECISIONS.md) para as decisões de negócio já
confirmadas com a liderança e as que ainda estão em aberto, e
[`docs/DEPLOY.md`](docs/DEPLOY.md) para o passo a passo de deploy em produção
(Vercel + Railway + Cloudflare).

## Stack

- **Backend:** NestJS + Prisma + PostgreSQL (`apps/api`)
- **Frontend:** Next.js 16 + React 19 + Tailwind 4 + Radix UI + next-themes (`apps/web`)
- **Regra de negócio central:** `packages/release-engine` — máquina de
  estados pura (sem framework, sem banco), testada isoladamente. É o
  módulo que decide construção, liberação, devolução e retorno; a API só
  faz a orquestração de persistência/transação em cima dele.

## Monorepo

```
apps/
  api/                 # NestJS + Prisma (+ Dockerfile de produção, ver docs/DEPLOY.md)
  web/                 # Next.js
packages/
  release-engine/      # regra de negócio pura
  types/               # tipos compartilhados api<->web
docs/
  ARCHITECTURE.md
  DECISIONS.md
  DEPLOY.md
```

## Rodando localmente

Portas escolhidas deliberadamente fora da faixa 3000-3002, para nunca colidir com outros
projetos na mesma máquina: **API em 4001, web em 4002**.

```
pnpm install
cp apps/api/.env.example apps/api/.env        # ajuste DATABASE_URL para seu Postgres
cp apps/web/.env.local.example apps/web/.env.local
pnpm --filter @reanalise-erp/api prisma:migrate
pnpm --filter @reanalise-erp/api prisma:seed  # cria o usuário ADMINISTRADOR de bootstrap

pnpm --filter @reanalise-erp/api start        # ou dev
pnpm --filter @reanalise-erp/web dev
```

`apps/api/.env.example` já vem com `COOKIE_SECURE="false"` (necessário em dev local, sem
HTTPS) e `CORS_ORIGIN="http://localhost:4002"` — ajuste os dois para produção (ver
`docs/DEPLOY.md` e `docs/DECISIONS.md`, adendo "Segurança de sessão").

O frontend nunca fala direto com a API — `apps/web/.env.local.example` traz
`API_PROXY_TARGET="http://localhost:4001"`, que o `rewrites()` de `next.config.ts` usa
para repassar `/api/*` para a API local. Isso simula em dev exatamente a mesma
topologia de produção (proxy same-origin Vercel → Railway, ver `docs/DEPLOY.md`) — em
vez de uma URL absoluta cross-origin, o browser só fala com o próprio `localhost:4002`.

```
pnpm test     # roda os testes de todos os pacotes/apps (Jest)
pnpm build    # build de produção de todos os pacotes/apps
```

Já testado de ponta a ponta contra um Postgres real (não só testes unitários): login,
cadastros, diretrizes, lançamento → liberação automática, devolução → retorno automático,
exportação Excel/PDF, importação de planilha de habilidades, cookies de sessão + CSRF.

## `apps/api`

- **Auth** (`/auth/login|refresh|logout|me`): JWT de acesso + refresh token rotativo (hash sha256, revogável), senha com argon2. Transporte via cookie `httpOnly` + CSRF double-submit (`XSRF-TOKEN`/header `X-CSRF-Token`, `CsrfGuard` global) — ver `docs/DECISIONS.md`, adendo "Segurança de sessão". `Authorization: Bearer` continua aceito (prioridade menor que o cookie) para uso pelo Swagger.
- **Papéis** (item 21): `ADMINISTRADOR` (tudo, inclusive `/users`), `LIDERANCA` (cadastros, diretrizes, lançamentos, ações críticas), `ANALISTA` (só leitura) — via `@Roles()` + `RolesGuard`.
- **Cadastros** (`/clients`, `/media-channels`, `/analysts`): create/list/update/inactivate/activate, nunca exclusão física (item 18).
- **Diretrizes** (`/guidelines`): versionadas — alterar nunca sobrescreve, encerra a vigente e cria uma nova; exige motivo quando já existe uma vigente (item 19).
- **Mapa de Liberação** (`/combinations`): filtros por cliente/meio/analista/status/origem/mês/ano (item 16/17); drill-down do ciclo atual (`/combinations/:id/current-cycle`); exportação Excel/PDF sempre com a base completa.
- **Release engine** (`/release/processes|returns|manual-reset|manual-return`): lançamento de processo (sempre correto, item 2 do adendo), devolução (com PI livre, vínculo automático e origem obrigatória — reanálise/cliente), reset e retorno manual — cada um uma transação atômica sobre `@reanalise-erp/release-engine`.
- **Dashboard** (`/dashboard`): indicadores acumulados de todos os períodos (não mais escopados a um mês — ver `docs/DECISIONS.md`), filtráveis por analista/cliente/meio/origem.
- **Mapa de Habilidades** (`/skills`): registro de competência paralelo ao motor de reanálise — automático (todo lançamento correto), manual e importação de planilha (tudo-ou-nada); exportação Excel/PDF.

## `apps/web`

Tema claro/escuro com as cores da marca (`#fca821`/`#252525`/`#ffe069`, item 26). Sessão via
cookie `httpOnly` + CSRF double-submit (adendo "Segurança de sessão", 08/09/2026 — ver
`docs/DECISIONS.md`) com refresh automático em 401; nenhum token trafega em JS/localStorage.

| Rota | Perfis | O que faz |
|---|---|---|
| `/login` | público | Autenticação |
| `/dashboard` | todos | Indicadores acumulados (todos os períodos), filtráveis por analista/cliente/meio/origem da devolução |
| `/mapa` | todos (exportar: liderança/admin) | Mapa de Liberação — filtros (inclui origem da devolução), drill-down de PIs do ciclo atual, exportação |
| `/mapa-habilidades` | todos (escrever/exportar: liderança/admin) | Mapa de Habilidades — filtros, evidências, registro manual, importação de planilha |
| `/lancamentos` | liderança/admin | Lançamento de processos (sempre correto) |
| `/devolucoes` | liderança/admin | Devoluções, com nº do PI sempre aceito e origem (Reanálise/Cliente) obrigatória |
| `/diretrizes` | liderança/admin | Diretrizes versionadas |
| `/cadastros` | liderança/admin | Clientes/Meios/Analistas |
| `/usuarios` | admin | Contas de acesso, inclusive redefinir senha de qualquer usuário |

## Deploy em produção

Ver [`docs/DEPLOY.md`](docs/DEPLOY.md) para o passo a passo completo de Vercel
(frontend) + Railway (backend + Postgres) + Cloudflare (DNS), incluindo o
`Dockerfile` da API (`apps/api/Dockerfile`), variáveis de ambiente de cada
serviço e estimativa de custo. Resumo do que já está pronto no código: HTTPS
automático nos dois serviços, proxy same-origin (`rewrites()` do Next.js) para
o cookie de sessão funcionar sem CORS complicado, migrations do Prisma
aplicadas automaticamente a cada deploy (`prisma migrate deploy` no `CMD` do
container).

### Banco zerado

O banco de produção nasce **sem nenhum dado de negócio de exemplo** — sem Clientes, Meios,
Analistas, Diretrizes, lançamentos, devoluções ou habilidades (adendo "Deploy limpo",
08/09/2026). A equipe recadastra tudo pela interface depois do primeiro login. Só a
**estrutura** (schema/migrations) e uma **conta de Administrador inicial** existem de saída.

```
# 1. Aplica todas as migrations num banco novo e vazio (não gera nada além do schema)
DATABASE_URL="postgresql://.../reanalise_erp_prod" pnpm --filter @reanalise-erp/api prisma:deploy

# 2. Cria só a conta de Administrador inicial (idempotente — não roda 2x sobre o mesmo e-mail)
DATABASE_URL="postgresql://.../reanalise_erp_prod" \
  ADMIN_EMAIL="admin@seudominio.com" \
  pnpm --filter @reanalise-erp/api prisma:seed
```

- **Senha:** se `ADMIN_PASSWORD` não for definida, o seed gera uma senha temporária forte e
  aleatória e a imprime **uma única vez** no terminal — anote-a na hora, ela não é
  recuperável depois (só o hash argon2 fica salvo). Se preferir fixar uma senha conhecida
  (ex.: para repassar por um canal seguro), defina `ADMIN_PASSWORD` antes de rodar o seed.
- **Troca de senha no primeiro acesso:** o sistema ainda não tem uma tela dedicada de "trocar
  senha no primeiro login" — o passo manual é: logar com a conta gerada, ir em **Usuários >
  Editar (na própria conta) > "Nova senha"** e definir uma senha definitiva. Essa capacidade
  (`ADMINISTRADOR` redefine a senha de qualquer usuário) foi adicionada especificamente para
  viabilizar esse passo.
- **Nenhuma migration depende de dado pré-existente** para produção: a mais recente
  (`origin` de `ReanalysisReturn`, adendo "Origem da devolução") tem um passo de backfill no
  SQL, mas ele só encontra registros para atualizar se já existir alguma devolução no banco —
  num banco novo e vazio a tabela está vazia, o backfill não faz nada e a coluna já nasce
  `NOT NULL` sem conflito.
- **Ambiente local de desenvolvimento:** por decisão explícita (08/09/2026), este processo de
  zeramento **não** se aplica ao banco local atual — ele continua com os dados já lançados,
  para seguir testando. `prisma:seed` já é seguro de rodar nele de qualquer forma (é
  idempotente: como o e-mail do admin local já existe, roda sem fazer nada).
- **Exposição de rede:** confirmado com a liderança que este ambiente terá exposição externa
  (não é só interno/VPN) — isso motivou a migração de sessão para cookie `httpOnly` + CSRF
  (adendo "Segurança de sessão", 08/09/2026, já implementada — ver seção `apps/web` acima e
  `docs/DECISIONS.md`). HTTPS obrigatório, rate limiting no login e revisão de política de
  senha continuam sinalizados como recomendação, não implementados — ver `docs/DECISIONS.md`.

## Testes

100 testes automatizados (Jest) — regra de negócio isolada (`release-engine`, 16 testes) e
camada de orquestração/serviços/integração HTTP da API (84 testes), todos com fakes em
memória ou (nas suítes de integração de importação e de sessão/CSRF) o pipeline HTTP real via
`supertest` com cookies reais, sem precisar de banco real para rodar a suíte. Sem testes automatizados de
frontend ainda.
