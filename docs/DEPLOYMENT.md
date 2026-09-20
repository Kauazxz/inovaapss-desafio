# Deploy

O que já sobe sozinho, o que falta e **quem faz** (spoiler: conectar Vercel e Render/Railway exige
login humano — é a tarefa perfeita para uma pessoa enquanto os agentes codam; ver Trilha C em
[ETAPAS.md](ETAPAS.md)).

---

## 1. O que já existe e funciona

**Banco de dados (Supabase).** Todo push na `main` que mexer em `supabase/` dispara o workflow
`.github/workflows/deploy-supabase.yml`, que roda `supabase db push` (e `functions deploy` se houver
Edge Functions). Configuração e problemas comuns em [SUPABASE.md](SUPABASE.md).

```text
mexeu no schema → pnpm --filter @inovaapss/api db:generate → Ctrl+Shift+B → aba Actions verde → banco atualizado
```

Nada disso precisa ser refeito.

## 2. O que falta

| Parte                                                  | Ferramenta                                                  | Quem faz             | Quando                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| CI (lint, typecheck, test, build, migrations × schema) | GitHub Actions `ci.yml`                                     | **pronto** (Etapa 0) | —                                                                            |
| Web em produção com preview por push                   | **Vercel**                                                  | **pronto**           | https://inovaapss-desafio.vercel.app — todo push na `main` publica (seção 3) |
| API em produção                                        | **Render** ou **Railway**, com o `Dockerfile` de `apps/api` | **pessoa**           | agora — a API da Etapa 1 (auth + organizações) já existe (seção 4)           |
| `VITE_API_URL` na Vercel apontando para a API          | painel da Vercel                                            | **pessoa**           | logo depois da API subir (seção 4, passo 7)                                  |
| Variáveis de ambiente da API                           | painel do Render/Railway                                    | **pessoa**           | junto com o passo acima                                                      |
| Seed de demonstração, README final                     | —                                                           | trilha 14            | fim                                                                          |

**Estado atual em produção:** o web na Vercel já tem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
do projeto real, então o **login funciona**; mas `VITE_API_URL` ainda é o padrão
(`http://localhost:3001`), porque a API não foi publicada. Resultado: depois do login, o
`GET /api/v1/me` falha e a tela mostra "Não foi possível carregar sua organização". Isso se resolve
com a seção 4 (subir a API) + editar `VITE_API_URL` na Vercel e fazer Redeploy.

---

## 3. Passo a passo — Vercel (frontend)

Você precisa: conta no GitHub com acesso ao repositório `Kauazxz/inovaapss-desafio`.

1. Abra https://vercel.com e clique em **Sign Up** → **Continue with GitHub**. Autorize.
2. No painel, clique em **Add New…** → **Project**.
3. Em "Import Git Repository", ache `Kauazxz/inovaapss-desafio` e clique em **Import**.
   Se o repositório não aparecer, clique em **Adjust GitHub App Permissions** e libere o acesso a
   ele.
4. Na tela "Configure Project":
   - **Root Directory**: clique em **Edit** e escolha **`apps/web`**.
   - **Framework Preset**: deve detectar **Vite** sozinho. Se não, escolha Vite.
   - **Build Command**, **Install Command** e **Output Directory**: **não altere no painel** — vêm
     do `apps/web/vercel.json` versionado (`pnpm install --frozen-lockfile`,
     `pnpm --filter @inovaapss/web... build`, `dist`), que constrói os pacotes internos antes do
     web. O arquivo vence o que estiver no painel.
   - Abra **Environment Variables** e adicione as três da seção 5 (web).
5. Clique em **Deploy**. O primeiro build leva 1–3 minutos.
6. Deu verde? A URL aparece na tela (algo como `inovaapss-desafio.vercel.app`). Anote — ela entra
   em `CORS_ORIGINS` da API (aceita várias origens separadas por vírgula, ex.: produção + preview).
7. Confira em **Settings → Git** que **Production Branch** é `main`. A partir daqui:
   - push na `main` → produção atualiza sozinha;
   - qualquer outra branch ou PR → **Preview Deployment** com URL própria (é o "preview deploy"
     dos critérios de aceite §56).

> Se o build reclamar que não achou pacotes do workspace (`@inovaapss/shared` etc.), vá em
> **Settings → General → Root Directory** e confirme que **"Include source files outside of the Root
> Directory in the Build Step"** está ligado. Ele vem ligado por padrão em projetos novos.

---

## 4. Passo a passo — API (Render, com Railway como alternativa)

Escolha **um** dos dois. Os dois fazem deploy automático a partir do GitHub usando o `Dockerfile`,
com a **raiz do repositório** como contexto de build (o equivalente local é
`docker build -f apps/api/Dockerfile .`). O `.dockerignore` da raiz deixa `.env`, `node_modules`
e builds locais fora da imagem, que leva só `dist/` e as dependências de produção da API.
O Render tem plano gratuito simples de configurar (o serviço "dorme" depois de 15 min sem uso e leva
~30 s para acordar — para o hackathon, basta abrir a URL da API um minuto antes da demo). O Railway
não dorme, mas usa crédito de teste.

### 4a. Render

