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
  api/                 # NestJS + Prisma (a implementar)
  web/                 # Next.js (a implementar)
packages/
  release-engine/      # regra de negócio pura — pronto e testado
docs/
  ARCHITECTURE.md
  DECISIONS.md
```

## Rodando

```
pnpm install
pnpm test          # roda os testes de todos os pacotes/apps
pnpm --filter @reanalise-erp/release-engine test   # só a regra de negócio
```
