# PROMPT MESTRE — INOVAAPPS / Motor Configurável de Saúde, Risco e Prioridade de Clientes

> **Uso deste arquivo:** especificação principal do projeto. Todo agente ou pessoa que for implementar uma etapa lê este arquivo inteiro antes de começar.
> **Objetivo:** implementar uma aplicação SaaS multiempresa, agnóstica quanto às métricas, capaz de configurar indicadores, calcular saúde/risco de clientes, priorizar atendimento e calibrar o modelo com histórico real de cancelamentos.
>
> **Andamento das etapas, dependências e quem está em cada uma:** [ETAPAS.md](ETAPAS.md).

---

# Ajustes do time (19/09/2026)

Decisões tomadas pelo time **por cima** da especificação original. Em caso de conflito, estes ajustes vencem.

| #   | Ajuste                                                                                                                                                                                                                                                                                         | Onde se aplica                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| A1  | **Nenhum gráfico de pizza / rosca.** Distribuições usam barras horizontais ordenadas ou barras empilhadas 100%.                                                                                                                                                                                | §39, §40, §43 — todo o frontend |
| A2  | **Gráfico de forecast priorizado** no dashboard "Em risco": ranking de clientes por prioridade com a projeção do health para o próximo período (tendência), evidenciando quem vai cruzar a faixa de Risco/Crítico primeiro. Especificação em [DATAVIZ.md](DATAVIZ.md).                         | §39                             |
| A3  | **Visualização segue os princípios de _Storytelling com Dados_** (Cole Nussbaumer Knaflic): decluttering, uma cor de destaque sobre cinza, título que diz o "e daí?", barras horizontais para ranking, linhas para tempo, anotação direta em vez de legenda. Guia em [DATAVIZ.md](DATAVIZ.md). | todo o frontend                 |
| A4  | **Importação aceita também JSON**, além de XLSX e CSV. **Documentos aceitam DOCX** (já previsto em §35) e **JSON**.                                                                                                                                                                            | §34, §35, §45 (MIME allowlist)  |
| A5  | **IA para revisão de documentos e sugestão de métricas fica para depois** (P2). O fluxo manual (§35) é entregue primeiro; a interface `MetricExtractionProvider` já nasce para receber o provider de IA sem refatoração.                                                                       | §35, §54                        |
| A6  | **Commits sempre pela conta Kauazxz**, um único autor, sem trailers `Co-Authored-By`. Hook `commit-msg` bloqueia.                                                                                                                                                                              | §48                             |
| A7  | **Trabalho por etapas com vários agentes/pessoas em paralelo.** Cada etapa declara os caminhos que possui; duas etapas só rodam juntas se não compartilham arquivos. Quadro em [ETAPAS.md](ETAPAS.md).                                                                                         | §53                             |
| A8  | **Migrations do Drizzle são geradas em `supabase/migrations/`** com prefixo compatível com a CLI do Supabase (`drizzle-kit` com `migrations.prefix = "supabase"`). O deploy continua sendo o workflow existente (`supabase db push` a cada push na `main`).                                    | §2, §50, §51                    |
| A9  | **Gerenciador de pacotes: pnpm** (via `npm install -g pnpm`; a máquina não tem permissão de administrador para `corepack enable`).                                                                                                                                                             | §2                              |

---

# 0. Instruções obrigatórias para o agente de implementação

Você é o responsável por implementar este projeto ponta a ponta.

Antes de alterar qualquer código:

1. Leia todo este arquivo.
2. Inspecione o repositório existente (`git status`, árvore de pastas, `package.json`, configs e código).
3. Preserve funcionalidades existentes que estejam corretas.
4. Não faça reescritas destrutivas sem necessidade.
5. Não use `eval`, execução arbitrária de JavaScript ou fórmulas inseguras fornecidas pelo usuário.
6. Não armazene secrets no repositório.
7. Não afirme que algo está concluído sem executar lint, typecheck, testes e build aplicáveis.
8. Trabalhe de forma incremental.
9. Após cada unidade lógica concluída: executar validações, corrigir erros, criar commit Git e fazer push se houver remoto configurado e autenticação disponível.
10. Se push/deploy não estiver disponível, não finja que foi feito. Faça o commit local e informe o bloqueio.
11. Não use `git reset --hard`, `push --force` ou operações destrutivas sem autorização explícita.
12. Use **Conventional Commits**.
13. Mantenha este documento atualizado caso uma decisão arquitetural precise mudar.

---

# 1. Visão do produto

O produto é uma plataforma SaaS de **Customer Health, Churn Intelligence e Priorização Operacional**.

A GlobalSys é o primeiro caso de uso, porém **o sistema não pode ser desenvolvido preso às métricas da GlobalSys**.

Princípio central:

> **A GlobalSys é uma configuração do sistema, não o sistema.**

Uma organização assinante poderá:

- criar sua conta;
- cadastrar usuários internos;
- cadastrar as empresas/clientes que compõem sua carteira;
- cadastrar contratos e planos;
- importar dados manualmente ou em massa;
- subir planilhas, CSVs e documentos;
- configurar métricas;
- editar pesos, fórmulas, limites e gatilhos;
- visualizar saúde de cada cliente;
- identificar clientes em deterioração;
- entender as evidências de cada alerta;
- receber recomendações de ação;
- ordenar clientes por prioridade de atuação;
- calibrar o modelo com cancelamentos históricos;
- usar um modelo de métricas próprio, diferente da GlobalSys.

O teste funcional principal é:

> Ao abrir a solução, o gestor deve conseguir responder rapidamente:
>
> 1. **Com quem falar?**
> 2. **Por quê?**
> 3. **Em que ordem?**
> 4. **O que fazer?**

---

# 2. Stack obrigatória

## Backend

- Node.js
- TypeScript
- Express
- PostgreSQL via Supabase
- Supabase Auth
- Supabase Storage
- Drizzle ORM + migrations
- Zod
- Pino
- Vitest
- Supertest

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Router
- TanStack Query
- React Hook Form
- Zod
- Recharts
- Lucide Icons

## Tooling / Infra

