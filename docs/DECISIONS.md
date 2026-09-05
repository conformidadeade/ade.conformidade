# Decisões de negócio

## Confirmadas com a liderança (04/09/2026)

1. **Localização do sistema (não é regra de negócio, mas registrado por ser decisão do usuário):** repositório novo e separado, `c:\dev\reanalise-erp`, fora de qualquer pasta sincronizada com nuvem (OneDrive/Drive) — máquina local apenas.
2. **Item 9 — definição de "mês":** o mês usado na contagem de devoluções da regra de retorno (item 8) é o mês/ano da **data de registro da devolução no sistema**, não a data de competência do processo analisado. Implementado em `monthKeyOf()` em `packages/release-engine/src/engine.ts`.
3. **Item 10 — contador da regra de retorno após reset+reliberação no mesmo mês:** uma devolução recebida durante a construção (item 7) **não** é herdada pelo contador de retorno quando a combinação volta a ficar `LIBERADO` no mesmo mês. O contador da regra de retorno só passa a existir/contar a partir do momento em que a combinação (re)atinge `LIBERADO`. Coberto pelo teste 11 (`engine.spec.ts`).
4. **Item 17 — "Próximos da liberação":** adiado. Não será implementado no MVP; fica pendente de definição futura do que significa "próximo".
5. **Status `RETORNADO`:** é um estado persistente e visível (aparece no Mapa, alimenta o filtro "Retornados" do item 17), não um rótulo momentâneo. Uma combinação `RETORNADO` só sai desse estado quando o próximo processo correto é lançado nela — nesse momento vira `EM_CONSTRUCAO(1)` (ou já `LIBERADO` se a diretriz for 1).

## Assumidas ao implementar (detalhes não cobertos pelo requisito, cosméticos/operacionais — não regras de negócio)

- **Filtros de Mês/Ano do Mapa (item 17):** aplicados ao indicador "Devoluções no mês" (contagem por `monthKey` de registro), não a um filtro de período sobre `releasedAt`. Se a liderança quiser também filtrar quais combinações aparecem por período de liberação/retorno, isso é um filtro adicional a especificar.
- **"Devoluções no mês" no Mapa (item 16):** implementado como o contador de RELATÓRIO do item 10 (toda devolução do mês, qualquer estado), não o contador interno da regra de retorno — são propositalmente números diferentes; ver `ARCHITECTURE.md`.
- **Perfis de acesso (item 21):** implementados como enum fixo em `User.role` (não uma tabela RBAC configurável) porque o requisito lista exatamente 3 perfis fixos para a v1. Pode evoluir para RBAC configurável se a liderança pedir mais granularidade no futuro.
- **Sessão do frontend:** bearer token (JWT) em localStorage com refresh automático, não cookies httpOnly + CSRF (padrão mais resistente a XSS usado no leilao-erp). Razoável para uso interno; reavaliar se o sistema for exposto além de rede interna/VPN.
- **Dashboard (item 20):** todos os indicadores "por cliente/meio" (liberações e devoluções) são escopados ao mesmo mês/ano do restante do dashboard, para manter os números coerentes entre si — não são totais históricos.

## Fase 2 — confirmadas com a liderança (05/09/2026)

1. **Exportação (item 4):** restrita a LIDERANÇA/ADMINISTRADOR mesmo quando a tela de origem (Mapa de Liberação, Mapa de Habilidades) é de leitura geral — a ação de exportar é mais restrita que a de visualizar.
2. **`Analyst.name` (item 6.3):** passou a ser `@unique` no schema — nome de analista é único na operação. Necessário para a importação de habilidades resolver a coluna ANALISTA sem ambiguidade.

## Fase 2 — assumidas ao implementar

- **PI na devolução (item 1):** o vínculo automático usa o `AnalyzedProcess` mais recente com o mesmo `(combinationId, piNumber)` quando há mais de um (ex.: reprocessamento com `allowDuplicate`). Não especificado explicitamente; escolha pragmática.
- **"Result" opcional no lançamento (item 2):** mantido no contrato da API (não removido), default `CORRETO` quando ausente — a tela simplesmente não o envia mais. Preserva o teste de regra de negócio já existente para `INCORRETO` no `ReleaseService`.
- **Drill-down do ciclo atual (item 5):** o corte é sempre exatamente `constructionCount` processos (não "tudo que veio depois do último reset"). Numa combinação LIBERADA, processos lançados após a liberação continuam sendo registrados mas não incrementam mais o contador — sem esse corte, a lista poderia mostrar mais PIs do que o número exibido no Mapa, quebrando a garantia pedida de "a lista bate com o progresso exibido".
- **Habilidade automática (item 6.2):** todo lançamento correto marca a habilidade, independentemente do status atual da combinação no motor de reanálise (`EM_CONSTRUCAO`, `LIBERADO` ou `RETORNADO`) — a habilidade é sobre competência demonstrada, não sobre status de liberação.
- **Resolução de nomes na importação (item 6.3):** comparação case-insensitive e com `trim()` nas pontas, para tolerar variação de digitação na planilha.

## Correção de bug pré-existente (encontrado durante verificação manual da Fase 2)

Criar Cliente, Meio ou Analista com nome já existente retornava `500 Internal Server Error` (violação de unicidade do Prisma não tratada) em vez de `409 Conflict` — os três `catalog` services não tinham o mesmo tratamento que já existia em `UsersService`. Corrigido nos três, sem relação com o escopo do adendo, mas descoberto e resolvido no processo.

## Em aberto — não implementar sem confirmar (item 28)

Sinalizadas no requisito original e ainda pendentes de decisão da liderança. Cada uma será revisitada quando a funcionalidade correspondente for implementada, com uma proposta explícita antes do código, não assumida silenciosamente:

- Processo cancelado após lançamento.
- Duplicidade legítima do mesmo PI (reprocessamento) vs. lançamento indevido — item 23.
- Mudança de cliente/meio de um analista com histórico em andamento.
- Analista desligado com combinações em `EM_CONSTRUCAO`/`LIBERADO`.
- Alteração de diretriz com construção em andamento: a implementação atual (`packages/release-engine`) sempre busca o valor **vigente** da diretriz no momento de cada processo correto (efeito imediato, consistente com o item 4), mas não há reconciliação retroativa automática caso a diretriz mude sem um novo lançamento — isso é uma lacuna assumida deliberadamente, sinalizada aqui, não uma decisão definitiva.
- Exclusão/inativação de cadastros (Cliente/Meio/Analista) com histórico associado — regra fixada: nunca excluir fisicamente (item 18), mas o efeito exato da inativação sobre combinações ativas ainda não foi definido.
- Devolução registrada por engano (estorno de devolução).
- Reabertura de uma liberação já retornada fora do fluxo normal (processo correto).
