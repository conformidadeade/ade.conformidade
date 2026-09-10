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
- ~~**Sessão do frontend:** bearer token (JWT) em localStorage com refresh automático, não cookies httpOnly + CSRF (padrão mais resistente a XSS usado no leilao-erp). Razoável para uso interno; reavaliar se o sistema for exposto além de rede interna/VPN.~~ **Superado em 08/09/2026** — ver adendo "Segurança de sessão" abaixo.
- ~~**Dashboard (item 20):** todos os indicadores "por cliente/meio" (liberações e devoluções) são escopados ao mesmo mês/ano do restante do dashboard, para manter os números coerentes entre si — não são totais históricos.~~ **Superado em 08/09/2026** — ver adendo "Dashboard: mostrar totais de todos os períodos" abaixo.

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

## Bug investigado — Dashboard "não recalcula" (08/09/2026)

Reportado como possível bug: cards "no mês" e gráficos "por cliente" zerados/vazios com filtro de Cliente=SECOM ou Analista=Vinicius Rodrigues, mesmo havendo combinações liberadas para eles. Reproduzido com os dados reais do banco local: confirmado que **não é bug** — todas as liberações/eventos dessas combinações ocorreram em 2024/2025, nenhuma movimentação real aconteceu no mês corrente (09/2026). Os contadores "no mês" e os gráficos por cliente/meio são, por definição, escopados ao mês (ver comentário em `dashboard.service.ts`); os cards "Combinações em construção/liberadas" são total acumulado. Comportamento correto, mas rótulo ambíguo — corrigido só o rótulo: cards passaram a ter um subtítulo ("Total atual" vs. "Neste mês (mês/ano)"), e os gráficos por cliente/meio ganharam subtítulo de escopo mensal e uma mensagem de vazio mais explícita. Confirmado também que o dashboard do papel ANALISTA usa o mesmo `DashboardService` do Admin/Liderança (só força `analystId` via `scopeAnalystId`) — não há lógica duplicada/divergente entre os dois caminhos. Cobertura de teste dos filtros (Cliente, Analista, gráfico "por cliente" com dado real no mês) já existia em `dashboard.service.spec.ts` desde a Fase 2 — nenhum teste novo foi necessário.

## Adendo "Origem da devolução" — confirmado com a liderança (08/09/2026)

1. **Campo `origin` (`ReanalysisReturn`):** obrigatório, sem default silencioso, puramente informativo — nunca lido por `packages/release-engine` nem por nenhuma regra de contagem. Confirmado por teste (`release.service.spec.ts`) que uma devolução CLIENTE tem exatamente o mesmo efeito no motor que uma REANALISE.
2. **Migration em produção vs. local:** produção nasce zerada (ver adendo "Deploy limpo"), então lá o campo é obrigatório desde o início sem backfill. No banco **local** (mantido com os dados atuais — decisão abaixo), as 4 devoluções pré-existentes receberam `REANALISE` como valor arbitrário só para não travar a migration; não reflete a origem real delas.
3. **Filtro "Origem" no Mapa de Liberação:** o Mapa é uma linha por combinação, não por devolução — o filtro mostra combinações com ao menos 1 devolução daquela origem dentro do mesmo mês/ano usado para a coluna "Devoluções no mês" (mesma janela).
4. **Escopo do filtro/indicador no Dashboard:** "Origem" só recorta os indicadores baseados em devolução (Devoluções no mês, por cliente/meio, por origem) — não afeta Combinações em construção/liberadas nem Liberações no mês, que não têm origem.
5. **Exportação (item 6) e drill-down do ciclo atual (item 7):** confirmado por inspeção do código que **não se aplicam** — a exportação do Mapa é uma linha por combinação (nunca lista devoluções individuais) e o drill-down do ciclo atual só lista processos corretos, nunca devoluções. Nenhuma mudança feita nesses dois pontos.

## Adendo "Preparar subida para a rede com banco zerado" — em andamento (08/09/2026)

- **Banco local:** a liderança confirmou explicitamente manter os dados locais atuais — o processo de zeramento vale só para quando o banco de produção for criado, não para o ambiente de desenvolvimento.
- **Exposição de rede:** a liderança confirmou que o ambiente de rede **terá exposição externa** (não é só interno/VPN). Isso reabre a decisão registrada acima ("Sessão do frontend: bearer token em localStorage... reavaliar se o sistema for exposto além de rede interna/VPN") — sinalizado como item em aberto abaixo; nenhuma mudança de estratégia de sessão foi feita ainda, precisa de uma proposta explícita antes de implementar.