- pnpm
- monorepo com workspaces
- Turborepo
- ESLint
- Prettier
- Husky
- lint-staged
- GitHub Actions
- Vercel para frontend
- Railway ou Render para API Express
- Supabase para PostgreSQL/Auth/Storage
- Dockerfile para API
- OpenAPI/Swagger para documentação da API

Bibliotecas auxiliares permitidas quando necessárias:

- `date-fns`
- `xlsx`
- `papaparse`
- `json-logic-js` ou DSL equivalente segura
- `decimal.js`

Nunca implementar fórmulas configuráveis por `eval`.

---

# 3. Arquitetura

Usar **MVC modular**.

Estrutura sugerida:

```text
/
├─ apps/
│  ├─ web/
│  │  └─ src/
│  │     ├─ components/
│  │     ├─ features/
│  │     ├─ pages/
│  │     ├─ routes/
│  │     ├─ hooks/
│  │     ├─ lib/
│  │     └─ types/
│  └─ api/
│     └─ src/
│        ├─ modules/
│        │  ├─ auth/
│        │  ├─ organizations/
│        │  ├─ portfolio-clients/
│        │  ├─ contracts/
│        │  ├─ metrics/
│        │  ├─ scoring/
│        │  ├─ sla/
│        │  ├─ imports/
│        │  ├─ documents/
│        │  ├─ alerts/
│        │  ├─ recommendations/
│        │  └─ calibration/
│        ├─ middleware/
│        ├─ infrastructure/
│        ├─ shared/
│        └─ app.ts
├─ packages/
│  ├─ shared/
│  ├─ validation/
│  └─ config/
├─ supabase/migrations/
├─ docs/
└─ .github/workflows/
```

Dentro de cada módulo da API:

```text
module/
├─ controller.ts
├─ service.ts
├─ repository.ts
├─ routes.ts
├─ schema.ts
├─ types.ts
└─ __tests__/
```

Regras:

- controller sem regra de negócio;
- service concentra casos de uso;
- repository concentra persistência;
- validação com Zod;
- regras de score devem ser puras/testáveis;
- frontend por features.

---

# 4. Modelo multiempresa

Usar os conceitos:

## Organization

Empresa assinante/gestora.

## Organization User

Usuário interno. Papéis:

```text
owner
admin
analyst
viewer
```

## Portfolio Client

Empresa/cliente monitorado.

## Contract

Contrato do cliente monitorado.

## Plan

Plano/nível de atendimento do contrato.

Fluxo:

```text
ORGANIZATION
    ↓
ORGANIZATION USERS
    ↓
PORTFOLIO CLIENTS
    ↓
CONTRACTS / PLANS
    ↓
METRICS
    ↓
METRIC VALUES
    ↓
HEALTH SCORE
    ↓
RISK
    ↓
PRIORITY
```

Todas as tabelas de negócio devem pertencer a um tenant.

---

# 5. Auth e segurança multi-tenant

Usar Supabase Auth.

Fluxo:

1. login;
2. frontend recebe sessão;
3. API valida JWT;
4. identifica tenant;
5. aplica RBAC;
6. impede acesso cruzado.

Obrigatório:

- login/logout;
- recuperação de senha;
- rotas protegidas;
- RLS;
- audit log para alterações críticas;
- `service_role_key` somente no backend.

---

# 6. Conceito central: tudo é métrica

O sistema deve conhecer **tipos de métricas**, não apenas nomes específicos.

Tipos iniciais:

```text
TIME
PERCENTAGE
QUANTITY
FREQUENCY
FINANCIAL
VARIATION
SCORE
BOOLEAN
CATEGORY
DATE_DEADLINE
```

Cada métrica deverá permitir:

- nome;
- descrição;
- categoria;
- tipo;
- unidade;
- direção;
- fonte;
- periodicidade;
- peso;
- normalização;
- thresholds;
- gatilhos;
- fórmula segura;
- configuração atual/tendência/persistência;
- ativação/desativação.

Direções:

```text
HIGHER_IS_BETTER
HIGHER_IS_WORSE
TARGET_RANGE
CUSTOM
```

Fontes:

```text
MANUAL
CSV
XLSX
JSON
API
DOCUMENT
DERIVED
```

---

# 7. Score de saúde 0–100

**Regra oficial:**

```text
100 = situação saudável / ideal
0   = situação extremamente preocupante
```

Classificação inicial:

| Health Score | Classe  |
| -----------: | ------- |
|       80–100 | Normal  |
|        60–79 | Atenção |
|        40–59 | Risco   |
|         0–39 | Crítico |

As faixas devem ser configuráveis.

---

# 8. Componentes do score de cada métrica

Cada métrica produz:

- `current_health` — situação atual;
- `trend_health` — tendência;
- `persistence_health` — persistência.

Default inicial:

```text
current_weight     = 45%
trend_weight       = 35%
persistence_weight = 20%
```

Fórmula:

```text
metric_health =
    current_health * 0.45
  + trend_health * 0.35
  + persistence_health * 0.20
```

Se um componente não puder ser calculado, redistribuir pesos entre componentes válidos e reduzir a confiança.

---

# 9. Normalização genérica

Implementar estratégias extensíveis:

```text
THRESHOLD_BANDS
LINEAR_RANGE
RATIO_TO_TARGET
BASELINE_DEVIATION
BOOLEAN_MAP
SCORE_MAP
CUSTOM_SAFE_RULE
```

## BASELINE_DEVIATION

Comparar o valor atual com o histórico do próprio cliente. Preferir rolling median quando houver outliers.

## CUSTOM_SAFE_RULE

Usar JSON Logic ou DSL restrita. Nunca `eval`.

---

# 10. Tendência

Default:

```text
janela de 3 períodos
```

Suportar:

- delta absoluto;
- delta percentual;
- média móvel;
- slope;
- comparação com baseline.

Sempre respeitar a direção da métrica.

---

# 11. Persistência

Default:

```text
janela de 3 períodos
```

Estratégia inicial:

```text
persistence_health =
  100 * (1 - unhealthy_periods / evaluated_periods)
```

Evolução futura pode ponderar severidade e recência.

---

