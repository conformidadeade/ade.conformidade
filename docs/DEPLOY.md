# Deploy em produção — Vercel + Railway + Cloudflare

Adendo confirmado com a liderança (09/09/2026), substituindo a abordagem anterior de
EC2 + Caddy. **Nunca hardcode** o domínio real, a URL do Railway, nem nenhuma
credencial em código — tudo via variável de ambiente, configurada nos painéis do
Vercel/Railway.

| Camada | Serviço | Função |
|---|---|---|
| Frontend | **Vercel** — `www.<domínio>` | Next.js (`apps/web`) — HTTPS automático |
| Backend + banco | **Railway** — `api.<domínio>` | NestJS (`apps/api`) + Postgres gerenciado — HTTPS automático |
| DNS | **Cloudflare** | Só DNS do domínio próprio (modo "DNS only", ver seção 3) |

## Arquitetura: cookie de domínio compartilhado (não proxy same-origin)

**Histórico da decisão (ver `docs/DECISIONS.md` para os detalhes completos):** a
primeira versão deste deploy usava um proxy same-origin — o Next.js repassando
(`rewrites()`) toda chamada `/api/*` para o backend no Railway, fazendo o navegador
enxergar front e API como a mesma origem. **Isso foi testado em produção e não
funciona**: a Vercel recusa fazer esse proxy para o range de IP do Railway,
retornando `DNS_HOSTNAME_RESOLVED_PRIVATE` (ela classifica esse range como
"privado", incorretamente) — confirmado que não é problema de configuração nossa
(testado com dois hostnames diferentes do Railway apontando para o mesmo IP, mesmo
erro nos dois). É uma limitação de infraestrutura entre os dois provedores.

**Arquitetura atual:** o navegador fala **diretamente** com os dois subdomínios —
`www.<domínio>` (frontend) e `api.<domínio>` (backend), duas origens de verdade. A
sessão funciona entre eles porque:

```
Navegador
   │
   ├──→ https://www.<domínio>/...           (Vercel — HTML/JS)
   │
   └──→ https://api.<domínio>/auth/login     (Railway — direto, sem proxy)
          Set-Cookie: access_token=...; Domain=.{domínio-raiz}; HttpOnly
                                             (válido para os DOIS subdomínios)
```

- O cookie de sessão sai com `Domain=.{domínio-raiz}` (com ponto na frente,
  variável `COOKIE_DOMAIN` no backend) — válido tanto para `www` quanto `api`,
  mesmo sendo hosts diferentes.
- Os dois subdomínios são **"same-site"** (mesmo domínio registrável) mesmo não
  sendo **"same-origin"** — por isso `SameSite=Lax` no cookie continua funcionando
  normalmente, sem precisar do `SameSite=None` (que exigiria cuidados extras).
- CORS (`CORS_ORIGIN` no backend, com `credentials: true`) volta a ser
  estritamente necessário — não é mais só uma camada extra de defesa.
- `apps/web/lib/api/client.ts` usa uma URL absoluta (`NEXT_PUBLIC_API_URL`), não
  mais um caminho relativo.
- `apps/web/next.config.ts` não tem `rewrites()`.
- `apps/api/src/auth/auth-cookies.ts` — o cookie do refresh token usa
  `path=/auth` (rota real do backend, já que não há mais proxy reescrevendo o path).

Testado localmente simulando exatamente esse cenário (requisição com header
`Origin` diferente, como o navegador realmente manda numa chamada cross-origin) —
CORS, cookies (`Path=/auth`, `HttpOnly`, `SameSite=Lax`) e a suíte completa de
testes continuam passando. Ver `docs/DECISIONS.md` para os detalhes da investigação.

## Ordem de execução

O domínio só é comprado depois — isso **não bloqueia nada** do trabalho técnico:

1. **Hoje:** deploy do backend no Railway → ele já dá uma URL própria com HTTPS
   automático (`algo.up.railway.app`).
2. **Hoje:** deploy do frontend na Vercel, com `NEXT_PUBLIC_API_URL` apontando para a
   URL do Railway do passo 1 → também recebe uma URL própria (`algo.vercel.app`).
3. **Hoje:** testar o fluxo completo (login, cookie, todas as telas) usando essas duas
   URLs temporárias.
4. **Quando o domínio for comprado:** criar os subdomínios `www.<domínio>` (Vercel) e
   `api.<domínio>` (Railway), apontar o DNS no Cloudflare, e trocar
   `NEXT_PUBLIC_API_URL`/`CORS_ORIGIN`/`COOKIE_DOMAIN` para os valores finais — só
   configuração nos painéis, nenhuma mudança de código.

