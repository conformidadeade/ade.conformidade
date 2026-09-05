# Reanálise ERP

Sistema interno para controlar o processo de reanálise de processos de
mídia e o mecanismo de liberação de analistas por combinação
**Analista + Cliente + Meio de veiculação**, substituindo o controle hoje
feito em planilhas.

Ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para a modelagem completa
e [`docs/DECISIONS.md`](docs/DECISIONS.md) para as decisões de negócio já
confirmadas com a liderança e as que ainda estão em aberto.

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
  api/                 # NestJS + Prisma
  web/                 # Next.js
packages/
  release-engine/      # regra de negócio pura
  types/               # tipos compartilhados api<->web
docs/
  ARCHITECTURE.md
  DECISIONS.md
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

```
pnpm test     # roda os testes de todos os pacotes/apps (Jest)
pnpm build    # build de produção de todos os pacotes/apps
```

Já testado de ponta a ponta contra um Postgres real (não só testes unitários): login,
cadastros, diretrizes, lançamento → liberação automática, devolução → retorno automático,
exportação Excel/PDF, importação de planilha de habilidades.

## `apps/api`

- **Auth** (`/auth/login|refresh|logout`): JWT de acesso + refresh token rotativo (hash sha256, revogável), senha com argon2.
- **Papéis** (item 21): `ADMINISTRADOR` (tudo, inclusive `/users`), `LIDERANCA` (cadastros, diretrizes, lançamentos, ações críticas), `ANALISTA` (só leitura) — via `@Roles()` + `RolesGuard`.
- **Cadastros** (`/clients`, `/media-channels`, `/analysts`): create/list/update/inactivate/activate, nunca exclusão física (item 18).
- **Diretrizes** (`/guidelines`): versionadas — alterar nunca sobrescreve, encerra a vigente e cria uma nova; exige motivo quando já existe uma vigente (item 19).
- **Mapa de Liberação** (`/combinations`): filtros por cliente/meio/analista/status/mês/ano (item 16/17); drill-down do ciclo atual (`/combinations/:id/current-cycle`); exportação Excel/PDF sempre com a base completa.
- **Release engine** (`/release/processes|returns|manual-reset|manual-return`): lançamento de processo (sempre correto, item 2 do adendo), devolução (com PI livre e vínculo automático, item 1), reset e retorno manual — cada um uma transação atômica sobre `@reanalise-erp/release-engine`.
- **Dashboard** (`/dashboard`): indicadores do mês, filtráveis por analista/cliente/meio.
- **Mapa de Habilidades** (`/skills`): registro de competência paralelo ao motor de reanálise — automático (todo lançamento correto), manual e importação de planilha (tudo-ou-nada); exportação Excel/PDF.

## `apps/web`

Tema claro/escuro com as cores da marca (`#fca821`/`#252525`/`#ffe069`, item 26), sessão via
JWT (bearer token) guardada em localStorage com refresh automático em 401.

| Rota | Perfis | O que faz |
|---|---|---|
| `/login` | público | Autenticação |
| `/dashboard` | todos | Indicadores do mês, filtráveis por analista/cliente/meio |
| `/mapa` | todos (exportar: liderança/admin) | Mapa de Liberação — filtros, drill-down de PIs do ciclo atual, exportação |
| `/mapa-habilidades` | todos (escrever/exportar: liderança/admin) | Mapa de Habilidades — filtros, evidências, registro manual, importação de planilha |
| `/lancamentos` | liderança/admin | Lançamento de processos (sempre correto) |
| `/devolucoes` | liderança/admin | Devoluções, com nº do PI sempre aceito |
| `/diretrizes` | liderança/admin | Diretrizes versionadas |
| `/cadastros` | liderança/admin | Clientes/Meios/Analistas |
| `/usuarios` | admin | Contas de acesso |

## Testes

53 testes automatizados (Jest) — regra de negócio isolada (`release-engine`) e camada de
orquestração/serviços da API, todos com fakes em memória (sem precisar de banco real para
rodar a suíte). Sem testes automatizados de frontend ainda.