# 12. Preset GlobalSys v1

| Ordem | Métrica                                            |     Peso |
| ----: | -------------------------------------------------- | -------: |
|     1 | Chamados críticos                                  |      18% |
|     2 | Tempo de resolução × SLA contratado + status/plano |      16% |
|     3 | Uso da plataforma                                  |      14% |
|     4 | Cumprimento de SLA                                 |      12% |
|     5 | Chamados reabertos                                 |      10% |
|     6 | Reclamações formais                                |       9% |
|     7 | Chamados abertos                                   |       7% |
|     8 | Atraso de pagamento                                |       6% |
|     9 | Reuniões não realizadas                            |       5% |
|    10 | Insatisfação / NPS                                 |       3% |
|       | **TOTAL**                                          | **100%** |

Esses pesos são iniciais e devem ser calibráveis.

---

# 13. Métrica 1 — Chamados críticos — 18%

Dados:

```text
critical_tickets
open_tickets
```

Derivado:

```text
critical_ticket_rate =
  critical_tickets / max(open_tickets, 1) * 100
```

Analisar:

- quantidade atual;
- média histórica;
- taxa;
- crescimento;
- tendência;
- persistência.

Direção:

```text
HIGHER_IS_WORSE
```

Usar `BASELINE_DEVIATION` + thresholds configuráveis.

---

# 14. Métrica 2 — Tempo de resolução × SLA + status/plano — 16%

Esta métrica funciona por chamado.

## SLA aplicável

Descobrir:

```text
client
+ contract
+ plan
+ severity
+ ticket_type
= applicable_sla
```

## SLA contratual

```text
contractual_sla_minutes
```

## Meta Operacional Sugerida

Na UI: `Meta Operacional Sugerida`.

Tipos:

```text
PERCENT_OF_SLA
ABSOLUTE_MINUTES
```

Exemplo:

```text
SLA contratual = 120 min
Meta = 10%
Meta operacional = 12 min
```

A meta não altera o contrato; serve para antecipar a prioridade operacional.

## Consumo contratual

```text
contract_sla_consumption =
  elapsed_minutes / contractual_sla_minutes * 100
```

## Consumo da meta

```text
operational_target_consumption =
  elapsed_minutes / operational_target_minutes * 100
```

## Health inicial do chamado

```text
weighted_consumption =
    min(contract_sla_consumption, 100) * 0.60
  + min(operational_target_consumption, 100) * 0.40

ticket_sla_health =
  clamp(100 - weighted_consumption, 0, 100)
```

60/40 é configuração inicial e calibrável.

Status mínimos:

```text
OPEN
IN_PROGRESS
WAITING_CUSTOMER
WAITING_INTERNAL
RESOLVED
CLOSED
CANCELLED
```

Para chamado aberto, usar `now - opened_at`.
Para resolvido, usar `resolved_at - opened_at`.

Metas por plano/severidade devem ser configuráveis. Exemplo apenas ilustrativo:

| Severidade | Meta operacional |
| ---------- | ---------------: |
| Crítica    |              10% |
| Alta       |              20% |
| Média      |              40% |
| Baixa      |              60% |

Nunca hardcodar esses percentuais.

---

# 15. Métrica 3 — Uso da plataforma — 14%

Direção:

```text
HIGHER_IS_BETTER
```

Dado:

```text
platform_usage_pct
```

Avaliar:

- valor atual;
- rolling 3 períodos;
- baseline histórico;
- variação;
- tendência;
- sequência de queda.

Preferir `BASELINE_DEVIATION`.

---

# 16. Métrica 4 — Cumprimento de SLA — 12%

Direção:

```text
HIGHER_IS_BETTER
```

Dados:

```text
tickets_within_sla
resolved_tickets
pct_sla_compliance
```

Se necessário:

```text
sla_compliance_pct =
  tickets_within_sla / max(resolved_tickets, 1) * 100
```

Diferença para Métrica 2:

- Métrica 2 = prazo por ticket;
- Métrica 4 = performance agregada do cliente.

---

# 17. Métrica 5 — Chamados reabertos — 10%

Direção:

```text
HIGHER_IS_WORSE
```

```text
reopen_rate =
  reopened_tickets / max(open_tickets, 1) * 100
```

Avaliar quantidade, taxa, crescimento, histórico e persistência.

---

# 18. Métrica 6 — Reclamações formais — 9%

Direção:

```text
HIGHER_IS_WORSE
```

Dado:

```text
formal_complaints
```

Avaliar quantidade, recorrência, crescimento, baseline e meses consecutivos.

---

# 19. Métrica 7 — Chamados abertos — 7%

Direção:

```text
HIGHER_IS_WORSE
```

Dado:

```text
open_tickets
```

Não usar valor absoluto universal. Comparar com baseline do próprio cliente.

---

# 20. Métrica 8 — Atraso de pagamento — 6%

Direção:

```text
HIGHER_IS_WORSE
```

Dado:

```text
payment_delay_days
```

Avaliar atraso atual, média, máximo, recorrência, crescimento e persistência.

---

# 21. Métrica 9 — Reuniões não realizadas — 5%

Direção:

```text
HIGHER_IS_WORSE
```

Dados:

```text
meetings_planned
meetings_completed
```

Fórmula:

```text
if meetings_planned == 0:
    N/A
else:
    missed_meeting_rate =
      (meetings_planned - meetings_completed)
      / meetings_planned
      * 100
```

Se não havia reunião prevista, não classificar como saudável nem crítico; usar N/A.

---

# 22. Métrica 10 — Insatisfação / NPS — 3%

Dados:

```text
nps_answered
nps_score
```

Quando respondeu:

```text
nps_health = clamp(nps_score * 10, 0, 100)
```

Quando não respondeu:

- `nps_answered = false` é comportamento válido;
- analisar histórico de resposta;
- sequência sem responder;
- mudança de comportamento;
- nunca transformar automaticamente em zero.

---

# 23. Evitar dupla contagem

Não criar peso próprio para:

- `tickets_within_sla` se já compõe Cumprimento SLA;
- `nps_classification` se deriva da nota;
- reuniões previstas e realizadas separadamente.

