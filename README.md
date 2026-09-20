# inovaapss

[![Deploy no Supabase](https://github.com/Kauazxz/inovaapss-desafio/actions/workflows/deploy-supabase.yml/badge.svg)](https://github.com/Kauazxz/inovaapss-desafio/actions/workflows/deploy-supabase.yml)

Projeto do grupo para o desafio INOVAAPPS: um **motor configurável de saúde, risco e prioridade de
clientes** — uma plataforma SaaS multiempresa em que cada organização configura as próprias métricas,
enxerga quais clientes estão se deteriorando, entende as evidências e sabe em que ordem agir.

> **Status:** Etapas 0 (fundação) e 1 (auth + multiempresa) concluídas; motor de scoring e SLA
> prontos na parte pura (`packages/engine`, Etapas 4/5) e dashboard com dados de exemplo (Etapa 8).
> As demais etapas rodam em paralelo por trilhas — acompanhe em **[docs/ETAPAS.md](docs/ETAPAS.md)**.

---

## Sobre o desafio

|                          |                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Desafio**              | INOVAAPPS — Customer Health, Churn Intelligence e Priorização Operacional                                  |
| **Primeiro caso de uso** | GlobalSys (10 métricas, pesos calibráveis) — "a GlobalSys é uma configuração do sistema, não o sistema"    |
| **Entrega**              | _a preencher_                                                                                              |
| **Objetivo**             | ao abrir a solução, o gestor responde em segundos: **com quem falar, por quê, em que ordem e o que fazer** |

A especificação completa está em **[docs/SPEC.md](docs/SPEC.md)** (os "Ajustes do time" no topo
vencem o resto em caso de conflito).

## O time

| Nome          | GitHub                                 | Responsável por |
| ------------- | -------------------------------------- | --------------- |
| Kaua Araujo   | [@Kauazxz](https://github.com/Kauazxz) | _a definir_     |
| _a preencher_ |                                        |                 |

## Stack

| Camada                 | Tecnologia                                                                                                   | Estado                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Monorepo               | **pnpm** workspaces + **Turborepo**, TypeScript, ESLint, Prettier, Husky + lint-staged                       | **pronto** (Etapa 0)                                                                                                |
| API                    | **Express** + **Drizzle ORM** + Zod + Pino, Vitest + Supertest, OpenAPI                                      | Etapa 1 pronta: auth (JWT do Supabase), tenant, RBAC, organizações (`/api/v1/me`, `/organizations`)                 |
| Motor                  | `packages/engine` — scoring, SLA e forecast puros, com testes                                                | Etapas 4/5 (parte pura) prontas; acoplamento ao banco pendente                                                      |
| Web                    | **React** + **Vite** + **Tailwind** + **shadcn/ui**, React Router, TanStack Query, React Hook Form, Recharts | login, recuperação de senha, onboarding e dashboard lendo a API (`VITE_DATA_SOURCE=mock` desenha sem backend)       |
| Banco / Auth / Storage | **Supabase** (Postgres, Auth, Storage), migrations geradas pelo Drizzle em `supabase/migrations/`            | **funcionando** — deploy automático por GitHub Actions                                                              |
| Hospedagem web         | **Vercel**                                                                                                   | **no ar**: https://inovaapss-desafio.vercel.app (todo push na `main`)                                               |
| Hospedagem API         | **Vercel** (o Dockerfile serve para Railway/Render)                                                          | **no ar**: https://inovaapss-api.vercel.app (`/ready` responde `db: ok`) — [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

O deploy do banco é **automático**: todo push na `main` que mexe em `supabase/` é aplicado pelo
GitHub Actions. Guia em **[docs/SUPABASE.md](docs/SUPABASE.md)**.

## Como rodar

Pré-requisitos: Git, **Node 22** e pnpm. O pnpm se instala uma vez:

```powershell
npm install -g pnpm
```

Depois, dentro da pasta do projeto:

```powershell
pnpm install                      # instala tudo (api, web, packages)
copy .env.example .env            # no Mac/Linux: cp .env.example .env — depois preencha os valores
pnpm dev                          # sobe a API em http://localhost:3001 e o web em http://localhost:5173
```

O `pnpm dev` compila `packages/shared` e `packages/validation` antes de subir a API e o web (Turbo),
então funciona num clone recém-instalado. Para rodar um pacote sozinho (`pnpm --filter @inovaapss/api dev`),
rode `pnpm build` na raiz uma vez antes — e de novo sempre que alguém mexer em `packages/`.

**Para entrar** (a tela de login pede um usuário): preencha no `.env` as variáveis do Supabase e
crie o primeiro usuário pelo seed de demonstração — **[docs/AUTH.md, seção 5](docs/AUTH.md#5-como-criar-o-primeiro-usuário)**
(`pnpm --filter @inovaapss/api seed:demo`, credenciais só no shell) — ou pelo painel do Supabase
(_Authentication → Users → Add user_). Com as `VITE_SUPABASE_*` vazias o front mostra "Autenticação
não configurada" em vez de quebrar.

Antes de commitar (e o CI roda o mesmo):

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Outros comandos da raiz: `pnpm sync` (sincroniza com o grupo), `pnpm status`, `pnpm format`,
`pnpm --filter @inovaapss/api db:generate` (gera migration a partir do schema Drizzle — commite também
`supabase/migrations/meta/`) e `pnpm --filter @inovaapss/api db:check` (confere migrations × schema, o
mesmo que o CI roda).

## Documentação

| Arquivo                                          | O que tem                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [docs/SPEC.md](docs/SPEC.md)                     | a especificação completa do produto e das etapas                                              |
| [docs/ETAPAS.md](docs/ETAPAS.md)                 | quadro de etapas: quem está em qual, dependências, o que pode rodar em paralelo               |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | monorepo, fluxo de dados, MVC modular, migrations, portas e scripts                           |
| [docs/AUTH.md](docs/AUTH.md)                     | login, sessão, organizações, papéis, como criar o primeiro usuário e convidar alguém          |
| [docs/DADOS.md](docs/DADOS.md)                   | regras de leitura dos dados: quem entra em cada número (MRR, distribuição, linha do tempo)    |
| [docs/IMPORTS.md](docs/IMPORTS.md)               | importação de planilhas: formatos, datasets, mapeamento de colunas, erros e o que é gravado   |
| [docs/IA.md](docs/IA.md)                         | IA: leitura de documentos, Agente sobre o relatório e Canvas de Decisão com dados verificados |
| [docs/SCORING.md](docs/SCORING.md)               | fórmulas do motor: health, tendência, persistência, confiança, risco, prioridade, forecast    |
| [docs/METRICS_ENGINE.md](docs/METRICS_ENGINE.md) | como uma métrica é configurada (tipos, normalização, gatilhos, fórmula segura)                |
| [docs/SLA_ENGINE.md](docs/SLA_ENGINE.md)         | SLA contratual, meta operacional, consumo e health por chamado                                |
| [docs/DATAVIZ.md](docs/DATAVIZ.md)               | guia de visualização (sem pizza, cinza + uma cor de destaque, gráfico de forecast priorizado) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)         | o que já sobe sozinho e o passo a passo para conectar Vercel e Render/Railway                 |
| [docs/SUPABASE.md](docs/SUPABASE.md)             | banco, deploy automático e migrations                                                         |
| [docs/COMECAR-AQUI.md](docs/COMECAR-AQUI.md)     | primeiro dia no projeto: instalar, clonar, conectar                                           |
| [docs/COMO-TRABALHAR.md](docs/COMO-TRABALHAR.md) | regras do dia a dia: commits, conflitos, emergências                                          |

---

## Começando

Primeira vez no projeto? Siga o **[docs/COMECAR-AQUI.md](docs/COMECAR-AQUI.md)** —
instalação, clone, conexão com o GitHub e como a gente programa junto.

## Como a gente trabalha

Dois modos, para situações diferentes:

| Situação                                  | Como                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Resolver o mesmo problema juntos, ao vivo | **Live Share** (`Ctrl+Shift+P` → _Live Share: Start Collaboration Session_) |
| Tarefas divididas, horários diferentes    | Cada um na sua máquina + **`Ctrl+Shift+B`** para sincronizar                |

**`Ctrl+Shift+B`** roda o [`sync.js`](sync.js) (`pnpm sync`): commita o seu trabalho, puxa o do
colega e envia o seu — nessa ordem, para ninguém sobrescrever ninguém.
Rode **antes de começar** e **depois de terminar**.

**Deploy no Supabase:** não existe passo de deploy. Mexeu em `supabase/` e apertou
`Ctrl+Shift+B`? O GitHub Actions aplica no banco sozinho. Acompanhe na aba **Actions**.

Commitamos direto na `main`, sem branch por pessoa, sempre pela conta **Kauazxz** (um único autor,
sem trailers — os hooks `pre-commit` e `commit-msg` conferem). As regras completas (padrão de commit, o que fazer no
conflito, comandos de emergência) estão em **[docs/COMO-TRABALHAR.md](docs/COMO-TRABALHAR.md)**.
Para dividir trabalho por etapa sem conflito, use o **[docs/ETAPAS.md](docs/ETAPAS.md)**.
