# @inovaapss/web

Front-end do motor de saúde, risco e prioridade de clientes. React 19 + Vite 8 + TypeScript,
Tailwind CSS 4, shadcn/ui, React Router, TanStack Query, React Hook Form + Zod, Recharts e
Lucide (stack da [SPEC.md §2](../../docs/SPEC.md)).

## Comandos

Na raiz do monorepo (`pnpm dev` sobe api e web juntos via Turbo) ou só este pacote com
`pnpm --filter @inovaapss/web <script>`:

| Script      | O que faz                                                                   |
| ----------- | --------------------------------------------------------------------------- |
| `dev`       | Vite em <http://localhost:5173>                                             |
| `build`     | `tsc -b` (tipos) e `vite build` → `dist/`                                   |
| `preview`   | serve o `dist/` gerado, na porta 5173                                       |
| `lint`      | ESLint com a config da raiz + regras de React (`eslint.config.mjs` local)   |
| `typecheck` | `tsc -b` (src e configs do Vite/Vitest)                                     |
| `test`      | Vitest + Testing Library no jsdom (`vitest.config.ts`, `src/test/setup.ts`) |

## Variáveis de ambiente

**Não existe `.env` nem `.env.example` nesta pasta.** O Vite está configurado com `envDir`
apontando para a raiz do monorepo (`vite.config.ts`), então ele lê o `.env` da raiz — o mesmo
arquivo da API. Só as variáveis com prefixo `VITE_` chegam ao navegador:

| Variável                 | Uso                                                              |
| ------------------------ | ---------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | URL do projeto Supabase (auth no navegador)                      |
| `VITE_SUPABASE_ANON_KEY` | chave `anon` `public` (pode ir ao navegador; a service_role não) |
| `VITE_API_URL`           | endereço da API Express; padrão `http://localhost:3001`          |

Modelo com placeholders: [`.env.example` da raiz](../../.env.example). A validação é o
`clientEnvSchema` de `@inovaapss/validation`, usado em `src/lib/supabase.ts` (o client do Supabase
é criado sob demanda para o app não quebrar sem `.env`).

Na Vercel, as três variáveis são cadastradas no painel do projeto
([DEPLOYMENT.md](../../docs/DEPLOYMENT.md), seção 3). O `vercel.json` desta pasta faz o rewrite de
todas as rotas para `index.html` (SPA).

## Estrutura

```text
src/
├─ main.tsx                 BrowserRouter + App
├─ App.tsx                  QueryClientProvider + rotas
├─ routes/                  registro das rotas (§38), guard RequireAuth, itens da sidebar
├─ components/
│  ├─ ui/                   shadcn/ui (button, card, input, label, table, badge, tabs, separator, skeleton)
│  ├─ layout/               PrivateLayout (sidebar + cabeçalho) e PublicLayout
│  ├─ charts/               gráficos Recharts que seguem o DATAVIZ.md
│  └─ *.tsx                 page-header, empty-state, placeholder-page
├─ features/<feature>/      telas e hooks de cada feature (auth, dashboard, clients, ...)
├─ lib/
│  ├─ api.ts                fetch para VITE_API_URL; erros viram ApiError ({ code, message, requestId })
│  ├─ supabase.ts           client do Supabase (sob demanda, env validado com Zod)
│  ├─ chart-theme.ts        tokens de cor/tipografia/marcas do DATAVIZ.md, claro e escuro
│  ├─ format.ts             números em pt-BR (R$ 12,4 mil, 91 %, +2)
│  ├─ query-client.ts       QueryClient único
│  └─ mock/dashboard.ts     DADOS DE EXEMPLO do dashboard (some na Etapa 8)
└─ test/setup.ts            jest-dom, cleanup e stubs de ResizeObserver/matchMedia
```

Regra do [ETAPAS.md](../../docs/ETAPAS.md): cada feature vive em `src/features/<feature>/`; só o
registro da rota vai em `src/routes/`.

## Componentes do shadcn/ui

`components.json` está configurado (estilo `radix-nova`, base `neutral`, ícones Lucide). Para
adicionar um componente: `pnpm dlx shadcn@latest add <nome>` dentro de `apps/web`. Os arquivos
ficam em `src/components/ui/` e importam `cn` de `@/lib/utils`.

Se a CLI falhar ao instalar dependências (ela roda um `pnpm add` próprio), pegue o componente
direto do registro (`https://ui.shadcn.com/r/styles/radix-nova/<nome>.json`), salve o conteúdo em
`src/components/ui/` e troque `from "cn"` por `from "@/lib/utils"` — foi assim que os nove
componentes iniciais entraram.

## Gráficos

Todo gráfico segue o [DATAVIZ.md](../../docs/DATAVIZ.md) (ajustes A1–A3 da spec): sem pizza, cinza
por padrão com uma cor de destaque, título que afirma o "e daí?", rótulo direto, "Ver como
tabela". As cores vêm **só** de `src/lib/chart-theme.ts`; nenhum componente escreve hex.

`src/components/charts/ranked-bar-chart.tsx` é o exemplo de referência (barras horizontais
ordenadas), usado em `/dashboard` com dados de exemplo. O gráfico de forecast priorizado
(dumbbell, ajuste A2) entra na Etapa 8.

## O que ainda não está ligado

- **Auth**: `/login` e `/forgot-password` validam o formulário mas não chamam o Supabase;
  `RequireAuth` deixa passar. Etapa 1.
- **Dados**: todas as telas privadas são placeholders com estado vazio; o dashboard usa
  `src/lib/mock/dashboard.ts`. Cada etapa do ETAPAS.md substitui a sua tela.
