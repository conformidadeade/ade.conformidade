# Arquitetura

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Backend | NestJS + Prisma + PostgreSQL | Integridade transacional forte (`$transaction` para toda mudança de estado), migrations versionadas = schema auditável, tipagem ponta a ponta com Prisma Client. |
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind 4 + Radix UI + `next-themes` | Dark/light mode resolvido por biblioteca, componentes acessíveis prontos, App Router para rotas administrativas com RSC. |
| Dados auxiliares | TanStack Query, React Hook Form + Zod, Recharts | Cache/sincronização de servidor, formulários validados, gráficos do dashboard. |
| Hospedagem | A definir junto com a infra (ver `infra/` quando criado) | Uso corporativo interno, não precisa escalar horizontalmente — um único ambiente (ou staging+prod) atende. |

Critérios do item 29 atendidos: integridade transacional (Postgres), manutenção por equipe pequena (uma única stack TS ponta a ponta, sem microsserviços), dark/light mode nativo, histórico auditável (ver abaixo).

## Padrão: estado derivado de eventos imutáveis

Regra central (itens 13, 22, 25): **nenhuma tabela de estado é atualizada sem que o evento que causou a mudança seja gravado antes, na mesma transação.**

- `packages/release-engine` (pronto): módulo puro TypeScript, sem I/O, que recebe um `CombinationState` + um input (processo correto / devolução / reset manual / retorno manual) e devolve o novo `CombinationState` + a lista de `DomainEvent`s gerados. 100% testável sem banco — ver `engine.spec.ts`, que cobre os 11 cenários do item 31 mais 5 casos de borda.
- `apps/api` (a implementar) chama essas funções dentro de uma transação Prisma que: valida duplicidade → busca a diretriz vigente → chama a função pura → persiste o(s) evento(s) em `reanalysis_events` (append-only) → atualiza o read model em `analyst_client_media` → grava `audit_logs`.
- O "read model" (status atual, contador atual) existe só por performance de listagem do Mapa; a fonte de verdade é a sequência de eventos.

## Os dois contadores (item 10 — não confundir)

| Contador | Onde vive | Regra |
|---|---|---|
| Construção vigente | `CombinationState.constructionCount` | Zera em qualquer devolução recebida durante `EM_CONSTRUCAO`/`RETORNADO` (item 7). Não tem relação com o mês. |
| Regra de retorno (item 8) | `CombinationState.monthlyReturnCount` + `monthlyReturnMonthKey` | Só incrementa quando o status já é `LIBERADO`. Reinicia sozinho ao virar o mês (chave = mês de registro da devolução, item 9, decisão confirmada). **Não herda** devoluções ocorridas durante a construção (decisão confirmada, item 10/teste 11). |
| Indicador/relatório (item 10) | Query agregada sobre `reanalysis_events`/`reanalysis_returns`, **não** um campo do estado | Conta toda devolução do mês, em qualquer estado. Nunca deve ser lido a partir de `monthlyReturnCount` — são fontes diferentes de propósito. |

## Máquina de estados

```
EM_CONSTRUCAO(n)  --devolução-->                    EM_CONSTRUCAO(0)                 [item 7]
EM_CONSTRUCAO(n)  --processo correto, atinge meta--> LIBERADO                        [item 6, automático]
LIBERADO          --1ª devolução do mês-->           LIBERADO (contador=1)           [item 8]
LIBERADO          --2ª devolução do mês-->           RETORNADO (contador zera)       [item 8]
LIBERADO          --retorno manual (liderança)-->    RETORNADO                       [item 12]
RETORNADO         --devolução-->                     RETORNADO (nada a zerar)
RETORNADO         --processo correto-->               EM_CONSTRUCAO(1) ou já LIBERADO se meta=1
EM_CONSTRUCAO(n)  --reset manual (liderança)-->      EM_CONSTRUCAO(0)                [item 11]
```

Decisão confirmada: `RETORNADO` é um status persistente e visível no Mapa (não um rótulo momentâneo) — só sai desse estado quando o próximo processo correto é lançado naquela combinação. Isso dá significado real ao filtro "Retornados" do item 17.

## Entidades (Prisma — a implementar em `apps/api`)

- `User` (auth), `Role`/`Permission` (RBAC configurável, ADMIN/LIDERANÇA/ANALISTA)
- `Analyst`, `Client`, `MediaChannel` — cadastros, nunca deletados fisicamente se tiverem histórico (item 18); campo `active`.
- `Guideline` — Cliente + Meio + quantidade + regra de devolução + vigência; alteração cria nova versão/linha de histórico, nunca sobrescreve (item 19).
- `AnalystClientMedia` — a entidade central com estado (`status`, `constructionCount`, `monthlyReturnCount`, `monthlyReturnMonthKey`, `releasedAt`, `lastReturnAt`, `lastReturnReason`). Chave única `(analystId, clientId, mediaChannelId)`.
- `AnalyzedProcess` — PI, data, resultado, quem lançou.
- `ReanalysisEvent` — log append-only de tudo que `release-engine` emite (`PROCESS_CORRECT`, `RELEASED`, `RETURN_RESET`, `RETURN_COUNTED`, `AUTO_RETURN`, `MANUAL_RESET`, `MANUAL_RETURN`), com `before`/`after` em JSON.
- `AuditLog` — genérico, para CRUD de cadastros/diretrizes/permissões (padrão `entityType`/`entityId`/`before`/`after`/`userId`).

## Duplicidade (item 23)

Antes de gravar um `AnalyzedProcess`, verificar `(clientId, mediaChannelId, analystId, piNumber, analysisDate)` já existente. Se houver, bloquear com mensagem clara em vez de assumir silenciosamente que é erro — a decisão de permitir reanálise do mesmo PI (ex.: reprocessamento legítimo) fica sinalizada como pergunta em aberto (item 28), tratada quando a tela de lançamento for implementada.

## Permissões

Reaproveita o padrão RBAC configurável (`Role` + `Permission` + associação N:N), com três roles seed: ADMINISTRADOR (tudo), LIDERANÇA (cadastros, diretrizes, lançamentos, devoluções, reset/retorno manual, histórico, dashboard), ANALISTA (somente consulta).

## Auditoria

Toda ação relevante grava em `AuditLog` (CRUD de cadastros/diretrizes) e/ou `ReanalysisEvent` (mudanças de estado de uma combinação). Nenhum dos dois é editável/removível pela aplicação.