---

# 24. Score geral

```text
overall_health =
  sum(metric_health_i * metric_weight_i)
  /
  sum(metric_weight_i_available)
```

Escala 0–100, maior = melhor.

---

# 25. Confiança da análise

Dado ausente nunca significa saudável.

Criar:

```text
analysis_confidence
```

Inicialmente:

```text
weighted_coverage =
  sum(weight_i * availability_i)
  /
  sum(weight_i)

analysis_confidence = weighted_coverage * 100
```

`availability_i` pode considerar existência e freshness.

Exibir separadamente:

```text
Health: 48/100 — Risco
Confiança: 91%
```

---

# 26. Risco complementar

```text
risk_score = 100 - overall_health
```

Não armazenar risco e saúde como verdades independentes conflitantes.

---

# 27. Gatilhos críticos

Peso e gatilho são diferentes.

Exemplos:

```text
ticket crítico > 120% SLA
3 tickets críticos reincidentes
condição contratual específica
```

Gatilho pode gerar alerta imediato, elevar prioridade ou definir `priority_floor`, sem precisar distorcer todo o health score.

---

# 28. Prioridade de atendimento

Saúde/risco e prioridade são conceitos diferentes.

Criar:

```text
commercial_impact_score
```

Pode considerar:

- valor mensal;
- importância estratégica;
- plano;
- porte;
- critérios configuráveis.

Fórmula inicial provisória:

```text
priority_score =
    risk_score * 0.70
  + commercial_impact_score * 0.30
```

Classificação sugerida:

| Priority | Classe        |
| -------: | ------------- |
|   85–100 | P0 — Imediata |
|    70–84 | P1 — Alta     |
|    50–69 | P2 — Média    |
|     0–49 | P3 — Normal   |

Tudo configurável.

---

# 29. Evidências

Todo score deve ser explicável.

Para cada driver guardar:

```text
metric_id
metric_name
current_value
baseline_value
delta
trend
health_score
weight
contribution
human_explanation
```

Exemplo:

```text
SLA caiu 24 p.p. em 3 meses
Uso caiu 19% em relação ao baseline
Taxa de reabertura dobrou
2 reuniões previstas não ocorreram
```

---

# 30. Recomendações

Cada métrica pode ter playbooks configuráveis.

Exemplos:

- SLA → revisar causas de estouro;
- reabertura → análise de causa raiz;
- uso → revisar adoção;
- NPS → contato de relacionamento;
- reuniões → reagendar acompanhamento.

---

# 31. Versionamento do modelo

Criar:

```text
metric_model
metric_model_version
```

Exemplo:

```text
GlobalSys v1
GlobalSys v2
```

Score snapshot deve guardar a versão usada.

Mudanças de peso/faixa nunca apagam histórico.

---

# 32. Modos de peso

```text
MANUAL
ASSISTED
AUTOMATIC
```

Para hackathon, preferir:

```text
ASSISTED
```

---

# 33. Calibração com histórico

Criar módulo de backtest.

Testar janelas:

```text
30 dias
60 dias
90 dias
```

Medir:

```text
precision
recall
false_positive_rate
lead_time
precision_at_5
precision_at_10
```

Não usar somente accuracy.

Em modo Assisted, mostrar:

```text
Peso atual
Peso sugerido
Diferença
Impacto no desempenho
```

Usuário precisa aprovar antes de criar/ativar nova versão.

---

# 34. Importação de dados

Suportar inicialmente:

```text
XLSX
CSV
JSON
```

Fluxo:

```text
Upload
→ leitura
→ detecção de colunas
→ mapeamento
→ validação
→ preview
→ confirmação
→ importação
→ recálculo
```

Exibir:

- linhas válidas;
- inválidas;
- duplicidades;
- campos ausentes;
- erros.

Criar `import_job` e `import_row_error`.

---

# 35. Documentos e descoberta de métricas

Uma nova empresa poderá enviar:

- PDF;
- DOCX;
- XLSX;
- CSV;
- JSON;
- Markdown/TXT;
- contratos;
- manuais de KPI;
- relatórios;
- política de SLA.

Fluxo:

```text
Documento
→ extração
→ sugestão de métricas
→ sugestão de tipo
→ sugestão de direção
→ sugestão de fórmula
→ sugestão de thresholds
→ sugestão de peso
→ revisão humana
→ ativação
```

A IA nunca ativa uma métrica automaticamente.

Criar interface:

```text
MetricExtractionProvider
```

Implementações:

```text
ManualMetricExtractionProvider
AnthropicMetricExtractionProvider (opcional — ver ajuste A5: fica para depois)
```

Se usar Anthropic:

- API key apenas no backend;
- output estruturado;
- validar com Zod;
- não logar conteúdo sensível.

Sem API de IA configurada, o sistema continua funcional em modo manual.

---

# 36. Banco de dados — entidades mínimas

## organizations

```text
id
name
slug
created_at
updated_at
```

## organization_users

```text
id
organization_id
auth_user_id
role
created_at
```

## portfolio_clients

```text
id
organization_id
external_code
name
segment
size
status
strategic_importance
created_at
updated_at
```

## plans

```text
id
organization_id
name
description
created_at
```

## contracts

```text
id
organization_id
portfolio_client_id
plan_id
monthly_value
currency
start_date
end_date
status
created_at
updated_at
```

## ticket_severities

```text
id
organization_id
name
rank
is_active
```

## ticket_types

```text
id
organization_id
name
is_active
```

## sla_policies

```text
id
organization_id
plan_id
severity_id
ticket_type_id
contractual_sla_minutes
operational_target_type
operational_target_value
is_active
valid_from
valid_to
```

## tickets

```text
id
organization_id
portfolio_client_id
contract_id
severity_id
ticket_type_id
external_code
status
opened_at
resolved_at
closed_at
created_at
updated_at
```

## metric_definitions

```text
id
organization_id
name
slug
description
category
metric_type
unit
direction
periodicity
source_type
is_active
created_at
updated_at
```

## metric_models

```text
id
organization_id
name
mode
is_active
created_at
```

## metric_model_versions

