# inovaapss-desafio

Monorepo pnpm + Turborepo com um motor configurável de saúde, risco e prioridade de clientes (Customer Health / churn), feito para o desafio INOVAAPPS.

## O que é e para quem

É uma plataforma SaaS multiempresa. Cada organização define suas próprias métricas — tipo, direção, normalização, peso, limites e gatilhos —, importa planilhas, e o sistema calcula saúde, tendência, risco e prioridade de cada cliente da carteira, com fila de alertas e um agente de IA que responde sobre o relatório.

O usuário é o gestor de Customer Success, e a pergunta que o produto responde é operacional: com quem falar, por quê, em que ordem e o que fazer. A saída é um ranking por prioridade, as evidências do porquê de cada posição e a projeção de quem vai cruzar a faixa de risco primeiro.

A decisão de arquitetura mais importante é esta: as 10 métricas da GlobalSys (o caso do desafio) **não estão cravadas no código**. Elas são uma configuração — um preset — carregada por seed. O sistema é o motor configurável; a GlobalSys é só o primeiro cliente dele.

A base do desafio está em `data/INOVAAPPS_base_de_dados.xlsx`: 80 clientes, 1.295 linhas de atendimento mensal (jan/2025 a jun/2026), 422 pesquisas NPS e 22 cancelamentos. Os 22 cancelamentos são o gabarito do backtest que calibra os pesos. (Números conforme `data/README.md`, que diz serem conferidos pelo teste `packages/importer/src/presets/globalsys-xlsx.test.ts` — teste que passa; a planilha em si não foi aberta à mão.)

## Stack

- **Monorepo**: pnpm 12.4.2 (campo `packageManager`) + Turborepo 2.11.2, TypeScript ~6.0.3, Node >=22 (`.node-version`: 22), `engine-strict=true` no `.npmrc`.
- **API**: Express 5.2.1 + Drizzle ORM 0.45.2 + postgres 3.4.9 + Zod 4.6.5 + Pino 10 + helmet + express-rate-limit. OpenAPI/Swagger via `swagger-ui-express`.
- **Web**: React 19.3 + Vite 8.3 + Tailwind 4.3 + radix-ui, React Router 7.9, TanStack Query 5.103, React Hook Form 7.88, Recharts 3.10, streamdown.
- **Testes**: Vitest 5.0.1 (com `@vitest/coverage-v8` nos packages puros), Supertest 7.2, Testing Library + jsdom no web, `node:test` nos 2 scripts de hook.
- **Banco / Auth / Storage**: Supabase — Postgres, Auth por JWT, Storage com os buckets `documents` e `imports`. As migrations são geradas pelo Drizzle e ficam em `supabase/migrations/` com o prefixo da CLI do Supabase.
- **Hospedagem**: Vercel. O web é Vite estático; a API é função serverless em `apps/api/api/index.ts` (`maxDuration` 60s, `memory` 1024). Existe também `apps/api/Dockerfile` (multi-stage) como alternativa para Render/Railway.
- **IA**: chamadas HTTP diretas, sem SDK. OpenAI Chat Completions (padrão `gpt-4o-mini`) para o Agente e para a leitura assistida de documentos; Anthropic Messages API (padrão `claude-haiku-4-5-20251001`) para a sugestão automática de métricas. Sem chave, cai numa heurística local.
- **Extração de texto**: unpdf, mammoth (DOCX), xlsx, papaparse; opcionalmente a Web API do Unstructured auto-hospedada.
- **Qualidade**: ESLint 10 + eslint-plugin-import-x, Prettier 3.9, Husky 9 + lint-staged 16, GitHub Actions (`ci.yml` e `deploy-supabase.yml`).

## Como está organizado

Na raiz: 2 apps e 5 packages (`pnpm-workspace.yaml`: `apps/*`, `packages/*`), mais `docs/` (22 arquivos, 7.157 linhas), `supabase/` (6 migrations + o meta do Drizzle), `scripts/` (6 arquivos), `data/` (a planilha do desafio) e `sync.js`.