## 1. Backend no Railway

### 1.1. Criar o projeto e o Postgres

No painel do Railway: **New Project → Deploy from GitHub repo** (aponte para este
repositório) e **+ New → Database → PostgreSQL** no mesmo projeto — o Railway cria a
variável `DATABASE_URL` automaticamente e a disponibiliza para os outros serviços do
projeto via referência (`${{Postgres.DATABASE_URL}}`).

**Atenção — o GitHub App do Railway precisa estar instalado na conta/organização
DONA do repositório**, não em outra conta sua. Se o domínio do Railway não conseguir
"ver" o branch (erro "GitHub Repo not found" nas Settings do serviço), vá em
`https://github.com/settings/installations` (ou `.../organizations/<org>/settings/installations`
para a conta certa), encontre "Railway", clique "Configure" e garanta acesso ao
repositório ali — sintoma real encontrado num deploy real.

### 1.2. Configurar o serviço da API para usar o Dockerfile

No serviço criado a partir do repo, em **Settings → Build**:

- **Root Directory:** deixe a raiz do repositório (não `apps/api`) — o build do
  Dockerfile precisa do monorepo inteiro como contexto (`apps/api` depende de
  `packages/types` e `packages/release-engine`).
- **Builder:** Dockerfile.
- **Dockerfile Path:** `apps/api/Dockerfile`.

O Dockerfile já cuida de tudo: instala o workspace com Node 22 (pnpm 11 exige
Node ≥22.13), instala `openssl` (o motor do Prisma precisa de libssl, ausente por
padrão em `node:22-slim`), gera o Prisma Client com `binaryTargets` explícito para
`debian-openssl-3.0.x`, builda `types` → `release-engine` → `api` nesta ordem (via
turbo), poda as dependências de desenvolvimento, e no `CMD` roda
`prisma migrate deploy` antes de subir a API — ou seja, **as migrations rodam
automaticamente a cada deploy**, sem passo manual. (Esses três detalhes — Node 22,
openssl, binaryTargets — só apareceram testando um deploy real; ver comentários no
próprio `Dockerfile` e `docs/DECISIONS.md` para o diagnóstico completo de cada um.)

### 1.3. Variáveis de ambiente do serviço API

| Variável | Valor | Observação |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referência automática ao Postgres do mesmo projeto Railway |
| `JWT_ACCESS_SECRET` | gerar um valor aleatório forte | **nunca** reaproveite o valor de `.env.example`/dev |
| `JWT_ACCESS_TTL` | `15m` | |
| `PORT` | não defina | o Railway injeta a própria porta automaticamente; `main.ts` já lê `process.env.PORT` |
| `CORS_ORIGIN` | `https://www.<seu-domínio>` (ou a URL `.vercel.app` enquanto o domínio não existe) | estritamente necessário agora — o navegador chama a API cross-origin de verdade |
| `COOKIE_SECURE` | `true` | HTTPS automático do Railway já cobre o requisito |
| `COOKIE_DOMAIN` | `.{seu-domínio-raiz}` (**com ponto na frente**, ex.: `.adeonline.com.br`) — deixe vazio enquanto só existir a URL temporária `.vercel.app`/`.up.railway.app` (que não compartilham domínio raiz) | isso é o que faz a sessão funcionar entre `www` e `api` — ver seção de arquitetura acima |
| `ADMIN_EMAIL` | e-mail real do primeiro administrador | só lido pelo `prisma:seed` (passo 1.4), não pela API em si |
| `ADMIN_PASSWORD` | *(deixe indefinido)* | sem definir, o seed gera uma senha temporária forte sozinho e a imprime uma vez nos logs — ver adendo "Deploy limpo" em `docs/DECISIONS.md` |
| `RESEND_API_KEY` | chave de API gerada no painel do Resend | ver seção 1.6 — convite de conta nova e "esqueci minha senha" (adendo "Confirmação de e-mail...") |
| `EMAIL_FROM` | `naoresponda@<seu-domínio>` (ou outro endereço do domínio verificado) | precisa ser um endereço do domínio verificado no Resend (seção 1.6), não precisa ser uma caixa real |

`.env.example` em `apps/api` documenta as mesmas variáveis com comentários — mantenha
os dois em sincronia se adicionar alguma nova.

### 1.4. Criar a conta de Administrador inicial (uma vez, manual)

O `CMD` do container roda as migrations automaticamente, mas **não** o seed — ele é
intencionalmente um passo manual único (rodar toda vez que o container reinicia seria
inofensivo, já que é idempotente, mas não há necessidade).