```text
id
metric_model_id
version
status
effective_from
created_at
```

## metric_model_items

```text
id
metric_model_version_id
metric_definition_id
weight
current_weight
trend_weight
persistence_weight
normalization_strategy
normalization_config_json
threshold_config_json
critical_trigger_config_json
formula_config_json
```

## metric_values

```text
id
organization_id
portfolio_client_id
metric_definition_id
period_start
period_end
raw_value_numeric
raw_value_text
source
source_reference
recorded_at
```

## metric_score_snapshots

```text
id
organization_id
portfolio_client_id
metric_definition_id
metric_model_version_id
period_end
current_health
trend_health
persistence_health
metric_health
confidence
explanation_json
created_at
```

## client_score_snapshots

```text
id
organization_id
portfolio_client_id
metric_model_version_id
period_end
overall_health
risk_score
analysis_confidence
commercial_impact_score
priority_score
health_class
priority_class
created_at
```

## alerts

```text
id
organization_id
portfolio_client_id
metric_definition_id nullable
type
severity
status
title
description
triggered_at
resolved_at
metadata_json
```

## recommendations

```text
id
organization_id
metric_definition_id nullable
trigger_type
title
description
priority
is_active
```

## client_recommendations

```text
id
organization_id
portfolio_client_id
recommendation_id
alert_id nullable
status
created_at
completed_at
```

## import_jobs

```text
id
organization_id
file_path
file_type
status
mapping_json
summary_json
created_at
finished_at
```

## import_row_errors

```text
id
import_job_id
row_number
error_code
message
raw_data_json
```

## uploaded_documents

```text
id
organization_id
storage_path
file_name
mime_type
status
created_at
```

## metric_extraction_suggestions

```text
id
uploaded_document_id
organization_id
suggested_name
suggested_type
suggested_direction
suggested_weight
suggested_formula_json
suggested_thresholds_json
confidence
status
reviewed_by
reviewed_at
```

## calibration_runs

```text
id
organization_id
metric_model_version_id
window_days
status
parameters_json
results_json
created_at
finished_at
```

## audit_logs

```text
id
organization_id
auth_user_id
entity_type
entity_id
action
before_json
after_json
created_at
```

Adicionar índices, FKs e constraints adequados.

---

# 37. API — rotas mínimas

Prefixo:

```text
/api/v1
```

## Session

```text
GET /me
```

## Organization

```text
GET   /organizations/current
PATCH /organizations/current
GET   /organizations/current/users
POST  /organizations/current/users
```

## Clients

```text
GET    /clients
POST   /clients
GET    /clients/:id
PATCH  /clients/:id
DELETE /clients/:id
GET    /clients/:id/history
GET    /clients/:id/scores
GET    /clients/:id/evidence
GET    /clients/:id/recommendations
```

## Contracts / Plans

```text
GET/POST/PATCH /plans
GET/POST/PATCH /contracts
```

## SLA

```text
GET/POST/PATCH /sla-policies
GET /tickets/:id/sla
```

## Metrics

```text
GET    /metrics
POST   /metrics
GET    /metrics/:id
PATCH  /metrics/:id
DELETE /metrics/:id
POST   /metrics/:id/preview-score
```

## Metric Models

```text
GET  /metric-models
POST /metric-models
GET  /metric-models/:id
POST /metric-models/:id/versions
POST /metric-models/:id/versions/:version/activate
POST /metric-models/:id/rebalance
```

## Scoring

```text
POST /scoring/recalculate
POST /scoring/recalculate/:clientId
GET  /scoring/portfolio
```

## Imports

```text
POST /imports
GET  /imports/:id
POST /imports/:id/preview
POST /imports/:id/confirm
```

## Documents

```text
POST /documents
GET  /documents/:id
POST /documents/:id/extract-metrics
GET  /documents/:id/suggestions
POST /metric-suggestions/:id/accept
POST /metric-suggestions/:id/reject
```

## Dashboard

```text
GET /dashboard/risk
GET /dashboard/general
GET /dashboard/metrics
GET /dashboard/priority
```

## Calibration

```text
POST /calibration/runs
GET  /calibration/runs
GET  /calibration/runs/:id
POST /calibration/runs/:id/apply-suggestions
```

---

# 38. Frontend — rotas/telas

Públicas:

```text
/login
/forgot-password
```

Privadas:

```text
/dashboard
/clients
/clients/:id
/metrics
/metrics/:id
/metric-models
/metric-models/:id
/import
/documents
/alerts
/calibration
/settings
```

---

# 39. Dashboard principal

Duas abas:

```text
Em risco
Geral
```

## Em risco

Deve responder:

```text
quem falar
por quê
em que ordem
o que fazer
```

Exibir:

- clientes ativos;
- clientes críticos;
- clientes em risco;
- MRR em risco;
- ranking por prioridade;
- health;
- risk;
- confidence;
- valor mensal;
- evidências;
- CTA para análise;
- **gráfico de forecast priorizado** (ajuste A2 — ver [DATAVIZ.md](DATAVIZ.md)).

Tabela:

```text
Prioridade
Cliente
Health
Risco
Confiança
Valor mensal
Principal evidência
Ação
```

## Geral

Exibir:

- distribuição Normal/Atenção/Risco/Crítico (**barras, nunca pizza** — ajuste A1);
- MRR;
- ativos;
- cancelados;
- saúde por dimensão;
- evolução temporal;
- filtros.

---

# 40. Visão individual do cliente

Cabeçalho:

```text
Nome
Plano
Contrato
MRR
Health Score
Risk Score
Priority Score
Confiança
```

Abas:

```text
Visão geral
Atendimento
SLA
Uso
NPS
Financeiro
Reuniões
Histórico
```

Mostrar os 10 scores, tendências, evidências, recomendações e timeline.

---

# 41. Configurador de métricas

Tabela:

```text
Ativa
Ordem
Métrica
Tipo
Peso empresa
Peso sugerido
Peso final
Direção
Normalização
Status
```

Ações:

```text
Adicionar
Editar
Excluir
Reordenar
Redistribuir pesos
Simular
Salvar nova versão
Ativar versão
```