**apps/api** — Express em MVC modular.

- `src/app.ts` monta o app. `src/server.ts` é a entrada tradicional e `api/index.ts` a serverless; as duas reaproveitam o mesmo `createApp`, nenhuma rota é declarada duas vezes.
- 13 módulos em `src/modules/`: alerts, assistant, auth, calibration, client-health, contracts, dashboard, documents, imports, metrics, organizations, portfolio-clients, scoring. Cada um tem controller/service/repository/routes/schema/types e `__tests__/`.
- `src/middleware/`: auth (valida o JWT do Supabase), tenant (resolve a organização) e rbac.
- `src/infrastructure/`: db, supabase, logger, mailer, storage (Supabase ou memória), `ai/openai-client` e `extraction/` com 4 providers (anthropic, openai, heurístico, manual).
- `src/db/schema/` tem um arquivo Drizzle por módulo; `src/db/seed/` tem 4 seeds (demo-auth, globalsys-preset, globalsys-data, recalculate).
- `src/routes/api-v1.ts` registra tudo e publica a lista das 66 rotas em `GET /api/v1`.

**apps/web** — React por feature.

- 13 features em `src/features/`: alerts, assistant, auth, calibration, client-detail, clients, contracts, dashboard, documents, import, metric-models, metrics, settings.
- `src/routes/index.tsx` registra 17 rotas e carrega as 15 telas internas por `lazy()`; login e recuperação de senha ficam fora do lazy de propósito.
- `src/lib/`: o cliente HTTP (`api.ts`), o cliente Supabase e o tema dos gráficos.
- 195 arquivos em `src`.