**Pelo Console do próprio Railway** (aba "Console" do serviço, um terminal dentro do
container rodando — mais simples que instalar CLI local):

```
pnpm run prisma:seed
```

Se pedir confirmação pra baixar o pnpm via corepack, digite `y`. A senha gerada
aparece uma única vez na saída do comando — anote-a, ela não é recuperável depois (só
o hash argon2 fica salvo). Troque-a assim que logar, em **Usuários → Editar (na
própria conta) → Nova senha** (ver `docs/DECISIONS.md`, adendo "Deploy limpo").

Alternativa via [Railway CLI](https://docs.railway.com/guides/cli) local (mesmo
efeito, sem precisar abrir o painel):
```
railway link
railway run --service=<nome-do-serviço-api> pnpm --filter @reanalise-erp/api prisma:seed
```

### 1.5. Domínio customizado da API (`api.<seu-domínio>`)

Em **Settings → Networking → Custom Domain**, digite `api.<seu-domínio>` e escolha a
porta (a mesma do domínio automático, geralmente `8080`). O Railway devolve **dois
registros DNS obrigatórios** — um `CNAME` e um `TXT` (verificação de propriedade; sem
o TXT, o CNAME sozinho ainda dá 404). Configure os dois no Cloudflare (seção 3).

### 1.6. E-mail transacional (Resend) — convite de conta e recuperação de senha

Adendo "Confirmação de e-mail e recuperação de senha" (09/09/2026): contas novas
criadas na tela Usuários nascem sem senha e recebem um e-mail de convite; existe
também um "esqueci minha senha" self-service. Os dois usam o
[Resend](https://resend.com) (free tier, 3000 e-mails/mês — suficiente para o volume
esperado), enviando do domínio próprio `<seu-domínio>` — **não** da caixa corporativa
Microsoft 365 (`conformidade@calia.com.br`), justamente para não depender de acesso
ao admin de e-mail daquela organização: o domínio novo já está sob nosso próprio
Cloudflare, então verificar um remetente nele é autocontido.

