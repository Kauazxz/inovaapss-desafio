# Quadro de etapas

Este é o painel de controle do projeto. Duas pessoas e vários agentes trabalham ao mesmo tempo;
este arquivo diz **quem está em qual etapa, o que cada etapa possui e o que pode rodar em paralelo**
sem um pisar no outro. A descrição de cada etapa está na [SPEC.md, §53](SPEC.md#53-etapas-de-implementação).

> Regra de ouro: **quem está numa etapa não edita arquivos de outra etapa em andamento.** Precisa de
> algo que pertence a outra etapa? Pede no chat para quem está nela.

---

## Legenda de status

| Símbolo | Significado                              |
| ------- | ---------------------------------------- |
| ⬜      | a fazer                                  |
| 🔄      | em andamento                             |
| ✅      | concluída (com o commit citado)          |
| ⛔      | bloqueada (diz por quê na coluna Status) |

Prioridade vem da [§54 da spec](SPEC.md#54-prioridade-para-hackathon): **P0** = sem isso não tem demo ·
**P1** = importante · **P2** = só depois que tudo P0/P1 estiver de pé.

---

## As 15 etapas

| Etapa | Nome                                                                                                                                                          | Prioridade                 | Status                                         | Responsável                      | Depende de                                                              | Caminhos que a etapa POSSUI                                                                                                                                                                                                                                                                                                                               | Pode rodar em paralelo com                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 0     | Auditoria e fundação (monorepo, pnpm, Turbo, lint, Prettier, Husky, CI inicial, env example)                                                                  | P0                         | ✅ concluída — `b237872` + revisão da fundação | agentes: tooling, api, web, docs | —                                                                       | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.husky/`, `.github/workflows/ci.yml`, `.env.example`, `packages/config/`, `packages/shared/` (esqueleto), `packages/validation/` (esqueleto), `apps/api/` e `apps/web/` (esqueletos), `docs/*.md`                                                                                         | — (concluída; todas as trilhas liberadas)                           |
| 1     | Auth + multi-tenant (Supabase Auth, organizations, organization_users, RBAC, middleware de tenant, login, layout privado)                                     | P0                         | ⬜                                             |                                  | 0                                                                       | `apps/api/src/modules/auth/`, `apps/api/src/modules/organizations/`, `apps/api/src/middleware/`, `apps/api/src/db/schema/organizations.ts`, `apps/api/src/infrastructure/supabase.ts`, `supabase/migrations/*organizations*`, `apps/web/src/features/auth/`, `apps/web/src/routes/`, `apps/web/src/lib/supabase.ts`, `apps/web/src/lib/api.ts`            | 4 e 5 (lógica pura em `packages/engine`), 8 (com mock), 14 (contas) |
| 2     | Clientes, planos e contratos (CRUD, valor mensal, segmento, porte, status)                                                                                    | P0                         | ⬜                                             |                                  | 1 (middleware de tenant)                                                | `apps/api/src/modules/portfolio-clients/`, `apps/api/src/modules/contracts/` (planos e contratos), `apps/api/src/db/schema/clients.ts`, `apps/api/src/db/schema/contracts.ts`, `supabase/migrations/*clients*`, `apps/web/src/features/clients/` (lista e formulário), `apps/web/src/features/contracts/`                                                 | 3, 4, 5, 8                                                          |
| 3     | Motor genérico de métricas (definições, tipos, direção, peso, normalização, thresholds, gatilhos, versionamento)                                              | P0                         | ⬜                                             |                                  | 1                                                                       | `apps/api/src/modules/metrics/`, `apps/api/src/db/schema/metrics.ts` (definitions, models, versions, items, values), `supabase/migrations/*metrics*`, `packages/shared/src/domain.ts` (enums de métrica: tipos, direções, fontes — já existe), `packages/validation/src/metrics.ts`, `apps/web/src/features/metrics/` (lista e detalhe simples)           | 2, 4 e 5 (puros), 8                                                 |
| 4     | Scoring Engine (current, trend, persistence, metric health, overall, confidence, risk, classes)                                                               | P0                         | ⬜                                             |                                  | lógica pura: 0 · acoplamento ao banco: 3 (e 2 para o impacto comercial) | `packages/engine/src/scoring/` (puro, sem banco), `apps/api/src/modules/scoring/`, `apps/api/src/db/schema/scores.ts` (snapshots), `supabase/migrations/*scores*`, `docs/SCORING.md`, `docs/METRICS_ENGINE.md`                                                                                                                                            | 1, 2, 3, 5, 8                                                       |
| 5     | SLA Engine (severidades, tipos de chamado, políticas, SLA contratual, meta operacional, consumo, ticket SLA health)                                           | P1                         | ⬜                                             |                                  | lógica pura: 0 · acoplamento ao banco: 2 (contratos/planos)             | `packages/engine/src/sla/` (puro), `apps/api/src/modules/sla/`, `apps/api/src/db/schema/sla.ts` (severities, ticket_types, sla_policies, tickets), `supabase/migrations/*sla*`, `apps/web/src/features/sla/` (configurador §42), `docs/SLA_ENGINE.md`                                                                                                     | 1, 2, 3, 4, 8                                                       |
| 6     | Preset GlobalSys v1 (10 métricas, pesos, seed, playbooks)                                                                                                     | P0                         | ⬜                                             |                                  | 3 + 4                                                                   | `apps/api/src/db/seed/` (globalsys.ts, demo.ts), `apps/api/src/modules/recommendations/`, `apps/api/src/db/schema/recommendations.ts`, `supabase/migrations/*recommendations*`, `supabase/seed.sql` (se usado)                                                                                                                                            | 7, 8, 9, 10                                                         |
| 7     | Importador (XLSX, CSV, JSON, mapeamento, validação, preview, import job, relatório de erros)                                                                  | P0                         | ⬜                                             |                                  | 2 + 3                                                                   | `apps/api/src/modules/imports/`, `apps/api/src/db/schema/imports.ts`, `supabase/migrations/*imports*`, `apps/web/src/features/import/`, `docs/IMPORTS.md`                                                                                                                                                                                                 | 6, 8, 9, 11                                                         |
| 8     | Dashboard (Em risco, Geral, ranking, health/risk/confidence, evidências, drill-down, forecast priorizado A2)                                                  | P0 (Em risco) / P1 (Geral) | ⬜                                             |                                  | começa com mock após 0 · liga em 4 + 6                                  | `apps/web/src/features/dashboard/`, `apps/web/src/components/charts/`, `apps/web/src/lib/chart-theme.ts`, `apps/web/src/lib/mock/dashboard.ts` (os quatro nasceram na 0 e agora são desta etapa), `packages/shared/src/forecast.ts` (tipos do forecast, DATAVIZ §5.4), `packages/engine/src/forecast/` (projeção pura), `apps/api/src/modules/dashboard/` | 1, 2, 3, 4, 5, 6, 7, 9 (telas diferentes)                           |
| 9     | Cliente individual (overview, abas, histórico, timeline, evidências, recomendações)                                                                           | P0                         | ⬜                                             |                                  | 8 (ou junto, telas diferentes) · dados reais: 4 + 6                     | `apps/web/src/features/client-detail/`, `apps/api/src/modules/client-health/` (rotas `/clients/:id/history`, `/scores`, `/evidence`, `/recommendations`)                                                                                                                                                                                                  | 8, 7, 10                                                            |
| 10    | Configurador de métricas (editor, pesos, thresholds, gatilhos, versionamento, simulação)                                                                      | P1                         | ⬜                                             |                                  | 3 (e 4 para simular)                                                    | `apps/web/src/features/metric-models/`, `apps/api/src/modules/metrics/` (só as rotas de versão, rebalance e preview-score — depois que a 3 fechar)                                                                                                                                                                                                        | 8, 9, 11, 12                                                        |
| 11    | Documentos + descoberta de métricas (upload PDF/DOCX/XLSX/CSV/JSON/MD/TXT, storage, fluxo manual, sugestões, aprovação; provider de IA fica para depois — A5) | P1 (manual) / P2 (IA)      | ⬜                                             |                                  | 1 (storage e tenant)                                                    | `apps/api/src/modules/documents/`, `apps/api/src/infrastructure/storage/`, `apps/api/src/infrastructure/extraction/` (`MetricExtractionProvider`, `ManualMetricExtractionProvider`), `apps/api/src/db/schema/documents.ts`, `supabase/migrations/*documents*`, `apps/web/src/features/documents/`                                                         | 7 (roda junto), 8, 9, 10                                            |
| 12    | Backtest e calibração (janelas, precision, recall, FPR, lead time, precision@5/10, pesos sugeridos, aprovação assistida)                                      | P1                         | ⬜                                             |                                  | 4 + 6 + 7 (precisa de dados importados)                                 | `packages/engine/src/calibration/` (puro), `apps/api/src/modules/calibration/`, `apps/api/src/db/schema/calibration.ts`, `supabase/migrations/*calibration*`, `apps/web/src/features/calibration/`, `docs/CALIBRATION.md`                                                                                                                                 | 10, 11, 13                                                          |
| 13    | Hardening (audit logs, rate limits, observabilidade, E2E, acessibilidade, estados vazio/carregando/erro)                                                      | P1                         | ⬜                                             |                                  | tudo que for entrar na demo                                             | `apps/api/src/middleware/` (rate limit, audit — depois da 1), `apps/api/src/infrastructure/logger.ts`, `apps/api/src/db/schema/audit.ts`, `e2e/` (Playwright), `apps/web/src/components/states/`                                                                                                                                                          | 12, 14                                                              |
| 14    | Deploy e demo (Vercel, API no Railway/Render, CI, seed demo, README, docs, OpenAPI)                                                                           | P0                         | ⬜                                             |                                  | contas e conexão do repo: **agora** (0) · pipeline final: 13            | `apps/api/Dockerfile`, `.dockerignore` (raiz), `apps/web/vercel.json`, `.github/workflows/ci.yml` (ajustes de deploy), `apps/api/src/openapi.ts` e `apps/api/src/routes/docs.ts` (OpenAPI/Swagger), `docs/DEPLOYMENT.md`, `README.md`                                                                                                                     | todas — é a tarefa ideal para uma **pessoa** enquanto agentes codam |

Regras sobre a tabela:

- **Responsável** é um nome de pessoa ou o nome do agente (ex.: "agente api"). Vazio = ninguém pegou.
- **Depende de** é a dependência real, não a ordem numérica. Ex.: a lógica pura do scoring (4) nasce em
  `packages/engine` logo depois da 0, em paralelo com a 1; só o acoplamento ao banco espera a 3.
- **Caminhos que a etapa possui** são os únicos lugares que a etapa pode criar/editar. Se dois caminhos
  colidem, as etapas **não** rodam juntas.

---

## Convenção de arquivos (para etapas não se esbarrarem)

| O quê                    | Onde                                   | Regra                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema Drizzle           | `apps/api/src/db/schema/<modulo>.ts`   | **um arquivo por módulo**, reexportado em `apps/api/src/db/schema/index.ts` (a única linha que você adiciona lá é o `export * from "./<modulo>"`)                                                                                                                                                                                                    |
| Módulo da API            | `apps/api/src/modules/<modulo>/`       | `controller.ts`, `service.ts`, `repository.ts`, `routes.ts`, `schema.ts`, `types.ts`, `__tests__/` (§3 da spec). Registrar a rota em `apps/api/src/app.ts` é uma linha — combine no chat antes                                                                                                                                                       |
| Feature do web           | `apps/web/src/features/<feature>/`     | componentes, hooks e páginas da feature ficam dentro dela; só o registro da rota vai em `apps/web/src/routes/`                                                                                                                                                                                                                                       |
| Lógica pura              | `packages/engine/src/<dominio>/`       | sem banco, sem Express, sem React; 100% testável com Vitest                                                                                                                                                                                                                                                                                          |
| Tipos e enums de domínio | `packages/shared/src/<dominio>.ts`     | **um arquivo plano por domínio** (`domain.ts`, `scoring.ts`, `forecast.ts`...), reexportado em `index.ts`; consumidos por api, web e engine                                                                                                                                                                                                          |
| Schemas Zod              | `packages/validation/src/<dominio>.ts` | idem (`common.ts`, `domain.ts`, `env.ts`...)                                                                                                                                                                                                                                                                                                         |
| Migrations               | `supabase/migrations/`                 | geradas por `pnpm --filter @inovaapss/api db:generate` a partir do schema Drizzle (ajuste A8). **Commite junto a pasta `supabase/migrations/meta/`** (journal e snapshots do Drizzle: é por ela que o próximo `db:generate` calcula o diff) e nunca edite nem apague o que está nela. **Nunca edite uma migration depois de commitada** — crie outra |
| Docs                     | `docs/<TEMA>.md`                       | cada etapa escreve o seu (SCORING, SLA_ENGINE, IMPORTS, CALIBRATION...)                                                                                                                                                                                                                                                                              |

---

## Diagrama de dependências

```text
                  ┌────────────────────────────────────────────────────┐
                  │  0  Fundação (monorepo, pnpm, turbo, lint, CI)     │
                  └───┬──────────────┬───────────────┬──────────────┬──┘
                      │              │               │              │
                      ▼              ▼               ▼              ▼
        ┌──────────────────┐  ┌────────────┐  ┌───────────┐  ┌──────────────┐
        │ 1 Auth + tenant  │  │ 4p Scoring │  │ 5p SLA    │  │ 8m Dashboard │
        │                  │  │  (puro)    │  │  (puro)   │  │  (com mock)  │
        └──┬───────┬───┬───┘  └─────┬──────┘  └─────┬─────┘  └──────┬───────┘
           │       │   │            │               │               │
           ▼       │   ▼            │               │               │
     ┌──────────┐  │ ┌───────────┐  │               │               │
     │ 2 Clien- │  │ │ 11 Docu-  │  │               │               │
     │   tes    │  │ │   mentos  │  │               │               │
     └──┬───┬───┘  │ └───────────┘  │               │               │
        │   │      ▼                │               │               │
        │   │  ┌────────────┐       │               │               │
        │   └─►│ 3 Métricas │       │               │               │
        │      └──┬────┬────┘       │               │               │
        │         │    │            │               │               │
        │         │    ▼            ▼               ▼               │
        │         │  ┌──────────────────┐   ┌──────────────┐        │
        │         │  │ 4 Scoring (banco)│   │ 5 SLA (banco)│        │
        │         │  └────────┬─────────┘   └──────────────┘        │
        │         │           │                                     │
        ▼         ▼           ▼                                     ▼
     ┌───────────────┐   ┌──────────────┐                    ┌────────────────┐
     │ 7 Importador  │   │ 6 GlobalSys  │───────────────────►│ 8 Dashboard    │
     └───────┬───────┘   └──────┬───────┘                    │   (dados reais)│
             │                  │                            └───────┬────────┘
             │                  ▼                                    ▼
             │           ┌──────────────┐                    ┌────────────────┐
             │           │ 10 Configu-  │                    │ 9 Cliente      │
             │           │    rador     │                    │   individual   │
             │           └──────────────┘                    └────────────────┘
             ▼
     ┌───────────────────────────┐        ┌──────────────┐        ┌──────────────────┐
     │ 12 Backtest (4 + 6 + 7)   │───────►│ 13 Hardening │───────►│ 14 Deploy final  │
     └───────────────────────────┘        └──────────────┘        └──────────────────┘

     14-inicial (criar contas Vercel / Render ou Railway, conectar o repo): começa AGORA, em paralelo com tudo.
     "p" = parte pura em packages/engine · "m" = com dados mock
```

---

## Plano de paralelismo sugerido agora

Quatro trilhas que não compartilham arquivos. Cada trilha é um agente ou uma pessoa.

| Trilha | Quem   | Sequência                     | Por que essa ordem                                                                                                                                                                                                                                                      |
| ------ | ------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | agente | **1 → 2 → 7**                 | Auth é pré-requisito de tudo que toca o banco; clientes vêm em seguida; o importador precisa de clientes e métricas (a 3 vem da trilha B)                                                                                                                               |
| **B**  | agente | **engine puro 4 + 5 → 3 → 6** | As fórmulas (§70) não dependem de nada — nascem testadas em `packages/engine`; depois o motor de métricas no banco e o preset GlobalSys que usa os dois                                                                                                                 |
| **C**  | pessoa | **14-inicial + planilha**     | Criar contas na Vercel e no Render (ou Railway), conectar o repositório, preencher variáveis de ambiente — exige login humano ([DEPLOYMENT.md](DEPLOYMENT.md)). E conseguir a planilha `INOVAAPPS_base_de_dados.xlsx`, sem a qual a calibração (12) não tem dados reais |
| **D**  | agente | **8 com mock → 9**            | O dashboard e o gráfico de forecast priorizado ([DATAVIZ.md](DATAVIZ.md)) podem nascer com `apps/web/src/lib/mock/dashboard.ts` e trocar para a API quando a 4 e a 6 fecharem; a visão do cliente vem na sequência                                                      |

Ponto de encontro: quando A terminou a 2 e B terminou a 3, o importador (7) e o preset (6) podem entrar.
Quando 4 + 6 fecham, D troca o mock pela API real.

---

## Protocolo para pegar uma etapa

1. **Marque aqui** o status 🔄, o seu nome em "Responsável" e uma linha no Registro. Commite **só isso**:
   `docs(etapas): start stage N`.
2. **Mexa só nos caminhos da etapa.** Precisa de um arquivo de outra etapa em andamento? Pede no chat.
3. **`Ctrl+Shift+B` com frequência** (a cada 20–30 minutos e antes de qualquer pausa) — o sync
   commita, puxa e envia, nessa ordem.
4. **Ao terminar**, rode a validação completa na raiz — `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm build` — e só então marque ✅ citando o hash do commit final. Commite:
   `docs(etapas): finish stage N`.
5. Ficou travado por algo fora da etapa (segredo faltando, decisão de arquitetura)? Marque ⛔ e diga o
   motivo na coluna Status — assim outra pessoa pode destravar sem perguntar.

Mensagens de commit seguem o padrão em [COMO-TRABALHAR.md, seção 3](COMO-TRABALHAR.md#3-padrão-de-mensagem-de-commit).
Um único autor (Kauazxz), sem trailers; o hook `commit-msg` rejeita o que foge disso (ajuste A6).

---

## Registro

Uma linha por mudança de status, a mais recente embaixo.

| Data       | Etapa | O que mudou                                                                                                                                                                                                                                                                                                              |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 19/09/2026 | 0     | Etapa 0 iniciada — agentes tooling, api, web e docs em paralelo                                                                                                                                                                                                                                                          |
| 19/09/2026 | 0     | Esqueleto da API integrado (`fcd342b`)                                                                                                                                                                                                                                                                                   |
| 19/09/2026 | 0     | Esqueleto do web integrado (`38aaf02`) e build da Vercel configurado (`b237872`)                                                                                                                                                                                                                                         |
| 19/09/2026 | 0     | Etapa 0 concluída após a revisão da fundação (CORS_ORIGINS, hooks de autoria e de mensagem, db:check no CI, .dockerignore da raiz). `features/dashboard/`, `components/charts/`, `lib/chart-theme.ts` e `lib/mock/dashboard.ts` passam para a Etapa 8; `ClientDetailPage` já está em `features/client-detail/` (Etapa 9) |