## Adendo "Segurança de sessão: migrar de localStorage para cookie httpOnly + CSRF" — confirmado e implementado (08/09/2026)

Motivo: liderança confirmou que o sistema terá acesso externo (fora de rede interna/VPN) — `localStorage` é legível por qualquer script na página (vulnerável a roubo de token via XSS); cookie `httpOnly` não é.

- **Transporte:** login/refresh não retornam mais `accessToken`/`refreshToken` no corpo — só `{ user }`. Os tokens saem como `Set-Cookie`: `access_token` (httpOnly, `path=/`, 15min) e `refresh_token` (httpOnly, `path=/auth` — só trafega para as rotas de auth, nunca para o resto da API). A rotação de refresh token já existente (hash + revogação em `RefreshToken`) não mudou, só o transporte.
- **CSRF:** double-submit cookie. Um terceiro cookie `XSRF-TOKEN`, deliberadamente **não** httpOnly (legível por JS — é a metade "conhecida pelo cliente" do padrão), é gravado junto no login/refresh. Toda requisição mutante (POST/PUT/PATCH/DELETE) precisa ecoar esse valor no header `X-CSRF-Token`; validado por `CsrfGuard`, registrado globalmente (`APP_GUARD`) — se aplica a toda rota mutante de todo controller automaticamente. GET não passa pela checagem. Sem cookie de sessão ainda (ex.: login) a checagem é pulada.
- **`SameSite=Lax`** (não `strict`): cobre o uso normal de SPA same-site sem quebrar nada hoje (não há links de terceiros que dependam do cookie ser enviado em navegação cross-site) — e já bloqueia sozinho o vetor clássico de CSRF via formulário de outro site (que é POST, não navegação de topo GET). O double-submit token é defesa em profundidade sobre isso, não a única barreira.
- **`GET /auth/me`:** novo endpoint, usado no boot do SPA para confirmar se a sessão (cookie) ainda é válida e obter os dados do usuário — revalida contra o banco (não confia só no payload do JWT), cobrindo conta desativada ou vínculo de analista alterado desde a emissão do token.
- **Padrão espelhado do `leilao-erp`** (`apps/api/src/modules/auth/auth-cookies.ts`, `common/guards/csrf.guard.ts`, `modules/auth/strategies/jwt.strategy.ts`), adaptado à estrutura de módulos deste repositório — mesmas escolhas de cookie/CSRF, mesma lógica.
- **`JwtStrategy`:** aceita cookie OU header `Authorization: Bearer` (cookie tem prioridade) — o header continua funcionando para testar pela UI do Swagger (`/docs`), que não mantém cookie de navegador.
- **CORS:** `credentials: true` + origem explícita via `CORS_ORIGIN` (nunca `"*"` — cookies não funcionam entre origens com wildcard). `COOKIE_SECURE`/`COOKIE_DOMAIN` também via env — `COOKIE_SECURE=false` só em dev local (HTTP), deve ser `true` (padrão se a env não for definida) em produção.
- **Bug corrigido no caminho:** o botão "Sair" nunca chamava `/auth/logout` — só limpava o estado local do frontend, deixando o refresh token ainda válido no banco (reaproveitável se alguém obtivesse o cookie antigo). Corrigido para chamar a API antes de limpar o estado local.
- **Testes:** `csrf.guard.spec.ts` (guard isolado) e `auth.integration.spec.ts` (HTTP real via supertest, sem overrideGuard — cookies de verdade, incluindo o cenário de escrita autenticada sem o header CSRF sendo rejeitada, e reaproveitar o refresh token antigo depois do logout falhando). Validado também ao vivo contra o Postgres real: cookies com as flags certas, preflight CORS liberando o header `x-csrf-token`, `/auth/me` fica 401 depois do logout.

## Adendo "Dashboard: mostrar totais de todos os períodos" — confirmado com a liderança (08/09/2026)