**packages/**

- `engine` — o motor puro: scoring, sla, calibration/backtest. Sem banco, sem HTTP.
- `importer` — núcleo puro do importador: readers XLSX/CSV/JSON, detecção e mapeamento de colunas, coerção, validação.
- `shared` — tipos, enums e DTOs de domínio.
- `validation` — schemas Zod, inclusive o schema das variáveis de ambiente.
- `config` — tsconfigs base.

**Banco** — 18 tabelas em 6 migrations: `organizations`, `organization_users`; `metric_definitions`, `metric_models`, `metric_model_versions`, `metric_model_items`; `portfolio_clients`, `plans`, `contracts`; `uploaded_documents`, `metric_extraction_suggestions`; `metric_values`, `metric_score_snapshots`, `client_score_snapshots`; `alerts`; `import_jobs`, `import_row_errors`, `calibration_runs`.

## Como rodar

Contas e credenciais: ver a pasta irmã inovaapss-desafio-tokens, fora deste repositório.

O caminho documentado no README e confirmado no `package.json`:

```
npm install -g pnpm        # pnpm NAO esta instalado nesta maquina
pnpm install
cp .env.example .env       # depois preencha
pnpm dev                   # API em http://localhost:3001, web em http://localhost:5173
```

`pnpm dev` é `turbo run dev`, que compila `packages/*` antes de subir a api (`tsx watch src/server.ts`) e o web (`vite --port 5173`).

**Atenção: nesta máquina nada que passe pelo turbo roda.** `pnpm dev`, `pnpm build`, `pnpm test` e `pnpm lint` são todos `turbo run <task>`, e o binário `node_modules/.pnpm/@turbo+windows-64@2.11.2/.../turbo.exe` é recusado pelo Windows com "Uma política de Controle de Aplicativo bloqueou este arquivo" (pelo npm aparece como `Error: spawn UNKNOWN`, errno -4094). O binário está instalado — é política da máquina, não defeito do projeto.

Contorno que funcionou (pnpm recursivo em vez de turbo):

```
corepack pnpm install --frozen-lockfile
corepack pnpm -r --filter @inovaapss/shared --filter @inovaapss/engine --filter @inovaapss/validation --filter @inovaapss/importer run build
corepack pnpm -r --workspace-concurrency=1 run build       # exit 0
corepack pnpm --filter @inovaapss/api dev                  # API sozinha, depois do build
corepack pnpm --filter @inovaapss/web dev                  # web sozinho
```

É `corepack pnpm` porque não existe pnpm global aqui; o corepack 0.35.0 baixa o 12.4.2 do campo `packageManager` sem precisar de `corepack enable`.

Seeds (precisam de banco; não foram executados nesta verificação):

- `pnpm --filter @inovaapss/api seed:demo` — cria a organização e o usuário owner. E-mail e senha vêm só de `SEED_DEMO_EMAIL` / `SEED_DEMO_PASSWORD` no shell.
- `seed:globalsys` — o modelo de 10 métricas.
- `seed:globalsys-data` — a carteira de exemplo.
- `recalculate` — calcula os scores.

## Como testar

`pnpm test` é `turbo run test && node --test scripts/verificar-commit.test.js scripts/verificar-autor.test.js`. Com o turbo bloqueado, a suíte rodou por `corepack pnpm -r --workspace-concurrency=1 run test` — depois do build dos packages, porque a task `test` do `turbo.json` depende de `^build`.

Resultado real, suíte inteira verde:

| projeto             | arquivos                | testes                         |
| ------------------- | ----------------------- | ------------------------------ |
| packages/shared     | 4                       | 19                             |
| packages/engine     | 18                      | 229                            |
| packages/importer   | 6                       | 79                             |
| packages/validation | 2                       | 29                             |
| apps/api            | 26 (21 ok, 5 ignorados) | 330 (314 ok, 16 ignorados)     |
| apps/web            | 21                      | 179                            |
| scripts (node:test) | 2                       | 13                             |
| **total**           | **79**                  | **862 passando, 16 ignorados** |

Os 16 ignorados são as 5 suítes de integração da API (`documents`, `imports`, `metrics`, `organizations`, `portfolio-clients`), com `describe.skipIf(!enabled)`: só rodam quando há `DATABASE_URL`/`SUPABASE_*` no ambiente **e** as tabelas existem no banco. Elas dizem no console por qual dos dois motivos pularam.

Também rodado direto pelo node, para fugir do bloqueio do turbo:

- typecheck (`tsc`) nos 7 projetos: exit 0
- eslint nos 6 projetos com `--max-warnings 0`: exit 0 em todos
- build completo (`pnpm -r run build`, inclui o `vite build` do web): exit 0
- `drizzle-kit check` (migrations × schema Drizzle, o mesmo do CI): "Everything's fine"

## Como publicar

Três pipelines, todos disparados por push na `main` (branch padrão do repositório).

**1. Banco** — GitHub Actions `.github/workflows/deploy-supabase.yml`. Dispara só em push na `main` que mexa em `supabase/**` (ou no próprio workflow), mais `workflow_dispatch`. Faz `supabase link --project-ref` e `supabase db push --yes`, e manda as Edge Functions se a pasta existir. Exige 3 segredos no repositório — `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD` — e tem um passo que falha com mensagem clara se faltar algum. Não existe passo manual de deploy de banco. Último run: sucesso em 2026-09-20T12:59Z.

**2. Web** — Vercel, projeto com Root Directory `apps/web`, configuração versionada em `apps/web/vercel.json`: framework vite, `pnpm install --frozen-lockfile`, `pnpm --filter @inovaapss/web... build`, output `dist`, rewrite SPA de tudo para `/index.html`. No ar em https://inovaapss-desafio.vercel.app.

**3. API** — Vercel, projeto com Root Directory `apps/api`, configuração em `apps/api/vercel.json`: build `pnpm --filter @inovaapss/api... build`, função `api/index.ts` (maxDuration 60, memory 1024) e rewrite de `/(.*)` para `/api/index`. No ar em https://inovaapss-api.vercel.app. A `DATABASE_URL` tem que ser o Transaction pooler do Supabase, porta 6543, porque o cliente usa `prepare: false`.

Alternativa não usada: `apps/api/Dockerfile` (multi-stage, usuário não-root, HEALTHCHECK no `/health`), com a raiz do monorepo como contexto — `docker build -f apps/api/Dockerfile -t inovaapss-api .` — para Render ou Railway.

CI em todo push e PR (`ci.yml`): lint, typecheck, test, build, `drizzle-kit check` e um job separado que valida o nome das migrations (`scripts/verificar-migrations.js`).

Não existe `.vercel/` neste clone: não há vínculo local com a Vercel, e os nomes dos dois projetos na Vercel não dão para descobrir pelo repositório.

## Em que pé está

Meio no ar: as duas aplicações respondem, o banco não existe mais. Conferido em 2026-10-03:

- https://inovaapss-desafio.vercel.app → HTTP 200, serve o bundle Vite.
- https://inovaapss-api.vercel.app/health → `{"status":"ok","version":"0.1.0","uptime":2}`.
- https://inovaapss-api.vercel.app/api/v1 → responde com a lista completa das 66 rotas.
- https://inovaapss-api.vercel.app/ready → `{"status":"not_ready","db":"error"}`. O README afirma, em letras garrafais, que o `/ready` responde `db: ok`. Não responde.
- No bundle publicado (`/assets/index-bWoXW8Qq.js`) a configuração embutida é `VITE_API_URL` = https://inovaapss-api.vercel.app (correto) e `VITE_SUPABASE_URL` = https://fjwetgofercholudrgod.supabase.co.
- Esse host do Supabase **não resolve mais**: `nslookup fjwetgofercholudrgod.supabase.co` devolve "Non-existent domain" e qualquer HTTP para ele dá status 000.

Consequência prática: ninguém consegue entrar. O login do front fala direto com o Supabase Auth, cujo host não existe, e a API não tem banco. A aplicação sobe, as telas desenham, e nada carrega.

Código e git:

- 98 commits na `main`, o último em 2026-09-20 13:42 -0300 — 13 dias antes de hoje. Nenhuma atividade desde então.
- Repositório **público**: github.com/Kauazxz/inovaapss-desafio, último push 2026-09-20T16:42Z.
- CI verde no último commit (run 35523575272, 1m40s). Houve uma falha de CI em 2026-09-20T16:26Z, corrigida nos commits seguintes.
- Working tree limpo, `main` igual a `origin/main`.
- Localmente a suíte inteira passa: 862 testes, mais lint, typecheck, build e `drizzle-kit check`, todos verdes. O código está em ordem; o que caiu foi a infraestrutura.
- O README descreve o estado como "Etapas 0 e 1 concluídas, motor pronto na parte pura". O código está bem mais adiante que isso — ver Pendências.

Não verificado: por que o projeto Supabase desapareceu (pausa por inatividade, exclusão manual ou outra coisa); quais são os nomes e o escopo dos dois projetos na Vercel; se a API em produção tem as chaves de IA e de e-mail configuradas; se os 3 segredos do GitHub Actions ainda valem. A aplicação também não foi exercitada de ponta a ponta — sem banco, o fluxo de login/dashboard/importação não dá para testar.

## Pendências

1. **Ressuscitar o banco.** O projeto Supabase `fjwetgofercholudrgod` não existe mais (domínio não resolve). Sem ele, nem o login nem a API funcionam. Criar um projeto novo, rodar as 6 migrations (o workflow faz isso sozinho em push que toque `supabase/`), rodar os 4 seeds, e atualizar `SUPABASE_PROJECT_ID` / `SUPABASE_DB_PASSWORD` / `SUPABASE_ACCESS_TOKEN` nos segredos do repositório e as variáveis nos dois projetos da Vercel.
2. **README e `docs/ETAPAS.md` estão atrasados em relação ao código.** O README diz "Etapas 0 e 1 concluídas" e a tabela de etapas marca 6 (preset GlobalSys), 10 (configurador de métricas) e 12 (backtest/calibração) como ⬜ a fazer — mas os três existem e têm teste: `apps/api/src/db/seed/presets/globalsys-v1.ts` com as 10 métricas, `apps/web/src/features/metric-models/` com lista e detalhe, e `apps/api/src/modules/calibration/` + `packages/engine/src/calibration/`. O README é a primeira coisa que um avaliador lê, e está subvendendo o projeto.
3. **`docs/DEPLOYMENT.md`, seção 2, está errado em duas frases**: diz que a API não foi publicada e que `VITE_API_URL` na Vercel "ainda é o padrão http://localhost:3001". A API está no ar e o bundle publicado tem a URL real. Consertar antes de entregar.
4. **`RESEND_API_KEY`, `EMAIL_FROM` e `WEB_BASE_URL` são lidas em `apps/api/src/config/env.ts` mas não aparecem no `.env.example`.** Quem seguir o modelo documentado nunca liga o envio do resumo de alertas por e-mail.
5. **O remetente padrão do e-mail é `INOVAAPPS <onboarding@resend.dev>`** (`apps/api/src/infrastructure/mailer.ts:133`), que é o sandbox do Resend e só entrega para o dono da conta. Para o resumo chegar a alguém, precisa de um domínio verificado em `EMAIL_FROM`.
6. **`SENTRY_DSN` é configuração morta.** Está declarada em `packages/validation/src/env.ts` e documentada no `.env.example`, mas nada a consome — não há dependência `@sentry` nem código que a leia. Ou liga, ou remove.
7. **Etapa 5 (SLA Engine) só existe na parte pura.** `packages/engine/src/sla/` tem consumption, policy e ticket-health com teste, mas não há `apps/api/src/modules/sla/`, nem schema de tabelas de SLA (severities, ticket_types, sla_policies, tickets), nem tela. O acoplamento ao banco está pendente.
8. **Etapa 13 (hardening) não começou.** Não existe pasta `e2e/` — o `.vercelignore` já a lista, prevendo Playwright —, nem audit logs, nem `src/db/schema/audit.ts`.
9. **Buracos de preenchimento no README**: a linha "Entrega: _a preencher_" e a tabela do time com "_a preencher_" e "Responsável: _a definir_".
10. **A branch `origin/apiAnalise` ficou para trás e nunca foi apagada** — ver Armadilhas.

## Armadilhas

- **Nada que passe pelo turbo roda nesta máquina.** `pnpm dev`, `pnpm build`, `pnpm test` e `pnpm lint` quebram porque todos são `turbo run <task>` e o Controle de Aplicativo do Windows recusa o `turbo.exe` ("Uma política de Controle de Aplicativo bloqueou este arquivo"; pelo npm vira `Error: spawn UNKNOWN`, errno -4094). O pacote `@turbo/windows-64` está instalado — é política da máquina. Contorno: `corepack pnpm -r --workspace-concurrency=1 run <task>`, buildando `packages/` antes, porque as tasks do `turbo.json` dependem de `^build`.
- **`pnpm` sozinho não existe aqui** (`pnpm: command not found`), porque nunca foi instalado global: o `docs/SPEC.md`, ajuste A9, registra que a máquina não tinha permissão de administrador para `corepack enable`. Mas o corepack 0.35.0 funciona sem enable — `corepack pnpm <cmd>` baixa o 12.4.2 do `packageManager` e roda. O Node instalado é v24.18.0 e o `.node-version` pede 22; com `engine-strict=true` e `engines: node >=22` isso passa, mas o CI usa 22, então diferença de runtime não aparece localmente.
- **A branch `origin/apiAnalise` é lixo que engana quem clona.** Ela existe, tem 7 commits que não estão na `main` e divergiu (não é ancestral). Parece o caso clássico de "trabalho perdido", mas é o contrário: a `main` está na frente, com 36 commits exclusivos, e o trabalho da `apiAnalise` já foi reimplementado nela (commits `82305a2` "bring the agent and the decision canvas from apiAnalise" e `96d227a`). A `main` é a verdade. O diff `main`→`apiAnalise` mostra 23.794 linhas que _faltariam_ se alguém "recuperasse" aquela branch.
- **`pnpm sync` publica.** O `sync.js` (e o Ctrl+Shift+B do VS Code, que roda o mesmo script) commita o que estiver pendente, dá `pull --rebase` e `push origin <branch atual>`. Como o time commita direto na `main`, isso vai para produção — e se o push tocar `supabase/`, o workflow aplica migrations no banco sozinho. Não é um comando de "salvar localmente".
- **O `commit-msg` recusa a palavra "claude" — e o arquivo se chama `CLAUDE.md`.**
  `scripts/verificar-commit.js` barra menção a ferramenta de IA com a regex
  `/(claude|anthropic|copilot|codex|chatgpt|openai|gpt-?\d|gemini|llm|...)/i`,
  além de `Co-Authored-By`, `Signed-off-by`, "Generated with" e emoji de robô.
  Consequência não óbvia: **não dá para citar o nome do arquivo `CLAUDE.md` na
  mensagem de commit** — o próprio nome dispara a regra. Descreva o conteúdo em
  vez de nomear o arquivo. O `pre-commit` também exige `pnpm` no PATH; sem ele a
  falha é `code 127`, que não diz nada sobre a causa.
- **Dois hooks do Husky bloqueiam o commit de quem clona sem configurar a identidade.** O `pre-commit` roda `scripts/verificar-autor.js`, que exige exatamente `user.name` = `Kauazxz` e `user.email` = `122256165+Kauazxz@users.noreply.github.com` (sem `--global`). O `commit-msg` roda `scripts/verificar-commit.js`, que exige Conventional Commits e recusa trailers de coautoria, "Generated with", o emoji de robô e menção a ferramenta de IA no corpo. Qualquer outra identidade é rejeitada na hora.
- **O repositório é público e o `.env` nunca vai nele** — é entregue por fora, junto com as credenciais de login da demonstração. O `.gitignore` reserva o nome `ENTREGA-LOCAL.md` com o comentário "tem credenciais, vai no pacote e nunca no repositorio" (o arquivo não existe neste clone). Se um avaliador receber só o link do GitHub, ele sobe a aplicação sem banco e sem o Agente.
- **Nunca edite uma migration já commitada e nunca mexa em `supabase/migrations/meta/`.** É por aquele journal e pelos 5 snapshots do Drizzle que o próximo `db:generate` calcula o diff; mexer ali faz o diff sair errado e o CI quebrar na hora, em dois jobs separados: `drizzle-kit check` e `scripts/verificar-migrations.js`.
- **Preencher um placeholder nas variáveis opcionais do `.env` é pior que deixar vazio** — o próprio `.env.example` avisa duas vezes. Vazio, a API responde `db: not_configured` e o front mostra "Autenticação não configurada". Com um placeholder, a API tenta conectar de verdade: o `/ready` devolve 503 e o login falha com erro de rede, o que parece bug do código e não falta de configuração.
- **As 5 suítes de integração da API passam silenciosamente sem banco** (`describe.skipIf`). São 16 testes que você acha que rodaram e não rodaram. Elas avisam no console, mas o resumo do vitest só diz "skipped" — e o CI também não as roda, porque o workflow não tem `DATABASE_URL`.
- **O `.vercelignore` exclui `supabase/migrations` do que sobe para a Vercel.** É de propósito, porque quem aplica migration é o GitHub Actions — mas significa que nenhum deploy da Vercel toca o banco. Não espere que um redeploy conserte schema.
- **A API fala com o banco como `service_role`, que ignora RLS.** O isolamento por organização é feito no middleware de tenant mais o filtro por `organization_id` em toda query; as policies da migration `...205500_auth_organizations_rls.sql` são só a segunda barreira, para quem acessar o banco direto com o JWT do usuário. Um módulo novo que esqueça o filtro vaza dados entre tenants sem o banco reclamar.
- **São dois provedores de IA para coisas diferentes, e é fácil trocar um pelo outro.** `ANTHROPIC_API_KEY` é a sugestão automática de métricas a partir de documentos (`claude-haiku-4-5-20251001`); `OPENAI_API_KEY` é o Agente IA e a leitura assistida (`gpt-4o-mini`). Sem chave nenhum dos dois quebra o sistema: a extração cai na heurística local e o Agente responde que não está configurado — o que, numa demonstração, parece feature faltando.
