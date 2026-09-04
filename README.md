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
  api/                 # NestJS + Prisma — auth, cadastros, diretrizes, mapa e release engine prontos
  web/                 # Next.js (a implementar)
packages/
  release-engine/      # regra de negócio pura — pronto e testado
  types/                # tipos compartilhados api<->web
docs/
  ARCHITECTURE.md
  DECISIONS.md
```

### `apps/api` — o que já existe

- **Auth** (`/auth/login|refresh|logout`): JWT de acesso + refresh token rotativo (hash sha256, revogável), senha com argon2.
- **Papéis** (item 21): `ADMINISTRADOR` (tudo, inclusive `/users`), `LIDERANCA` (cadastros, diretrizes, lançamentos, ações críticas), `ANALISTA` (só leitura) — via `@Roles()` + `RolesGuard`.
- **Cadastros** (`/clients`, `/media-channels`, `/analysts`): create/list/update/inactivate/activate, nunca exclusão física (item 18).
- **Diretrizes** (`/guidelines`): versionadas — alterar nunca sobrescreve, encerra a vigente e cria uma nova; exige motivo quando já existe uma vigente (item 19).
- **Mapa de Liberação** (`/combinations`): filtros por cliente/meio/analista/status/mês/ano (item 16/17); "Próximos da liberação" fica de fora por enquanto (ver `docs/DECISIONS.md`).
- **Release engine** (`/release/processes|returns|manual-reset|manual-return`): lançamento de processo, devolução, reset e retorno manual — cada um uma transação atômica sobre `@reanalise-erp/release-engine`.

Não testado contra um Postgres real neste ambiente (sem Docker/Postgres local disponível) — verificado via `prisma generate`, `nest build` e boot real do processo (que chega até a tentativa de conexão com o banco, e só falha aí). Rode as migrations (`pnpm prisma:migrate`) contra um Postgres local antes do primeiro uso.

### `apps/web` — o que já existe

Next.js 16 (App Router) + Tailwind 4, tema claro/escuro com as cores da marca (`#fca821`/`#252525`/`#ffe069`, item 26), sessão via JWT (bearer token) guardada em localStorage com refresh automático em 401.

- **Login** (`/login`) e guarda de rota (`app/(app)/layout.tsx`) — redireciona para `/login` sem sessão.
- **Mapa de Liberação** (`/mapa`): filtros de cliente/meio/analista + atalhos de status (item 16/17).
- **Lançamento de Processos** (`/lancamentos`) e **Devoluções** (`/devolucoes`): os dois formulários centrais do item 25 — um único lançamento atualiza processo, construção, status e histórico via a API.
- **Cadastros** (`/cadastros`): Clientes/Meios/Analistas em abas, criar/inativar/reativar com confirmação (item 27).
- **Diretrizes** (`/diretrizes`): lista as vigentes + diálogo para criar/alterar (exige motivo quando já existe uma vigente).
- **Dashboard** (`/dashboard`) e **Usuários** (`/usuarios`, só ADMINISTRADOR).

Verificado com `next build` (todas as 9 rotas geram como conteúdo estático — nenhuma página depende da API em build-time) e um smoke test real: `next start` + `curl` em `/login` e `/mapa` (200, HTML renderizado). Sem API/Postgres rodando neste ambiente para testar o fluxo ponta a ponta — próximo passo natural antes de considerar isso pronto para uso real.

## Rodando

```
pnpm install
pnpm test          # roda os testes de todos os pacotes/apps
pnpm --filter @reanalise-erp/release-engine test   # só a regra de negócio
```