Removido o escopo mensal do Dashboard: todos os indicadores e gráficos (Liberações, Retornos à reanálise, Devoluções, Devoluções por origem, "por cliente"/"por meio") passam a ser **totais acumulados desde sempre**, sem seletor de mês/ano — não é um filtro adicional, é o único comportamento agora. `DashboardService.getIndicators` não recebe mais `month`/`year`. Renomeados os campos de `DashboardIndicators` para refletir isso (`releasesThisMonth` → `releasesTotal`, `returnsToReanalysisThisMonth` → `returnsToReanalysisTotal`, `reportedReturnsThisMonth` → `reportedReturnsTotal`) — quebra de contrato deliberada, não há consumidores externos do tipo além do próprio `apps/web`. **Não afeta**: `packages/release-engine`, `monthlyReturnCount`/`monthKey` (regra "2 devoluções no mês"), nem o Mapa de Liberação (`/mapa`, `CombinationsService`), que continua com seu próprio filtro de mês/ano e a coluna "Devoluções no mês" — são dois lugares e duas decisões de apresentação independentes, confirmadas separadamente. "Analistas ativos", "Combinações em construção" e "Combinações liberadas" já eram estado atual (não mensal) e continuam assim, sem mudança.

## Adendo "Deploy em produção: Vercel + Railway + Cloudflare" — confirmado e implementado (09/09/2026)

Substitui a abordagem anterior de EC2 + Caddy (nunca chegou a ser implementada — só
estava registrada como plano em aberto). Ver `docs/DEPLOY.md` para o passo a passo
completo.

**Revisão de arquitetura, mesmo dia (09/09/2026) — proxy same-origin abandonado:**
o plano original (item 1 abaixo) usava `rewrites()` do Next.js para o front e a API
parecerem a mesma origem para o navegador. Testado no deploy real e encontrado
quebrado: a Vercel recusa fazer o proxy para o range de IP do Railway
(`DNS_HOSTNAME_RESOLVED_PRIVATE` — ela classifica esse range como "privado",
incorretamente). Confirmado que não é problema de hostname/DNS nosso: testado com
dois hostnames diferentes do Railway apontando para o mesmo range de IP, mesmo erro
nos dois. É uma limitação de infraestrutura entre os dois provedores, fora do nosso
controle.

