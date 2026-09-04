# Decisões de negócio

## Confirmadas com a liderança (04/09/2026)

1. **Localização do sistema (não é regra de negócio, mas registrado por ser decisão do usuário):** repositório novo e separado, `c:\dev\reanalise-erp`, fora de qualquer pasta sincronizada com nuvem (OneDrive/Drive) — máquina local apenas.
2. **Item 9 — definição de "mês":** o mês usado na contagem de devoluções da regra de retorno (item 8) é o mês/ano da **data de registro da devolução no sistema**, não a data de competência do processo analisado. Implementado em `monthKeyOf()` em `packages/release-engine/src/engine.ts`.
3. **Item 10 — contador da regra de retorno após reset+reliberação no mesmo mês:** uma devolução recebida durante a construção (item 7) **não** é herdada pelo contador de retorno quando a combinação volta a ficar `LIBERADO` no mesmo mês. O contador da regra de retorno só passa a existir/contar a partir do momento em que a combinação (re)atinge `LIBERADO`. Coberto pelo teste 11 (`engine.spec.ts`).
4. **Item 17 — "Próximos da liberação":** adiado. Não será implementado no MVP; fica pendente de definição futura do que significa "próximo".
5. **Status `RETORNADO`:** é um estado persistente e visível (aparece no Mapa, alimenta o filtro "Retornados" do item 17), não um rótulo momentâneo. Uma combinação `RETORNADO` só sai desse estado quando o próximo processo correto é lançado nela — nesse momento vira `EM_CONSTRUCAO(1)` (ou já `LIBERADO` se a diretriz for 1).

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