Pesos ativos precisam totalizar 100% para ativar um modelo fechado.

Nunca redistribuir silenciosamente.

---

# 42. Configurador de SLA

Configurar por:

```text
Plano
Severidade
Tipo de chamado
SLA contratual
Meta operacional
Tipo da meta (% / minutos)
Validade
```

Mostrar preview do cálculo.

---

# 43. Calibração UI

Exibir:

- janela;
- cancelamentos analisados;
- precision;
- recall;
- FPR;
- lead time;
- precision@5;
- precision@10.

Tabela:

```text
Métrica
Peso atual
Peso sugerido
Importância histórica
Mudança sugerida
```

Botões:

```text
Aceitar individualmente
Aceitar todas
Manter atuais
Criar nova versão
```

Nunca alterar versão ativa sem confirmação.

---

# 44. Preset GlobalSys e dataset

Criar seed/configuração inicial GlobalSys v1.

Se `INOVAAPPS_base_de_dados.xlsx` estiver disponível, criar importador compatível.

Não inventar resultados caso a planilha não exista no ambiente.

A calibração dos 22 cancelamentos deve usar dados reais quando fornecidos.

---

# 45. Segurança

Obrigatório:

- RBAC;
- RLS;
- Zod;
- Helmet;
- CORS restritivo;
- rate limiting;
- logs sem secrets;
- MIME allowlist (XLSX, CSV, JSON, PDF, DOCX, Markdown/TXT);
- limite de upload;
- nenhum `eval`;
- audit log para peso/threshold/modelo/SLA.

---

# 46. Observabilidade

Implementar:

- Pino;
- request id;
- logs estruturados;
- `/health`;
- `/ready`.

Opcional:

- Sentry;
- OpenTelemetry.

---

# 47. Testes

## Unitários

Cobrir:

- normalização;
- tendência;
- persistência;
- metric health;
- overall health;
- confidence;
- risk complement;
- priority;
- SLA contractual consumption;
- operational target;
- weight rebalancing;
- missing data;
- NPS sem resposta;
- meetings planned = 0;
- triggers.

## Integração

Cobrir:

- auth;
- tenant isolation;
- CRUD métricas;
- model versioning;
- import;
- recalculation;
- dashboard.

## E2E

Usar Playwright para:

```text
login
criar cliente
importar dados
ver score
editar peso
salvar nova versão
ver dashboard atualizar
```

---

# 48. CI/CD e commits automáticos

Fazer commit **após cada unidade lógica concluída**, não a cada tecla.

Antes de cada commit executar:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Conventional Commits.

Exemplos:

```text
chore(repo): initialize monorepo and tooling
feat(auth): add supabase authentication and tenant guard
feat(db): add organization and client schema
feat(metrics): implement configurable metric definitions
feat(scoring): add health normalization engine
feat(sla): add contractual and operational sla scoring
feat(globalsys): add GlobalSys metric preset
feat(imports): add xlsx and csv import workflow
feat(dashboard): add risk and general portfolio views
feat(calibration): add historical backtest
ci: add validation and preview deployment workflows
```

Husky + lint-staged para validações rápidas.

Ajuste A6: um único autor (Kauazxz), sem trailers `Co-Authored-By`. O hook `commit-msg` rejeita.

---

# 49. Branches

Sugestão:

```text
main      = produção
develop   = staging
feature/* = funcionalidades
fix/*     = correções
```

Para hackathon, `main + feature/*` é aceitável.

Sem force push.

---

# 50. Deploy contínuo

Objetivo:

> Cada push deve gerar visualização atualizada automaticamente.

## Frontend

Vercel conectado ao GitHub:

- PR/branch → Preview Deployment;
- `develop` → staging;
- `main` → produção.

## API

Railway ou Render:

- deploy automático após CI verde;
- staging separado quando possível.

## Banco

Supabase com migrations versionadas.

Não executar migrations destrutivas automaticamente sem proteção.

Pipeline:

```text
lint
→ typecheck
→ tests
→ build
→ migration check
→ deploy API
→ deploy web
```

---

# 51. GitHub Actions

Criar `ci.yml` para `push` e `pull_request`:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Criar validação de migrations.

Preferir integrações nativas Vercel/Railway/Render para deploy.

---

# 52. Variáveis de ambiente

Criar `.env.example`:

```text
NODE_ENV
PORT
CORS_ORIGINS
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_URL
ANTHROPIC_API_KEY
SENTRY_DSN
```

Nunca commitar valores reais.

---

# 53. Etapas de implementação

## Etapa 0 — Auditoria e fundação

Entregáveis:

- inspecionar repo;
- monorepo;
- TypeScript;
- pnpm;
- Turbo;
- lint;
- prettier;
- Husky;
- CI inicial;
- env example.

Commit:

```text
chore(repo): initialize project foundation
```

## Etapa 1 — Auth + multi-tenant

Entregáveis:

- Supabase Auth;
- Organization;
- Organization Users;
- RBAC;
- tenant middleware;
- login;
- layout privado.

Commit:

```text
feat(auth): add multi-tenant authentication and authorization
```

## Etapa 2 — Clientes, planos e contratos

Entregáveis:

- CRUD portfolio clients;
- plans;
- contracts;
- valor mensal;
- segmento;
- porte;
- status.

Commit:

```text
feat(clients): add portfolio clients contracts and plans
```

## Etapa 3 — Motor genérico de métricas

Entregáveis:

- metric definitions;
- metric types;
- direction;
- weight;
- normalization;
- thresholds;
- triggers;
- versioning.

Commit:

```text
feat(metrics): implement configurable metric model
```

## Etapa 4 — Scoring Engine

Entregáveis:

- current health;
- trend;
- persistence;
- metric health;
- overall health;
- confidence;
- risk complement;
- classifications.

Commit:

```text
feat(scoring): implement health and risk scoring engine
```

## Etapa 5 — SLA Engine

Entregáveis:

- severities;
- ticket types;
- policies;
- contractual SLA;
- operational target;
- consumption;
- ticket SLA health.

Commit:

```text
feat(sla): add contractual and operational sla engine
```

## Etapa 6 — Preset GlobalSys

