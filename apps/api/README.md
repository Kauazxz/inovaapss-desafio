# @inovaapss/api

API Express + TypeScript (ESM) do motor de saúde, risco e prioridade de clientes.
Regras de negócio na [SPEC.md](../../docs/SPEC.md); "onde fica o quê" na
[ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Como rodar

Na raiz do repositório (uma vez): `pnpm install`, copie `.env.example` para `.env` e rode `pnpm build`
(compila `packages/shared` e `packages/validation`, de que a API depende — o `pnpm dev` da raiz faz
isso sozinho; o `--filter` abaixo não).

```bash
pnpm --filter @inovaapss/api dev        # tsx watch, porta 3001
pnpm --filter @inovaapss/api test       # Vitest + Supertest
pnpm --filter @inovaapss/api build      # tsc -> dist/
pnpm --filter @inovaapss/api start      # node dist/server.js
```

`pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` na raiz rodam aqui também (Turbo).

## Variáveis de ambiente

Lidas do `.env` da raiz (ou do ambiente, que tem prioridade). Validadas com Zod em
`src/config/env.ts` a partir do `serverEnvSchema` de `@inovaapss/validation`.

| Variável                                                      | Padrão                  | Observação                                                                 |
| ------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `NODE_ENV`                                                    | `development`           | `development` · `test` · `production`                                      |
| `PORT`                                                        | `3001`                  |                                                                            |
| `CORS_ORIGINS`                                                | `http://localhost:5173` | lista separada por vírgula                                                 |
| `DATABASE_URL`                                                | —                       | opcional nesta etapa; sem ela o `/ready` responde `db: not_configured`     |
| `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `..._SERVICE_ROLE_KEY` | —                       | validação do JWT e Admin API; sem elas as rotas autenticadas respondem 503 |
| `SEED_DEMO_EMAIL` · `SEED_DEMO_PASSWORD`                      | —                       | só no shell, para `pnpm --filter @inovaapss/api seed:demo`                 |
| `LOG_LEVEL`                                                   | por ambiente            | `debug` em dev, `silent` em test, `info` em produção                       |
| `RATE_LIMIT_WINDOW_MS` · `RATE_LIMIT_MAX`                     | `900000` · `300`        | por IP; `/health` e `/ready` ficam fora                                    |
| `DB_READY_TIMEOUT_MS`                                         | `2000`                  | tempo máximo do `select 1` no `/ready`                                     |

Nunca commite valores reais: o `.env` está no `.gitignore`.

## Rotas

| Rota                       | Resposta                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /health`              | `{ status: 'ok', version, uptime }`                                                                     |
| `GET /ready`               | `{ status: 'ready', db: 'ok' \| 'not_configured' }` ou `503 { status: 'not_ready', db: 'error' }`       |
| `GET /api/v1`              | índice das rotas de negócio                                                                             |
| `GET /api/v1/me`           | sessão: usuário, organização atual e papel (Bearer JWT do Supabase) — ver [AUTH.md](../../docs/AUTH.md) |
| `/api/v1/organizations...` | onboarding, organização atual e usuários (§37) — [AUTH.md](../../docs/AUTH.md)                          |
| `GET /api/docs.json`       | documento OpenAPI 3.1 (`src/openapi.ts`)                                                                |
| `GET /api/docs`            | Swagger UI — só fora de produção                                                                        |

Erros sempre em JSON: `{ error: { code, message, requestId } }`. Toda resposta traz `x-request-id`.

## Banco e migrations (ajuste A8)

O schema Drizzle fica em `src/db/schema/<modulo>.ts` (um arquivo por módulo, reexportado em
`index.ts`). As migrations são geradas direto em `supabase/migrations/` no formato da CLI do
Supabase, e o workflow `deploy-supabase.yml` aplica no push para a `main`:

```bash
pnpm --filter @inovaapss/api db:generate   # drizzle-kit generate
pnpm --filter @inovaapss/api db:check      # drizzle-kit check
```

## Autenticação e multiempresa (Etapa 1)

O JWT do Supabase Auth chega em `Authorization: Bearer` e passa por `requireAuth` → `resolveTenant`
→ `requireRole` (`src/middleware/`). Os módulos `auth` (GET /me) e `organizations` (onboarding,
organização atual, usuários) estão em `src/modules/`. Fluxo completo, papéis, RLS e como criar o
primeiro usuário: [docs/AUTH.md](../../docs/AUTH.md). Seed de demonstração:
`SEED_DEMO_EMAIL=... SEED_DEMO_PASSWORD=... pnpm --filter @inovaapss/api seed:demo`.

## Docker

Build a partir da **raiz** do monorepo: `docker build -f apps/api/Dockerfile -t inovaapss-api .`
Imagem final: `node:22-alpine`, usuário `node`, só `dist/` e dependências de produção (campo `files`
do `package.json` + `.dockerignore` da raiz), porta 3001 — o `HEALTHCHECK` segue a `PORT` que a
plataforma injetar.

## Estrutura

```text
src/
├─ app.ts               ← monta o Express (sem listen)
├─ server.ts            ← listen(PORT) e desligamento gracioso
├─ openapi.ts           ← documento OpenAPI tipado
├─ config/              ← env.ts (Zod), version.ts
├─ middleware/          ← request-id, error-handler, not-found, auth, tenant, rbac
├─ infrastructure/      ← logger (pino), db (Drizzle + postgres.js, lazy), supabase (admin/anon)
├─ db/schema/           ← um arquivo por módulo + index.ts; db/seed/ ← seed de demonstração
├─ routes/              ← health, api-v1 (base), docs
├─ modules/             ← um por domínio (ver modules/README.md)
├─ shared/              ← erros e utilitários comuns
└─ __tests__/           ← testes de integração do app
```
