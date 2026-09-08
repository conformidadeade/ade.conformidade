# Deploy em produção — Vercel + Railway + Cloudflare

Adendo confirmado com a liderança (09/09/2026), substituindo a abordagem anterior de
EC2 + Caddy. **Nunca hardcode** o domínio real, a URL do Railway, nem nenhuma
credencial em código — tudo via variável de ambiente, configurada nos painéis do
Vercel/Railway.

| Camada | Serviço | Função |
|---|---|---|
| Frontend | **Vercel** | Next.js (`apps/web`) — HTTPS automático |
| Backend + banco | **Railway** | NestJS (`apps/api`) + Postgres gerenciado — HTTPS automático |
| DNS | **Cloudflare** | Só DNS do domínio próprio (ver seção "DNS only" abaixo) |

## Arquitetura: por que um proxy same-origin

O cookie de sessão `httpOnly` (adendo "Segurança de sessão") só funciona de forma
transparente se o navegador enxergar frontend e API como a **mesma origem**. Vercel e
Railway são domínios diferentes de verdade — a solução é o próprio Next.js repassar
(`rewrites()`) toda chamada `/api/*` para o backend no Railway, do lado do servidor:

```
Navegador → https://<seu-domínio>/api/auth/login   (o navegador só fala com isto)
              │
              ▼ (proxy interno do Next.js, transparente pro navegador)
         https://<railway-url>/auth/login            (server-to-server, sem CORS)
```

Já implementado no código (nada disso muda quando o domínio real existir):

- `apps/web/next.config.ts` — `rewrites()` repassa `/api/:path*` para `API_PROXY_TARGET`
  (variável de ambiente só do servidor Next.js, nunca `NEXT_PUBLIC_*` — o navegador
  nunca vê essa URL).
- `apps/web/lib/api/client.ts` — todo fetch usa o caminho relativo `/api/...`, nunca
  uma URL absoluta cross-origin.
- `apps/api/src/auth/auth-cookies.ts` — o cookie do refresh token usa `path=/api/auth`
  (não `/auth`) porque o navegador só chama através do proxy — se você mexer nessa
  constante sem entender o motivo, o refresh quebra silenciosamente.
- `COOKIE_DOMAIN` no backend fica **sempre vazio**, inclusive em produção — o cookie
  host-only fica implicitamente restrito a quem o navegador acha que respondeu (o
  domínio do Vercel), nunca ao domínio real do Railway.
- CORS (`CORS_ORIGIN` no backend) continua configurado como camada extra de defesa,
  mas deixa de ser estritamente necessário para o fluxo principal do navegador (que
  agora é tudo mesma origem via o proxy).

Isso foi testado localmente de ponta a ponta simulando exatamente essa topologia:
`apps/web` rodando em `:4002` com `API_PROXY_TARGET=http://localhost:4001` apontando
para `apps/api` em `:4001` — login, `/auth/me`, refresh, logout, e um POST mutante sem
o header CSRF sendo bloqueado (403), tudo através de `localhost:4002/api/...`. Ver
`docs/DECISIONS.md` para os detalhes.

## Ordem de execução

O domínio só é comprado depois — isso **não bloqueia nada** do trabalho técnico:

1. **Hoje:** deploy do backend no Railway → ele já dá uma URL própria com HTTPS
   automático (`algo.up.railway.app`).
2. **Hoje:** deploy do frontend na Vercel, com `API_PROXY_TARGET` apontando para a
   URL do Railway do passo 1 → também recebe uma URL própria (`algo.vercel.app`).
3. **Hoje:** testar o fluxo completo (login, cookie, todas as telas) usando essas duas
   URLs temporárias — isso já valida a arquitetura inteira, inclusive a questão de
   mesma origem para o cookie, sem precisar do domínio final.
4. **Quando o domínio for comprado:** adicionar como domínio customizado no painel da
   Vercel e apontar o DNS no Cloudflare — nenhuma mudança de código, só configuração
   nos dois painéis (tudo já é feito via variável de ambiente).

## 1. Backend no Railway

### 1.1. Criar o projeto e o Postgres

No painel do Railway: **New Project → Deploy from GitHub repo** (aponte para este
repositório) e **+ New → Database → PostgreSQL** no mesmo projeto — o Railway cria a
variável `DATABASE_URL` automaticamente e a disponibiliza para os outros serviços do
projeto via referência (`${{Postgres.DATABASE_URL}}`).

### 1.2. Configurar o serviço da API para usar o Dockerfile

No serviço criado a partir do repo, em **Settings → Build**:

- **Root Directory:** deixe a raiz do repositório (não `apps/api`) — o build do
  Dockerfile precisa do monorepo inteiro como contexto (`apps/api` depende de
  `packages/types` e `packages/release-engine`).
- **Builder:** Dockerfile.
- **Dockerfile Path:** `apps/api/Dockerfile`.

O Dockerfile já cuida de tudo: instala o workspace, gera o Prisma Client, builda
`types` → `release-engine` → `api` nesta ordem (via turbo), poda as dependências de
desenvolvimento, e no `CMD` roda `prisma migrate deploy` antes de subir a API — ou
seja, **as migrations rodam automaticamente a cada deploy**, sem passo manual.

