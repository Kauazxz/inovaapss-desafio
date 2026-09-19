# Arquitetura

Visão inicial da arquitetura. O que ainda não existe no repositório está marcado como **previsto** —
este documento é atualizado a cada etapa que fecha ([ETAPAS.md](ETAPAS.md)). A fonte de verdade das
regras de negócio é a [SPEC.md](SPEC.md); aqui está só o "onde fica o quê e como conversa".

---

## 1. Monorepo

Gerenciador: **pnpm** (ajuste A9) com workspaces. Orquestração: **Turborepo**.

```text
/
├─ apps/
│  ├─ api/        @inovaapss/api  — Express + Drizzle + Zod + Pino (previsto: esqueleto na Etapa 0)
│  └─ web/        @inovaapss/web  — React + Vite + Tailwind + shadcn/ui + Recharts (previsto: esqueleto na Etapa 0)
├─ packages/
│  ├─ config/     @inovaapss/config     — tsconfig, eslint e prettier compartilhados
│  ├─ shared/     @inovaapss/shared     — tipos, enums e constantes de domínio (HealthClass, MetricType, direções...)
│  ├─ validation/ @inovaapss/validation — schemas Zod compartilhados entre api e web
│  └─ engine/     @inovaapss/engine     — previsto (Etapas 4/5/12): lógica PURA de scoring, SLA, forecast e backtest — sem banco, sem HTTP
├─ supabase/
│  ├─ config.toml            — já existe
│  ├─ migrations/            — SQL versionado, gerado pelo Drizzle (ajuste A8)
│  └─ functions/             — Edge Functions (opcional)
├─ docs/                     — esta pasta
├─ .husky/                   — pre-commit (lint-staged) e commit-msg
├─ .github/workflows/
│  ├─ deploy-supabase.yml    — já existe: aplica migrations a cada push na main
│  └─ ci.yml                 — criado na Etapa 0: lint → typecheck → test → build + nome das migrations
├─ scripts/
│  ├─ configurar-supabase.js — já existia
│  ├─ verificar-commit.js    — hook commit-msg (Conventional Commits em inglês, sem trailers)
│  └─ verificar-migrations.js — confere o nome dos .sql em supabase/migrations (usado no CI)
├─ sync.js                   — já existe: commita, puxa e envia (Ctrl+Shift+B)
├─ pnpm-workspace.yaml · turbo.json · package.json (raiz)
└─ .env.example
```

Por que `packages/engine` separado: a spec exige que as regras de score sejam **puras e testáveis**
(§3). Colocando-as num pacote sem dependência de banco ou Express, a Etapa 4 e a 5 podem começar
logo depois da Etapa 0, em paralelo com auth, e o mesmo código roda no backtest (Etapa 12) e, se um
dia precisar, no frontend para simulação.

## 2. Scripts e portas (contrato)

| Onde       | Script                                                                                             | O que faz                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| raiz       | `pnpm dev`                                                                                         | sobe api e web ao mesmo tempo (turbo)                                                                               |
| raiz       | `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test`                                        | roda em todos os pacotes, com cache do turbo                                                                        |
| raiz       | `pnpm format` · `pnpm format:check`                                                                | Prettier                                                                                                            |
| raiz       | `pnpm sync` · `pnpm status` · `pnpm configurar-supabase` · `pnpm deploy` · `pnpm deploy:functions` | já existiam (eram `npm run ...`)                                                                                    |
| `apps/api` | `dev` · `build` · `start` · `lint` · `typecheck` · `test`                                          | o de sempre                                                                                                         |
| `apps/api` | `db:generate`                                                                                      | `drizzle-kit generate` → grava o `.sql` em `../../supabase/migrations` com prefixo compatível com a CLI do Supabase |
| `apps/api` | `db:check`                                                                                         | `drizzle-kit check` — confere se as migrations batem com o schema                                                   |
| `apps/web` | `dev` · `build` · `preview` · `lint` · `typecheck` · `test`                                        | o de sempre                                                                                                         |

Portas em desenvolvimento: **API 3001** (env `PORT`) · **web 5173** (Vite). O web fala com a API por
`VITE_API_URL` (padrão `http://localhost:3001`). Para rodar um pacote só: `pnpm --filter @inovaapss/api dev`.

## 3. Fluxo de dados (§4 da spec)

```text
ORGANIZATION ──► ORGANIZATION USERS ──► PORTFOLIO CLIENTS ──► CONTRACTS / PLANS
                                                                     │
                                                                     ▼
                                                            METRIC DEFINITIONS
                                                            (por organização, versionadas
                                                             em METRIC MODEL VERSIONS)
                                                                     │
                                                                     ▼
                       importação / manual / API ──────────►  METRIC VALUES  (por cliente e período)
                                                                     │
                                                                     ▼   packages/engine (puro)
                                                    ┌───────────────────────────────────────┐
                                                    │ current + trend + persistence         │
                                                    │   → metric_health (por métrica)       │
                                                    │   → overall_health, confidence        │
                                                    │   → risk = 100 − health               │
                                                    │   → priority = risk×0,7 + impacto×0,3 │
                                                    └────────────────┬──────────────────────┘
                                                                     ▼
                                              METRIC SCORE SNAPSHOTS + CLIENT SCORE SNAPSHOTS
                                              (guardam a versão do modelo usada — §31)
                                                                     │
                                                                     ▼
                                              alerts · recommendations · dashboard · forecast
```

Toda tabela de negócio tem `organization_id` (tenant). O middleware de tenant (Etapa 1) resolve a
organização a partir do JWT do Supabase Auth e injeta no request; repositórios sempre filtram por
ela; RLS no Postgres é a segunda barreira.