Entregáveis:

- 10 métricas;
- pesos iniciais;
- seed/config;
- playbooks.

Commit:

```text
feat(globalsys): add GlobalSys v1 metric preset
```

## Etapa 7 — Importador

Entregáveis:

- XLSX;
- CSV;
- JSON;
- mapping;
- validação;
- preview;
- import job;
- relatório de erro.

Commit:

```text
feat(imports): add validated bulk data import
```

## Etapa 8 — Dashboard

Entregáveis:

- Em risco;
- Geral;
- ranking;
- health/risk/confidence;
- evidências;
- drill-down;
- gráfico de forecast priorizado (A2).

Commit:

```text
feat(dashboard): add portfolio risk and general dashboards
```

## Etapa 9 — Cliente individual

Entregáveis:

- overview;
- abas;
- histórico;
- timeline;
- evidências;
- recomendações.

Commit:

```text
feat(client-health): add detailed client health workspace
```

## Etapa 10 — Configurador

Entregáveis:

- editor de métricas;
- pesos;
- thresholds;
- gatilhos;
- versionamento;
- simulação.

Commit:

```text
feat(metric-config): add visual metric model configurator
```

## Etapa 11 — Documentos + descoberta

Entregáveis:

- upload (PDF, DOCX, XLSX, CSV, JSON, MD/TXT);
- storage;
- fluxo manual;
- provider de IA opcional (A5: depois);
- sugestões;
- aprovação/rejeição.

Commit:

```text
feat(metric-discovery): add document based metric suggestions
```

## Etapa 12 — Backtest e calibração

Entregáveis:

- janelas históricas;
- precision;
- recall;
- FPR;
- lead time;
- precision@5/10;
- pesos sugeridos;
- aprovação assistida.

Commit:

```text
feat(calibration): add historical churn backtesting
```

## Etapa 13 — Hardening

Entregáveis:

- audit logs;
- rate limits;
- observability;
- E2E;
- acessibilidade;
- empty/loading/error states.

Commit:

```text
chore(hardening): improve security reliability and test coverage
```

## Etapa 14 — Deploy e demo

Entregáveis:

- Vercel;
- API deploy;
- CI;
- seed demo;
- README;
- docs;
- OpenAPI.

Commit:

```text
ci(deploy): finalize continuous preview and production deployment
```

---

# 54. Prioridade para hackathon

## P0

1. Login
2. Multiempresa
3. Clientes
4. Importação do dataset
5. 10 métricas
6. Health Score
7. Risk Score
8. Confidence
9. Priority
10. Dashboard Em risco
11. Cliente individual
12. Evidências

## P1

13. Configurador de pesos
14. SLA operacional
15. Dashboard Geral
16. Backtest
17. Recomendações

## P2

18. Document AI
19. Automação avançada
20. Integrações externas

Não sacrificar P0 para construir P2.

---

# 55. Critérios de aceite do motor

- [ ] health vai de 0 a 100;
- [ ] 100 significa saudável;
- [ ] 0 significa crítico;
- [ ] risco = `100 - health`;
- [ ] pesos configuráveis;
- [ ] GlobalSys v1 soma 100%;
- [ ] tendência calculada;
- [ ] persistência calculada;
- [ ] ausência de dado reduz confiança;
- [ ] NPS sem resposta não vira ausência automática;
- [ ] reuniões previstas = 0 retorna N/A;
- [ ] SLA contratual e meta operacional são distintos;
- [ ] meta operacional aceita % ou minutos;
- [ ] gatilho crítico é separado de peso;
- [ ] prioridade é separada de risco;
- [ ] score possui evidências;
- [ ] modelo é versionado;
- [ ] backtest não altera modelo ativo sem aprovação.

---

# 56. Critérios de aceite do produto

- [ ] autenticação;
- [ ] isolamento por tenant;
- [ ] cadastro de cliente;
- [ ] contrato/plano;
- [ ] importação XLSX/CSV/JSON;
- [ ] configuração de métricas;
- [ ] edição de pesos;
- [ ] simulação de score;
- [ ] versionamento;
- [ ] Dashboard Em risco;
- [ ] Dashboard Geral;
- [ ] visão individual;
- [ ] evidências;
- [ ] recomendações;
- [ ] confiança;
- [ ] prioridade;
- [ ] preview deploy;
- [ ] CI verde;
- [ ] README reproduz setup.

---

# 57. Regras de UX

A interface deve ser:

- limpa;
- rápida;
- desktop-first e responsiva;
- sem excesso de cards;
- operacional.

Nunca mostrar score sem contexto.

Sempre que possível exibir:

```text
Score
Classe
Tendência
Confiança
Principais motivos
Ação sugerida
```

Gráficos seguem [DATAVIZ.md](DATAVIZ.md) (ajustes A1–A3).

---

# 58. Explicabilidade

Nunca mostrar apenas:

```text
Risco = 83
```

Mostrar:

```text
Health: 28/100 — Crítico
Risk: 72/100
Confiança: 94%

Principais drivers:
1. Chamados críticos aumentaram 180% em 3 meses.
2. Cumprimento de SLA caiu 21 p.p.
3. Uso está 24% abaixo do baseline.
4. Duas reuniões previstas não ocorreram.
```

---

# 59. Regras de histórico e leakage

Ao backtestar período `t`, usar somente dados conhecidos até `t`.

Cancelamento é target de validação, não métrica de entrada.

Nunca usar status futuro para calcular score passado.

---

# 60. Documentação obrigatória

Criar:

```text
README.md
docs/ARCHITECTURE.md
docs/METRICS_ENGINE.md
docs/SLA_ENGINE.md
docs/SCORING.md
docs/IMPORTS.md
docs/DEPLOYMENT.md
docs/CALIBRATION.md
docs/DATAVIZ.md
docs/ETAPAS.md
```

Swagger/OpenAPI em desenvolvimento:

```text
/api/docs
```

---

# 61. Paginação, filtros e busca

Listas devem suportar:

```text
page
pageSize
search
sort
order
filters
```

Clientes:

```text
health_class
priority_class
plan
segment
size
status
```

---

# 62. Performance