### 1.3. Variáveis de ambiente do serviço API

| Variável | Valor | Observação |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referência automática ao Postgres do mesmo projeto Railway |
| `JWT_ACCESS_SECRET` | gerar um valor aleatório forte | **nunca** reaproveite o valor de `.env.example`/dev |
| `JWT_ACCESS_TTL` | `15m` | |
| `PORT` | não defina | o Railway injeta a própria porta automaticamente; `main.ts` já lê `process.env.PORT` |
| `CORS_ORIGIN` | a URL da Vercel (`https://algo.vercel.app`, depois `https://<seu-domínio>`) | camada extra de defesa, ver seção de arquitetura acima |
| `COOKIE_SECURE` | `true` | HTTPS automático do Railway já cobre o requisito |
| `COOKIE_DOMAIN` | *(deixe vazio)* | ver seção de arquitetura acima — nunca preencha com o domínio do Railway |
| `ADMIN_EMAIL` | e-mail real do primeiro administrador | só lido pelo `prisma:seed` (passo 1.4), não pela API em si |
| `ADMIN_PASSWORD` | *(deixe indefinido)* | sem definir, o seed gera uma senha temporária forte sozinho e a imprime uma vez nos logs — ver adendo "Deploy limpo" em `docs/DECISIONS.md` |

`.env.example` em `apps/api` documenta as mesmas variáveis com comentários — mantenha
os dois em sincronia se adicionar alguma nova.

### 1.4. Criar a conta de Administrador inicial (uma vez, manual)