O dashboard **lê snapshots**, nunca recalcula na hora (§62). Recalcula quando chega dado novo,
quando a configuração muda, a pedido do usuário ou por job.

## 4. MVC modular na API (§3)

Cada módulo em `apps/api/src/modules/<modulo>/`:

```text
modulo/
├─ routes.ts       ← registra rotas Express e liga ao controller
├─ controller.ts   ← recebe request, valida com Zod (schema.ts), chama o service, responde. SEM regra de negócio
├─ service.ts      ← casos de uso; chama repository e o engine
├─ repository.ts   ← só persistência (Drizzle)
├─ schema.ts       ← schemas Zod das entradas/saídas (reaproveita @inovaapss/validation)
├─ types.ts        ← tipos locais do módulo
└─ __tests__/      ← Vitest + Supertest
```

Módulos previstos (§3 + ajustes): `auth`, `organizations`, `portfolio-clients`, `contracts`,
`metrics`, `scoring`, `sla`, `imports`, `documents`, `alerts`, `recommendations`, `calibration`,
`dashboard`, `client-health`. Cada módulo tem **um** arquivo de schema Drizzle em
`apps/api/src/db/schema/<modulo>.ts`, reexportado em `db/schema/index.ts` — assim duas etapas nunca
editam o mesmo arquivo de schema (convenção completa em [ETAPAS.md](ETAPAS.md)).

Transversais:

```text
apps/api/src/
├─ app.ts               ← monta o Express (helmet, cors, rate limit, pino-http, rotas /api/v1, /health, /ready, /api/docs)
├─ server.ts            ← listen(PORT)
├─ middleware/          ← auth (JWT do Supabase), tenant, rbac, error-handler, request-id
├─ infrastructure/      ← supabase (client com service_role), db (Drizzle), storage, logger, extraction (MetricExtractionProvider)
├─ db/schema/           ← um arquivo por módulo + index.ts
├─ db/seed/             ← GlobalSys v1 e organização demo
└─ shared/              ← utilitários e erros comuns
```

Regras que não mudam: fórmulas configuráveis nunca passam por `eval` (JSON Logic ou DSL restrita);
`SUPABASE_SERVICE_ROLE_KEY` só existe na API; validação de entrada sempre com Zod; logs sem segredos.

## 5. Frontend por features

```text
apps/web/src/
├─ components/     ← shadcn/ui e componentes genéricos (charts/ com os wrappers do Recharts)
├─ features/       ← auth, dashboard, clients, client-detail, metrics, metric-models, import, documents, alerts, calibration, settings
├─ pages/          ← uma página por rota, fina: só compõe features
├─ routes/         ← React Router (públicas: /login, /forgot-password; privadas com layout)
├─ hooks/          ← hooks genéricos
├─ lib/            ← supabase.ts, api.ts (fetch + TanStack Query), chart-theme.ts (tokens do DATAVIZ.md), mock/
└─ types/
```

Estado de servidor com TanStack Query; formulários com React Hook Form + Zod (schemas de
`@inovaapss/validation`, os mesmos da API). Gráficos seguem o [DATAVIZ.md](DATAVIZ.md).

## 6. Banco e migrations (ajuste A8)

- O schema é escrito em **Drizzle** (`apps/api/src/db/schema/*.ts`).
- `pnpm --filter @inovaapss/api db:generate` roda o `drizzle-kit generate` com
  `out = "../../supabase/migrations"` e `migrations.prefix = "supabase"`, que produz arquivos
  `YYYYMMDDHHMMSS_nome.sql` — exatamente o formato que a CLI do Supabase entende.
- O **deploy já existe**: o workflow `deploy-supabase.yml` roda `supabase db push` a cada push na
  `main` que toque em `supabase/`. Ou seja, gerar a migration e apertar `Ctrl+Shift+B` é o deploy.
- Migrations commitadas não são editadas: precisa mudar, gera outra.
- O CI já confere o **nome** de cada migration (`scripts/verificar-migrations.js`: `YYYYMMDDHHMMSS_nome.sql`).
  O `db:check` (drizzle-kit check), que confere o **conteúdo** contra o schema, entra no CI quando a
  API existir (previsto) — juntos são o "migration check" do pipeline §50.
- SQL manual (RLS, policies, funções) continua possível com `npx supabase migration new nome` —
  ver [SUPABASE.md](SUPABASE.md).

## 7. Segurança e observabilidade (resumo)

- Supabase Auth emite o JWT; a API valida, resolve tenant e papel (`owner` / `admin` / `analyst` / `viewer`).
- RLS em todas as tabelas de negócio; `service_role` só no backend.
- Helmet, CORS restrito à origem do web, rate limiting, MIME allowlist (XLSX, CSV, JSON, PDF, DOCX,
  MD/TXT — ajuste A4) e limite de upload.
- Pino com request id; `/health` e `/ready`; audit log em peso, threshold, modelo e SLA.

## 8. Deploy (resumo — detalhes em DEPLOYMENT.md)

| Parte                  | Onde                                         | Estado                                                                     |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| Banco / Auth / Storage | Supabase                                     | **funcionando** — migrations aplicadas pelo GitHub Actions                 |
| Web                    | Vercel (root `apps/web`)                     | **previsto** — precisa de uma pessoa conectar o repo                       |
| API                    | Railway ou Render (Dockerfile em `apps/api`) | **previsto** — idem                                                        |
| CI                     | GitHub Actions `ci.yml`                      | **criado na Etapa 0** — lint, typecheck, test, build e nome das migrations |

Pipeline alvo (§50): lint → typecheck → tests → build → migration check → deploy API → deploy web.