1. Crie uma conta em [resend.com](https://resend.com) (grátis).
2. **Domains → Add Domain** → digite `<seu-domínio>` (o domínio raiz, não um
   subdomínio) → Resend gera um conjunto de registros DNS de verificação
   (tipicamente: um ou mais `TXT` para SPF/verificação de propriedade, um `CNAME` ou
   `TXT` para DKIM, e opcionalmente um `MX`/`TXT` para DMARC) — **os valores exatos
   são gerados na hora pelo painel do Resend, não hardcode aqui**; copie-os
   diretamente da tela "Domains → \<seu-domínio\> → DNS Records".
3. Adicione esses registros no **mesmo Cloudflare** que já hospeda o DNS do sistema
   (seção 3 acima) — igual aos registros do Vercel/Railway, todos em modo **"DNS
   only"** (nuvem cinza), já que são registros de verificação/roteamento de e-mail,
   não tráfego HTTP a proxyar.
4. Volte ao painel do Resend e clique **Verify** — pode levar de minutos a algumas
   horas para propagar, igual qualquer DNS.
5. **API Keys → Create API Key** → copie o valor (só aparece uma vez) → configure
   como `RESEND_API_KEY` no Railway (tabela da seção 1.3).
6. Configure `EMAIL_FROM` no Railway com um endereço do domínio recém-verificado
   (ex.: `naoresponda@<seu-domínio>` ou `sistema@<seu-domínio>`) — não precisa ser uma
   caixa de e-mail real, ninguém precisa ler respostas enviadas para ele; é só o
   remetente que aparece nos e-mails de convite/recuperação de senha.

**Sem `RESEND_API_KEY`/`EMAIL_FROM` configurados** (ex.: antes deste passo, ou em dev
local), o `EmailService` não quebra nada — ele só **loga** o e-mail que enviaria
(destinatário, assunto, link) em vez de chamar a rede, então o resto do sistema
continua funcionando normalmente enquanto o Resend não estiver configurado; só o
envio de verdade fica pendente.

## 2. Frontend na Vercel

### 2.1. Criar o projeto

**Add New → Project → Add Existing** (não "Buy" — o domínio já é seu), importe este
repositório. Na tela de configuração, **antes de clicar em Deploy**:

- **Root Directory:** clique em "Edit" e mude para `apps/web` (a Vercel costuma
  detectar `apps/api` por engano num monorepo com os dois — confira com cuidado).
- O **Build Command** detectado automaticamente deve ser `turbo run build` (não
  `next build` isolado) — isso confirma que a Vercel reconheceu o monorepo Turborepo
  e vai enxergar `packages/types` sem configuração extra.
- Framework Preset: Next.js (deve mudar sozinho ao corrigir o Root Directory).

### 2.2. Variáveis de ambiente

Ao importar, a Vercel pode sugerir variáveis erradas (lidas de algum `.env.example`
do repo, incluindo os da API — `DATABASE_URL`, `JWT_ACCESS_SECRET` etc.). **Remova
todas essas** e deixe só:

| Variável | Valor | Observação |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | a URL do serviço no Railway (`https://algo.up.railway.app`, depois `https://api.<seu-domínio>`) | **é** `NEXT_PUBLIC_*` de propósito — o navegador chama essa URL diretamente |

### 2.3. Deploy

Ao terminar o deploy, a Vercel dá uma URL (`algo.vercel.app`). Teste o fluxo completo
nela antes de seguir para o domínio customizado.

### 2.4. Domínio customizado (`www.<seu-domínio>`)

Em **Settings → Domains**, adicione tanto `www.<seu-domínio>` quanto `<seu-domínio>`
(sem `www`) — a Vercel cria automaticamente um redirect 308 do domínio raiz para o
`www`. Cada um mostra um valor de DNS diferente (**"View DNS configuration"**):
tipicamente um `CNAME` para o `www` e um `A` para a raiz — a Vercel mostra o valor
exato na hora, não hardcode aqui.

## 3. DNS no Cloudflare

1. Se o domínio ainda não estiver no Cloudflare: **Add a domain**, plano **Free**,
   deixe o Cloudflare escanear os registros existentes (preserva MX/TXT de e-mail).
2. Adicione os registros que a Vercel e o Railway pediram (seções 1.5 e 2.4) — pelo
   menos: `A @` (raiz, Vercel), `CNAME www` (Vercel), `CNAME api` (Railway),
   `TXT _railway-verify.api` (verificação Railway).
3. **Todos em modo "DNS only" (nuvem cinza, não laranja/"Proxied")**, inclusive o da
   API — confirmado na documentação oficial da Vercel (KB "Should I use Cloudflare in
   front of Vercel?", consultada em 09/09/2026): a Vercel recomenda explicitamente
   **não** usar um proxy reverso na frente da plataforma (reduz visibilidade do
   Firewall/bot-protection próprios, e o modo proxy é causa documentada de erros de
   SSL/timeout). **Isso é uma recomendação, verifique a documentação na hora de
   configurar de verdade — ela pode mudar.**
   Fonte: https://vercel.com/kb/guide/cloudflare-with-vercel
4. **"Continue to activation"** não precisa esperar todos os registros prontos — dá
   pra editar DNS a qualquer momento depois, inclusive após a ativação.
5. Troque os nameservers no registrador do domínio (ex.: Registro.br → "DNS" →
   "Alterar servidores DNS") para os dois que o Cloudflare der. Propagação: minutos a
   poucas horas (na prática, observado ativar em poucos minutos).

## 4. Depois que o domínio propagar

1. Confirme que `api.<seu-domínio>` responde (`/docs` deve abrir) — certificado da
   API emitido pelo Railway automaticamente.
2. Atualize no Railway: `COOKIE_DOMAIN=".{seu-domínio-raiz}"`,
   `CORS_ORIGIN="https://www.{seu-domínio}"`.
3. Atualize na Vercel: `NEXT_PUBLIC_API_URL="https://api.{seu-domínio}"`, e force um
   **Redeploy** (mudar uma env var não redeploya sozinho).
4. Teste o fluxo completo (login, `/auth/me`, refresh, logout, uma rota mutante)
   direto no domínio final antes de liberar para a equipe.

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
`COOKIE_SECURE=true`, `COOKIE_DOMAIN` (`.{domínio-raiz}` em produção, vazio se só
existir a URL temporária do Railway), `ADMIN_EMAIL` (só para o seed manual),
`RESEND_API_KEY`, `EMAIL_FROM` (seção 1.6 — convite/recuperação de senha por e-mail).

**Vercel (web):** `NEXT_PUBLIC_API_URL`.

**Dev local:** ver `apps/api/.env.example` e `apps/web/.env.local.example` — sem
proxy, `apps/web` chama `http://localhost:4001` diretamente (URL absoluta), e o
CORS/cookie local (`COOKIE_DOMAIN` vazio, cookie host-only) já cobre esse cenário
cross-porta desde o adendo "Segurança de sessão" original.