O `CMD` do container roda as migrations automaticamente, mas **não** o seed — ele é
intencionalmente um passo manual único (rodar toda vez que o container reinicia seria
inofensivo, já que é idempotente, mas não há necessidade). Com a
[Railway CLI](https://docs.railway.com/guides/cli) instalada e logada:

```
railway link                                    # conecta ao projeto (uma vez)
railway run --service=<nome-do-serviço-api> pnpm --filter @reanalise-erp/api prisma:seed
```

Isso roda o comando com as mesmas variáveis de ambiente do serviço (`DATABASE_URL`
incluída) sem precisar expor o Postgres publicamente. A senha gerada aparece uma única
vez na saída do comando — anote-a, ela não é recuperável depois (só o hash argon2 fica
salvo). Troque-a assim que logar, em **Usuários → Editar (na própria conta) → Nova
senha** (ver `docs/DECISIONS.md`, adendo "Deploy limpo").

## 2. Frontend na Vercel

### 2.1. Criar o projeto

**Add New → Project**, importe este repositório. A Vercel detecta o monorepo
(pnpm-workspace.yaml na raiz) — em **Settings → General**:

- **Root Directory:** `apps/web`.
- **Include files outside the root directory:** **ligado** — sem isso, a Vercel não
  enxerga `packages/types`, do qual `apps/web` depende via `workspace:*`, e o build
  falha. É a pegadinha mais comum de monorepo pnpm na Vercel.
- Framework Preset: Next.js (detectado automaticamente).

### 2.2. Variáveis de ambiente

| Variável | Valor | Observação |
|---|---|---|
| `API_PROXY_TARGET` | a URL do serviço no Railway (`https://algo.up.railway.app`) | server-only — **não** prefixe com `NEXT_PUBLIC_` |

Só essa. Nenhuma outra variável de ambiente é necessária no frontend hoje — a sessão
inteira vive em cookies geridos pelo backend através do proxy.

### 2.3. Deploy

Ao terminar o deploy, a Vercel dá uma URL (`algo.vercel.app`). Teste o fluxo completo
nela antes de seguir para o domínio customizado (ver "O que testar" abaixo).

## 3. Domínio customizado + DNS no Cloudflare

Só depois que o domínio for comprado — nenhuma mudança de código.

1. No painel da Vercel: **Settings → Domains → Add**, digite `<seu-domínio>`.
2. A Vercel mostra os registros DNS necessários (tipicamente um `A` apontando para o
   IP da Vercel, ou um `CNAME` para `cname.vercel-dns.com`, dependendo se é o domínio
   raiz ou um subdomínio — a Vercel mostra o valor exato na hora).
3. No Cloudflare, crie esse registro **em modo "DNS only" (nuvem cinza, não laranja)**.

**Por que "DNS only" e não o proxy do Cloudflare (nuvem laranja):** confirmado na
documentação oficial da Vercel (KB "Should I use Cloudflare in front of Vercel?",
consultada em 09/09/2026) — a Vercel recomenda explicitamente **não** usar um proxy
reverso (Cloudflare incluso) na frente da plataforma: reduz a visibilidade de tráfego
do Firewall/proteção contra bots da própria Vercel, e o modo proxy do Cloudflare (nuvem
laranja) é uma causa documentada de erros de SSL (526) e timeout (524) contra domínios
na Vercel. **Isso é uma recomendação, verifique a documentação da Vercel na hora de
configurar de verdade — ela pode mudar.** Fonte: https://vercel.com/kb/guide/cloudflare-with-vercel

4. Aguarde a Vercel emitir o certificado (automático, geralmente minutos) e confirmar
   o domínio como válido no painel.

## 4. O que testar antes de considerar o MVP pronto (feito, com números reais)

O adendo original levantava um risco real: o plano Hobby da Vercel tinha
historicamente um limite de 10s para funções serverless, o que poderia quebrar a
exportação Excel/PDF e a importação de planilha do Mapa de Habilidades através do
proxy. Investigamos e testamos antes de assumir qualquer coisa:

**O que a documentação oficial da Vercel diz hoje (consultada em 09/09/2026):**
- Um `rewrites()` para uma URL **externa** (como o nosso, apontando pro Railway) roda
  na camada de roteamento da Vercel, **não** invoca uma Vercel Function — o limite
  documentado para isso é **120 segundos**
  (`ROUTER_EXTERNAL_TARGET_ERROR` — https://vercel.com/docs/errors/ROUTER_EXTERNAL_TARGET_ERROR),
  não os 10s de função serverless que o adendo original citava.
- Separadamente, a página de limites de Vercel Functions (não é o nosso caso, mas por
  completude) já mostra hoje o padrão do Hobby em 300s com Fluid Compute (ligado por
  padrão em projetos novos) — https://vercel.com/docs/functions/limitations — bem
  longe dos 10s legados que motivaram a preocupação original.
- **Isso não é 100% garantido até o deploy real** — a documentação não confirma
  explicitamente a diferenciação por plano para o limite de 120s de rewrite externo, e
  não há como testar o comportamento exato da infraestrutura da Vercel localmente.

**O que medimos de verdade, localmente, através do proxy (`localhost:4002/api/...`),
contra o Postgres real com os dados reais da operação:**

| Fluxo | Volume testado | Tempo medido |
|---|---|---|
| Exportação Excel do Mapa de Liberação (base completa) | 9 combinações reais | 0,26s |
| Exportação PDF do Mapa de Liberação (base completa) | 9 combinações reais | 0,80s |
| Exportação Excel do Mapa de Habilidades | dados reais atuais | 0,22s |
| Importação de planilha do Mapa de Habilidades | **20.000 linhas sintéticas** (maior que o maior import real já feito, 13.321 evidências) | **8,86s** |

Todos muito abaixo dos 120s do limite de rewrite externo; a importação de 20 mil
linhas chega perto do antigo limite legado de 10s (mas não o nosso caso real, e nem
esse limite deveria se aplicar aqui). **Conclusão: o risco descrito no adendo original
parece ter sido baseado numa informação desatualizada da Vercel** (o limite de 10s do
Hobby mudou, e mesmo esse limite não se aplicaria a este padrão de proxy específico) —
mas isso só é 100% confirmado depois do deploy real. **Teste os dois fluxos de novo
direto na URL da Vercel assim que o deploy subir, antes de liberar para a equipe.**

**Se algum desses fluxos realmente estourar em produção** (medição real após o
deploy), a saída documentada — mas **não implementada, precisa de confirmação
explícita antes** — é fazer o frontend chamar essas duas rotas específicas
(`/skills/import`, `/combinations/export.*`, `/skills/export.*`) diretamente na URL do
Railway em vez de passar pelo proxy `/api/*`. Isso quebra a garantia de "mesma origem"
só para essas rotas — exigiria reavaliar como o cookie/CSRF funciona nelas
especificamente (provavelmente CORS explícito + enviar o cookie cross-origin), então
não decida isso sozinho, sinalize antes de implementar.

## 5. Custo mensal estimado

| Serviço | Plano | Custo |
|---|---|---|
| Vercel | Hobby (decisão já tomada — ver `docs/DECISIONS.md`) | Grátis, migrar para Pro (US$ 20/mês por membro) depois de validado |
| Railway | Hobby + uso (API + Postgres no mesmo projeto) | A partir de US$ 5/mês de crédito incluso; uso real depende de CPU/RAM/tráfego — acompanhar no painel nas primeiras semanas |
| Cloudflare | Free (só DNS) | Grátis |

**Atenção (já sinalizado, não decidido aqui):** o plano Hobby da Vercel é para uso
não-comercial pelos termos de serviço — usar para o MVP em teste é um risco aceito
temporariamente, a resolver migrando para o Pro depois de validado (decisão já tomada,
registrada em `docs/DECISIONS.md`).

## 6. Referência rápida — variáveis de ambiente por serviço

**Railway (API):** `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `CORS_ORIGIN`,
`COOKIE_SECURE=true`, `COOKIE_DOMAIN` (vazio), `ADMIN_EMAIL` (só para o seed manual).

**Vercel (web):** `API_PROXY_TARGET`.

**Dev local:** ver `apps/api/.env.example` e `apps/web/.env.local.example` — já
atualizados para o padrão de proxy same-origin (`apps/web` chama `/api/...` e o Next
local repassa para `http://localhost:4001` via o mesmo mecanismo de `rewrites()`).
