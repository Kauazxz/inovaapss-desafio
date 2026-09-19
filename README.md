# inovaapss

[![Deploy no Supabase](https://github.com/Kauazxz/inovaapss-desafio/actions/workflows/deploy-supabase.yml/badge.svg)](https://github.com/Kauazxz/inovaapss-desafio/actions/workflows/deploy-supabase.yml)

Projeto do grupo para o desafio INOVAAPPS: um **motor configurável de saúde, risco e prioridade de
clientes** — uma plataforma SaaS multiempresa em que cada organização configura as próprias métricas,
enxerga quais clientes estão se deteriorando, entende as evidências e sabe em que ordem agir.

> **Status:** Etapa 0 (fundação) em andamento. Acompanhe em **[docs/ETAPAS.md](docs/ETAPAS.md)**.

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

| Camada                 | Tecnologia                                                                                                   | Estado                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Monorepo               | **pnpm** workspaces + **Turborepo**, TypeScript, ESLint, Prettier, Husky + lint-staged                       | em montagem (Etapa 0)                                  |
| API                    | **Express** + **Drizzle ORM** + Zod + Pino, Vitest + Supertest, OpenAPI                                      | em montagem                                            |
| Web                    | **React** + **Vite** + **Tailwind** + **shadcn/ui**, React Router, TanStack Query, React Hook Form, Recharts | em montagem                                            |
| Banco / Auth / Storage | **Supabase** (Postgres, Auth, Storage), migrations geradas pelo Drizzle em `supabase/migrations/`            | **funcionando** — deploy automático por GitHub Actions |
| Hospedagem web         | **Vercel**                                                                                                   | a conectar — [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)  |
| Hospedagem API         | **Railway ou Render** (Dockerfile)                                                                           | a conectar — [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)  |

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

Antes de commitar (e o CI roda o mesmo):

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Outros comandos da raiz: `pnpm sync` (sincroniza com o grupo), `pnpm status`, `pnpm format`,
`pnpm --filter @inovaapss/api db:generate` (gera migration a partir do schema Drizzle).

## Documentação

| Arquivo                                          | O que tem                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [docs/SPEC.md](docs/SPEC.md)                     | a especificação completa do produto e das etapas                                              |
| [docs/ETAPAS.md](docs/ETAPAS.md)                 | quadro de etapas: quem está em qual, dependências, o que pode rodar em paralelo               |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | monorepo, fluxo de dados, MVC modular, migrations, portas e scripts                           |
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
sem trailers — o hook `commit-msg` confere). As regras completas (padrão de commit, o que fazer no
conflito, comandos de emergência) estão em **[docs/COMO-TRABALHAR.md](docs/COMO-TRABALHAR.md)**.
Para dividir trabalho por etapa sem conflito, use o **[docs/ETAPAS.md](docs/ETAPAS.md)**.