**Solução adotada:** cookie de domínio compartilhado entre subdomínios, não mais
"mesma origem" estrita. `COOKIE_DOMAIN` no backend passa a ser `.{domínio-raiz}`
(com ponto na frente) em produção — o cookie fica válido tanto para
`www.{domínio}` (frontend) quanto `api.{domínio}` (backend). Os dois são
"same-site" (mesmo domínio registrável) mesmo não sendo "same-origin", então
`SameSite=Lax` continua funcionando sem precisar de `SameSite=None`. O frontend
volta a chamar a API por uma URL absoluta (`NEXT_PUBLIC_API_URL`), e CORS
(`CORS_ORIGIN`) volta a ser estritamente necessário (não é mais só "camada extra de
defesa" como o item 1 abaixo dizia). `next.config.ts` não tem mais `rewrites()`;
`REFRESH_COOKIE_PATH` em `auth-cookies.ts` voltou a ser `/auth` (não `/api/auth`).
Testado localmente simulando o cenário cross-origin real (requisição com header
`Origin` diferente, como o navegador manda) antes de subir — CORS, cookies e a
suíte completa de testes (84 testes) continuam passando.

Decisões técnicas tomadas ao implementar (histórico — item 1 é o que foi
substituído pela revisão acima; itens 2 em diante continuam válidos):

1. ~~**Proxy same-origin via `rewrites()` do Next.js**, não CORS cross-origin direto —
   necessário para o cookie `httpOnly` funcionar sem reabrir a discussão de segurança
   do adendo anterior. `apps/web/lib/api/client.ts` passou a usar só o caminho relativo
   `/api/...` (nunca mais uma URL absoluta); `API_PROXY_TARGET` (env var só do
   servidor Next.js) substituiu `NEXT_PUBLIC_API_URL`.~~ **Abandonado — ver revisão de
   arquitetura acima.**
2. ~~**Bug pego no caminho:** o cookie do refresh token usava `path=/auth` — com o proxy,
   o navegador só chama `/api/auth/...`, então esse path nunca bateria e o refresh
   quebraria silenciosamente em produção. Corrigido para `path=/api/auth` (só isso; o
   access token e o CSRF token já usavam `path=/`, sem esse problema).~~ **Revertido —
   voltou a ser `/auth`, sem proxy.**
3. ~~**`COOKIE_DOMAIN` deve ficar sempre vazio**, inclusive em produção — corrigido um
   comentário anterior (adendo "Segurança de sessão") que sugeria preencher com o
   domínio do backend; com o proxy, isso quebraria o cookie (o navegador nunca fala
   diretamente com o Railway).~~ **Invertido de novo — ver revisão de arquitetura
   acima: `COOKIE_DOMAIN=".{domínio-raiz}"` é exatamente o que faz a sessão funcionar
   agora, sem proxy.**
4. **`pnpm deploy` não foi usado no Dockerfile** — testado localmente e encontrado
   quebrado nesta versão do pnpm (11.20.0): regressão conhecida
   (pnpm/pnpm#13754) faz os pacotes `workspace:*` ficarem symlinkados para FORA da
   pasta extraída, o que quebraria em runtime num container isolado. Usado em vez
   disso: build seguido de `pnpm install --prod` no lugar (mantendo a árvore do
   monorepo intacta), depois cópia seletiva para a imagem final. Testado localmente
   rodando `node dist/main.js` com as dependências de desenvolvimento podadas —
   login e `prisma migrate deploy` via `npx` funcionaram normalmente.
5. **`prisma` (CLI) e `ts-node` movidos de devDependencies para dependencies** em
   `apps/api/package.json` — necessários em runtime (`prisma migrate deploy` no `CMD`
   do container; `ts-node` para rodar o seed manual via `prisma:seed`).
6. **`postinstall` adicionado** (`prisma generate`) — garante que o Prisma Client
   nunca fique dessincronizado do schema depois de um install, em qualquer ambiente.
7. ~~**Risco do limite de 10s do plano Hobby da Vercel (levantado no adendo original):**
   investigado com a documentação oficial da Vercel (09/09/2026) — um `rewrites()`
   para URL externa roda na camada de roteamento (limite de 120s,
   `ROUTER_EXTERNAL_TARGET_ERROR`), não invoca uma Vercel Function...~~ **Discussão
   ficou sem objeto com o abandono do proxy** (item 1) — sem `rewrites()`, não existe
   mais um limite da Vercel no meio do caminho para essa chamada específica (o
   navegador fala direto com o Railway). Os números medidos (exportações <1s,
   importação de 20.000 linhas em 8,86s) continuam valendo como referência real de
   performance do backend, só não como resposta a um limite de proxy que não existe
   mais nesse fluxo.
8. **`.gitignore` corrigido:** `apps/web/.env.local.example` nunca foi versionado
   (o padrão `!.env.example` não cobria `.env.local.example`, um nome diferente) —
   um clone novo do repositório nunca teria esse arquivo, quebrando o próprio passo
   `cp apps/web/.env.local.example apps/web/.env.local` do README. Corrigido.
9. **Não verificado nesta sessão (sem Docker disponível no ambiente):** o build real
   via `docker build`. Cada etapa do Dockerfile foi validada individualmente fora do
   Docker (install, build, prune de dependências, boot da API podada, migration via
   `npx`) e a montagem final do container em runtime é a única parte não testada de
   ponta a ponta — recomendado rodar `docker build` localmente (se disponível) ou
   validar direto no primeiro deploy do Railway antes de confiar cegamente.

## Adendo "Confirmação de e-mail e recuperação de senha" — confirmado e implementado (09/09/2026)

Contas novas criadas em Usuários nascem sem senha (`User.passwordHash` agora
nulável); o sistema envia um convite por e-mail para a própria pessoa confirmar o
e-mail e definir a senha — o Administrador nunca chega a saber a senha de ninguém
(decisão já confirmada antes de implementar). Existe também recuperação de senha
self-service ("esqueci minha senha"). E-mails via Resend (free tier), enviados do
domínio próprio `adeonline.com.br` — não da caixa corporativa Microsoft 365 — para
não depender de acesso ao admin de e-mail daquela organização. Ver `docs/DEPLOY.md`
seção 1.6 para o passo a passo de verificação de domínio no Resend.

**Escopo explicitamente preservado, sem alteração:** o `prisma:seed` (bootstrap do
primeiro Administrador) continua exatamente como estava — senha temporária impressa
no terminal, sem depender de e-mail algum (o sistema não tem nenhum e-mail
configurado nesse momento do deploy). Este adendo vale só para contas criadas
DEPOIS, pela tela de Usuários. A troca manual de senha pelo Administrador (tela
Usuários → Editar → Nova senha) também foi mantida como caminho alternativo — útil
se alguém perder acesso ao próprio e-mail.

**Suposições assumidas ao implementar (sinalizadas aqui, como pedido — não
decididas silenciosamente na dúvida):**

1. **Backfill de `emailConfirmedAt` nas contas já existentes:** a migration marca
   `emailConfirmedAt = createdAt` para toda conta que já tinha `passwordHash`
   definido (ou seja, toda conta criada antes deste adendo) — nenhuma conta
   pré-existente é obrigada a reconfirmar o e-mail. Verificado contra os 13 usuários
   reais do banco local (incluindo `admin@reanalise.local`) antes de considerar a
   migration correta.
2. **URL do frontend usada nos links dos e-mails:** reaproveita a variável
   `CORS_ORIGIN` já existente (é exatamente essa URL) em vez de criar uma variável
   nova só para isso — menos uma env var para manter sincronizada entre os
   ambientes.
3. **Fallback de e-mail em dev/sem `RESEND_API_KEY`:** em vez de falhar, o
   `EmailService` loga o e-mail que enviaria (destinatário, assunto, link) e
   retorna normalmente — permite rodar o fluxo completo localmente (inclusive os
   testes de integração) sem depender de credencial nenhuma do Resend.
4. **Throttling nomeado no requisito:** o pedido citou por nome dois endpoints a
   limitar (`forgot-password` e o reenvio de convite) — `reset-password` (troca de
   senha com token já em mãos) **não** foi colocado atrás de rate limiting, por não
   ter sido um dos dois citados e por já depender de um token de posse (não é um
   alvo de enumeração/spam do mesmo jeito que os outros dois). Se a liderança
   preferir limitar também esse, é uma mudança pequena e isolada
   (`@UseGuards(ThrottlerGuard)` + `@Throttle(...)` no `AuthController`).
5. **Falha no envio do e-mail de convite não desfaz a criação da conta** — a conta
   já foi criada e "Reenviar convite" cobre o caso de a primeira tentativa de envio
   falhar (ex.: Resend fora do ar); a UI mostra feedback do resultado do reenvio.

**Cobertura de teste** (unitária + integração real via `supertest`, sem
`overrideGuard` nas suítes de auth): conta criada nasce sem senha e dispara convite
(mockado); login bloqueado com mensagem distinta antes da confirmação; token de
convite válido define senha e confirma e-mail, login passa a funcionar, e o mesmo
token não pode ser reaproveitado; token expirado ou já usado dá erro claro sem
alterar dado nenhum; reemitir invalida o token anterior (o antigo para de
funcionar, só o novo funciona); "esqueci minha senha" com e-mail existente emite
token e "envia" e-mail (mock); com e-mail inexistente, a API responde a MESMA
mensagem genérica e nenhum e-mail é realmente enviado (só observável dentro do
teste, nunca na resposta HTTP); redefinição de senha com token válido revoga todas
as sessões ativas (refresh tokens) do usuário; rate limiting testado nos dois
endpoints citados, em suítes isoladas com sua própria instância de app (o
`ThrottlerGuard` padrão rastreia por IP da requisição — reaproveitar a mesma
instância de app dos outros testes contaminaria a contagem entre eles).

**Validado em produção (09/09/2026, ao vivo, pela liderança):** domínio
`adeonline.com.br` verificado no Resend; `RESEND_API_KEY`/`EMAIL_FROM`
configurados no Railway; os dois fluxos testados de ponta a ponta no ambiente
real — convite de conta nova (e-mail recebido, link `/definir-senha/...`
funcionando) e "esqueci minha senha" (e-mail recebido, link
`/redefinir-senha/...` funcionando). Pendência apontada durante o teste: a
chave de API do Resend usada nesse teste apareceu em texto puro numa captura
de tela — recomendado revogá-la no painel do Resend e gerar uma nova assim
que possível, só trocando o valor da variável no Railway.

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
- ~~**Estratégia de sessão do frontend para exposição externa (08/09/2026)**~~ — **Resolvida em 08/09/2026**, ver adendo "Segurança de sessão" abaixo.
- **Recomendações adicionais de segurança para exposição externa (08/09/2026, sinalizadas — não implementadas):** HTTPS obrigatório com certificado válido e redirecionamento HTTP→HTTPS (o cookie `secure` já exige isso para funcionar em produção); rate limiting no endpoint de login para dificultar força bruta; revisar política de senha (tamanho mínimo, complexidade) — hoje só `@MinLength(8)` na criação/troca de senha, nenhuma outra regra. Nenhuma dessas foi implementada — ficam sinalizadas para a liderança decidir separadamente antes do deploy externo.
