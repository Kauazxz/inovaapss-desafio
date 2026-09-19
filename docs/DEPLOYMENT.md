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

| Parte                                                      | Ferramenta                                                  | Quem faz                                                              | Quando                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| CI (lint, typecheck, test, build, nome das migrations)     | GitHub Actions `ci.yml`                                     | agente (Etapa 0) — **já criado**, entra no ar com o commit da Etapa 0 | agora                                          |
| Web em produção com preview por push                       | **Vercel**                                                  | **pessoa**                                                            | agora (seção 3)                                |
| API em produção                                            | **Render** ou **Railway**, com o `Dockerfile` de `apps/api` | **pessoa**                                                            | assim que o esqueleto da API existir (seção 4) |
| Variáveis de ambiente em cada serviço                      | painel de cada um                                           | **pessoa**                                                            | junto com os passos acima                      |
| Seed de demonstração, OpenAPI em `/api/docs`, README final | —                                                           | agente (Etapa 14)                                                     | fim                                            |

Enquanto a API não estiver no ar, o web na Vercel pode apontar `VITE_API_URL` para uma URL
temporária; nada quebra no build.

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
   - **Build Command**: `pnpm build`
   - **Output Directory**: `dist`
   - **Install Command**: deixe o padrão — a Vercel detecta o `pnpm-lock.yaml` da raiz e usa pnpm.
   - Abra **Environment Variables** e adicione as três da seção 5 (web).
5. Clique em **Deploy**. O primeiro build leva 1–3 minutos.
6. Deu verde? A URL aparece na tela (algo como `inovaapss-desafio.vercel.app`). Anote — ela vira o
   `CORS_ORIGIN` da API.
7. Confira em **Settings → Git** que **Production Branch** é `main`. A partir daqui:
   - push na `main` → produção atualiza sozinha;
   - qualquer outra branch ou PR → **Preview Deployment** com URL própria (é o "preview deploy"
     dos critérios de aceite §56).

> Se o build reclamar que não achou pacotes do workspace (`@inovaapss/shared` etc.), vá em
> **Settings → General → Root Directory** e confirme que **"Include source files outside of the Root
> Directory in the Build Step"** está ligado. Ele vem ligado por padrão em projetos novos.

---

## 4. Passo a passo — API (Render, com Railway como alternativa)

Escolha **um** dos dois. Os dois fazem deploy automático a partir do GitHub usando o `Dockerfile`.
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

| Variável                    | Onde pegar                                                                     | Obrigatória? |
| --------------------------- | ------------------------------------------------------------------------------ | ------------ |
| `NODE_ENV`                  | `production`                                                                   | sim          |
| `PORT`                      | Render: `10000` · Railway: injeta sozinho                                      | sim          |
| `SUPABASE_URL`              | Supabase → Project Settings → API → Project URL                                | sim          |
| `SUPABASE_ANON_KEY`         | Supabase → Project Settings → API → `anon` `public`                            | sim          |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (**só aqui, nunca no web**) | sim          |
| `DATABASE_URL`              | Supabase → Project Settings → Database → Connection string (URI, via pooler)   | sim          |
| `CORS_ORIGIN`               | a URL do web na Vercel (previsto: a API usa para liberar o CORS)               | sim          |
| `ANTHROPIC_API_KEY`         | só quando o provider de extração por IA entrar (ajuste A5 — depois)            | não          |
| `SENTRY_DSN`                | só se ligar o Sentry                                                           | não          |

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
 → migration check  (node scripts/verificar-migrations.js hoje; pnpm --filter @inovaapss/api db:check quando a API existir)
   │
   ├─ push na main que mexe em supabase/  ──► deploy-supabase.yml ──► supabase db push   (já existe)
   ├─ Render/Railway (integração nativa) ──► build do Dockerfile ──► API no ar
   └─ Vercel (integração nativa)         ──► pnpm build em apps/web ──► web no ar (preview em branch/PR, produção na main)
```

Regras: sem migration destrutiva automática (leia o SQL antes do `Ctrl+Shift+B`); deploy da API e do
web só depois do CI verde (na Vercel e no Render dá para ligar "wait for CI" nas configurações do
projeto — opcional para o hackathon).

## 7. Como saber que está tudo no ar

| Onde                     | O que ver                                |
| ------------------------ | ---------------------------------------- |
| GitHub → Actions         | `ci.yml` e `Deploy no Supabase` verdes   |
| Vercel → Deployments     | último deploy "Ready"                    |
| `https://<api>/health`   | responde `{"status":"ok"}`               |
| `https://<api>/api/docs` | Swagger da API (previsto — Etapa 14)     |
| `https://<web>/login`    | tela de login abre e consegue autenticar |