Não recalcular histórico inteiro a cada request.

Usar snapshots:

```text
metric_score_snapshots
client_score_snapshots
```

Recalcular quando:

- chega novo dado;
- configuração muda;
- usuário solicita;
- job agendado executa.

Dashboard lê snapshots.

---

# 63. Jobs

Arquitetar interfaces:

```text
ScoringJob
ImportJob
CalibrationJob
MetricExtractionJob
```

Evitar Redis prematuramente. Se fila for necessária, preferir solução simples compatível com Postgres/Supabase.

---

# 64. Seeds

Criar:

- Organization demo;
- preset GlobalSys v1;
- severidades;
- ticket types;
- alguns clientes de demonstração.

Nunca commitar senhas.

---

# 65. Decisões configuráveis

Não hardcodar:

- pesos;
- limites;
- faixas;
- SLA;
- meta operacional;
- severidades;
- nomenclaturas;
- planos;
- periodicidade;
- prioridade;
- fórmula de impacto comercial;
- janela de tendência;
- janela de persistência.

---

# 66. O que NÃO fazer

Não:

- criar modelo fechado só para GlobalSys;
- misturar risco e prioridade;
- transformar ausência em saúde;
- contar variável duas vezes;
- usar NPS como verdade absoluta;
- hardcodar SLA;
- olhar apenas o mês atual;
- ignorar tendência;
- ignorar persistência;
- calcular score sem confiança;
- aplicar peso sugerido sem aprovação no modo Assisted;
- executar fórmula arbitrária;
- alterar produção sem migration;
- declarar deploy/teste sem comprovação;
- usar gráfico de pizza (A1).

---

# 67. Definição de pronto por alteração

Uma alteração só está pronta quando:

1. código implementado;
2. tipos corretos;
3. validação;
4. testes relevantes;
5. lint;
6. build;
7. docs atualizados se necessário;
8. commit criado;
9. push realizado se possível;
10. preview/deploy disparado se CI/CD estiver conectado.

---

# 68. Primeiro comportamento esperado do agente

Ao receber este arquivo:

1. inspecione o repositório;
2. resuma em poucas linhas o estado atual;
3. proponha o próximo milestone;
4. implemente a Etapa 0;
5. valide;
6. commit;
7. prossiga para a Etapa 1 sem pedir confirmação, salvo decisão realmente bloqueante;
8. só pergunte quando faltar informação que altere materialmente arquitetura, dados ou segurança.

---

# 69. Resultado final esperado

```text
empresa entra
→ cadastra/importa clientes
→ cadastra/importa métricas
→ ajusta pesos
→ sistema calcula health
→ converte para risk
→ mede confiança
→ calcula impacto
→ ordena prioridade
→ explica motivos
→ recomenda ação
→ aprende/calibra com histórico
```

Uma nova empresa deve conseguir substituir completamente as métricas da GlobalSys sem alterar o código-fonte do motor.

---

# 70. Resumo matemático oficial

## Metric Health

```text
metric_health =
  current_health * current_weight
+ trend_health * trend_weight
+ persistence_health * persistence_weight
```

Defaults:

```text
current_weight     = 0.45
trend_weight       = 0.35
persistence_weight = 0.20
```

## Overall Health

```text
overall_health =
  Σ(metric_health_i × metric_weight_i)
  /
  Σ(metric_weight_i_available)
```

## Risk

```text
risk_score = 100 - overall_health
```

## Confidence

```text
analysis_confidence =
  weighted_data_coverage × 100
```

## Priority

```text
priority_score =
  risk_score × risk_priority_weight
+ commercial_impact_score × impact_priority_weight
```

Default provisório:

```text
risk_priority_weight   = 0.70
impact_priority_weight = 0.30
```

## SLA Contract Consumption

```text
contract_sla_consumption =
  elapsed_minutes / contractual_sla_minutes × 100
```

## Operational Target

Percentual:

```text
operational_target_minutes =
  contractual_sla_minutes × operational_target_percent
```

ou absoluto:

```text
operational_target_minutes = configured_minutes
```

## Operational Target Consumption

```text
operational_target_consumption =
  elapsed_minutes / operational_target_minutes × 100
```

## Ticket SLA Health

```text
weighted_consumption =
  min(contract_sla_consumption, 100) × 0.60
+ min(operational_target_consumption, 100) × 0.40

ticket_sla_health =
  clamp(100 - weighted_consumption, 0, 100)
```

## Missed Meeting Rate

```text
if meetings_planned == 0:
    N/A
else:
    (meetings_planned - meetings_completed)
    / meetings_planned
    × 100
```

## Reopen Rate

```text
reopen_rate =
  reopened_tickets / max(open_tickets, 1) × 100
```

## Critical Ticket Rate

```text
critical_ticket_rate =
  critical_tickets / max(open_tickets, 1) × 100
```

---

# 71. Preset oficial GlobalSys v1

```json
[
  { "order": 1, "key": "critical_tickets", "weight": 0.18 },
  { "order": 2, "key": "resolution_vs_sla", "weight": 0.16 },
  { "order": 3, "key": "platform_usage", "weight": 0.14 },
  { "order": 4, "key": "sla_compliance", "weight": 0.12 },
  { "order": 5, "key": "reopened_tickets", "weight": 0.1 },
  { "order": 6, "key": "formal_complaints", "weight": 0.09 },
  { "order": 7, "key": "open_tickets", "weight": 0.07 },
  { "order": 8, "key": "payment_delay", "weight": 0.06 },
  { "order": 9, "key": "missed_meetings", "weight": 0.05 },
  { "order": 10, "key": "nps_dissatisfaction", "weight": 0.03 }
]
```

Total:

```text
1.00 = 100%
```

---

# 72. Observação final ao agente

Esta especificação define a direção atual do projeto.

Quando houver conflito com implementação anterior:

1. preservar dados;
2. criar migration;
3. atualizar lógica;
4. atualizar testes;
5. registrar decisão;
6. versionar o modelo;
7. não quebrar histórico.

Implemente o sistema para que pesos, métricas, thresholds e regras possam evoluir sem reescrever o motor central.