1. Abra https://render.com → **Get Started** → **GitHub**. Autorize.
2. No painel, **New +** → **Web Service**.
3. Em "Source Code", conecte o GitHub (se pedir) e escolha `Kauazxz/inovaapss-desafio` → **Connect**.
4. Preencha:
   - **Name**: `inovaapss-api`
   - **Region**: a mais próxima (Ohio ou Oregon; São Paulo se aparecer)
   - **Branch**: `main`
   - **Language / Runtime**: **Docker**
   - **Dockerfile Path**: `apps/api/Dockerfile`
   - **Docker Build Context Directory**: `.` (a raiz — o Dockerfile precisa enxergar `packages/`)
   - **Instance Type**: Free
5. Abra **Advanced** → **Environment Variables** e adicione as da seção 5 (API). Em `PORT` coloque
   `10000` (o Render espera essa porta por padrão) — a API lê `PORT` do ambiente.
6. **Create Web Service**. Acompanhe o log; quando aparecer "Live", copie a URL
   (`https://inovaapss-api.onrender.com`).
7. Volte na Vercel → **Settings → Environment Variables** → edite `VITE_API_URL` com essa URL →
   **Redeploy** (aba Deployments → ⋯ → Redeploy).
8. Em **Settings → Health Check Path** do Render, coloque `/health`.

### 4b. Railway (alternativa)

1. https://railway.app → **Login with GitHub**.
2. **New Project** → **Deploy from GitHub repo** → escolha `Kauazxz/inovaapss-desafio`.
3. Clique no serviço criado → **Settings**:
   - **Root Directory**: deixe **vazio** (raiz) — o build precisa de `packages/`.
   - Em **Build**, o Railway acha Dockerfiles só na raiz. Como o nosso está em `apps/api`, vá em
     **Variables** e crie `RAILWAY_DOCKERFILE_PATH` = `apps/api/Dockerfile`.
   - **Networking** → **Generate Domain** para ter uma URL pública.
4. Em **Variables**, adicione as da seção 5 (API). O Railway injeta `PORT` sozinho; a API lê do
   ambiente.
5. Faça um push (ou **Deploy** manual) e copie a URL. Atualize `VITE_API_URL` na Vercel e faça
   Redeploy.

---

## 5. Variáveis de ambiente (sem valores — os valores ficam só nos painéis)

Todas vêm da [§52 da spec](SPEC.md#52-variáveis-de-ambiente). **Nunca** cole valores reais em
arquivo do repositório, chat ou commit. O `.env.example` da raiz lista os nomes com placeholders.

### API (Render ou Railway)

| Variável                    | Onde pegar                                                                                                               | Obrigatória? |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `NODE_ENV`                  | `production`                                                                                                             | sim          |
| `PORT`                      | Render: `10000` · Railway: injeta sozinho                                                                                | sim          |
| `SUPABASE_URL`              | Supabase → Project Settings → API → Project URL                                                                          | sim          |
| `SUPABASE_ANON_KEY`         | Supabase → Project Settings → API → `anon` `public`                                                                      | sim          |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (**só aqui, nunca no web**)                                           | sim          |
| `DATABASE_URL`              | Supabase → Project Settings → Database → Connection string (URI, via pooler)                                             | sim          |
| `CORS_ORIGINS`              | URL do web na Vercel; várias separadas por vírgula (produção + preview). Sem ela a API só libera `http://localhost:5173` | sim          |
| `ANTHROPIC_API_KEY`         | só quando o provider de extração por IA entrar (ajuste A5 — depois)                                                      | não          |
| `SENTRY_DSN`                | só se ligar o Sentry                                                                                                     | não          |

### Web (Vercel)

| Variável                 | Onde pegar                      | Obrigatória? |
| ------------------------ | ------------------------------- | ------------ |
| `VITE_SUPABASE_URL`      | o mesmo Project URL do Supabase | sim          |
| `VITE_SUPABASE_ANON_KEY` | a mesma chave `anon` `public`   | sim          |
| `VITE_API_URL`           | a URL pública da API (seção 4)  | sim          |

### GitHub (Actions)

Já configuradas para o deploy do banco: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`,
`SUPABASE_DB_PASSWORD` ([SUPABASE.md](SUPABASE.md)). O `ci.yml` não precisa de segredo.

---

## 6. Pipeline alvo (§50)

```text
push / pull_request
   │
   ▼  GitHub Actions — ci.yml
 pnpm install --frozen-lockfile
 → pnpm lint
 → pnpm typecheck
 → pnpm test
 → pnpm build
 → migration check  (pnpm --filter @inovaapss/api db:check + node scripts/verificar-migrations.js)
   │
   ├─ push na main que mexe em supabase/  ──► deploy-supabase.yml ──► supabase db push   (já existe)
   ├─ Render/Railway (integração nativa) ──► build do Dockerfile ──► API no ar
   └─ Vercel (integração nativa)         ──► pnpm build em apps/web ──► web no ar (preview em branch/PR, produção na main)
```

Regras: sem migration destrutiva automática (leia o SQL antes do `Ctrl+Shift+B`); deploy da API e do
web só depois do CI verde (na Vercel e no Render dá para ligar "wait for CI" nas configurações do
projeto — opcional para o hackathon).

## 7. Como saber que está tudo no ar

| Onde                          | O que ver                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------- |
| GitHub → Actions              | `ci.yml` e `Deploy no Supabase` verdes                                       |
| Vercel → Deployments          | último deploy "Ready"                                                        |
| `https://<api>/health`        | responde `{"status":"ok"}`                                                   |
| `https://<api>/api/docs.json` | documento OpenAPI (o Swagger UI em `/api/docs` só responde fora de produção) |
| `https://<web>/login`         | tela de login abre e consegue autenticar                                     |
