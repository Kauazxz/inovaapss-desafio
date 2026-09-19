# Scoring — fórmulas do motor de saúde, risco e prioridade

Como o produto transforma valores brutos em **health**, **risco**, **confiança**, **prioridade**,
**evidências** e **projeção**. Tudo o que está aqui vive em `packages/engine/src/scoring/`
(`@inovaapss/engine`): funções puras, sem banco, sem HTTP, sem React. Cada número deste documento é
verificado por um teste em `packages/engine/src/scoring/*.test.ts`.

Referências: [SPEC.md](SPEC.md) §7–§11, §24–§29, §70; [DATAVIZ.md](DATAVIZ.md) §5 (forecast);
[METRICS_ENGINE.md](METRICS_ENGINE.md) (como uma métrica é configurada);
[SLA_ENGINE.md](SLA_ENGINE.md) (Métrica 2).

---

## 1. Regras que valem para tudo

| Regra                                                                        | Onde                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Escala 0–100; **100 = saudável, 0 = crítico**                                | todo score (`toHealth` limita a 0–100)                                                |
| **Dado ausente é N/A (`null`), nunca zero**                                  | normalização, tendência, persistência, métrica, overall (§25, §66)                    |
| Ausência **reduz a confiança**, não a saúde                                  | `analysis_confidence` (§25)                                                           |
| **Risco = 100 − health**                                                     | `riskFromHealth` (§26)                                                                |
| **Configuração inválida lança `EngineConfigError`** — dado inválido vira N/A | Etapa 3 valida a configuração ao salvar usando as mesmas funções                      |
| Determinístico                                                               | "agora" entra por parâmetro (`now`); nenhuma leitura de relógio ou de banco           |
| Sem `eval`                                                                   | fórmulas configuráveis só por JSON Logic com allowlist de operadores (`safe-rule.ts`) |

---

## 2. Pipeline de um cliente (`scoreClient`)

```text
para cada métrica ativa do modelo:
  série (mais antigo → mais recente)
  → current_health de cada período      normalize()          §9
  → trend_health                        computeTrend()       §10
  → persistence_health                  computePersistence() §11
  → metric_health + confiança           combineComponents()  §8
  → gatilhos                            evaluateTriggers()   §27
  → explicação                          explainMetric()      §29
overall_health, analysis_confidence     computeOverallHealth() §24–§25
risk_score = 100 − overall_health                              §26
commercial_impact_score                 computeCommercialImpact() §28
priority_score (+ piso dos gatilhos)    computePriority()    §27–§28
evidências ordenadas                    buildEvidence()      §29
```

Cada período é normalizado **só com o histórico anterior a ele** (§59): o baseline do período de
julho não enxerga agosto.

---

## 3. Normalização — `current_health` (§9)

`normalize({ value, text?, history?, direction }, config)` devolve `{ health, baseline, deviationPct, reason }`.

| Estratégia           | Como vira health                                                                                                                                                                                                                                                                                                                 | Direção                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `THRESHOLD_BANDS`    | primeira faixa (em ordem crescente de `upTo`) que o valor não ultrapassa; a última tem `upTo: null`. Ex.: faixas `≤10→100, ≤20→60, resto→0`: valor 15 → **60**                                                                                                                                                                   | as faixas já carregam a direção                                            |
| `LINEAR_RANGE`       | interpolação entre `min` e `max`. Ex.: 0–100, valor 75 → **75** (HIGHER_IS_BETTER) ou **25** (HIGHER_IS_WORSE). TARGET_RANGE: 100 dentro de `target {min,max}`, caindo até 0 nos extremos (alvo 40–60, valor 20 → **50**)                                                                                                        | sim                                                                        |
| `RATIO_TO_TARGET`    | razão valor/meta. HIGHER_IS_BETTER: `ratio × 100` (80 de meta 100 → **80**). HIGHER_IS_WORSE: 100 até a meta e 0 em `zeroAtRatio × meta` (padrão 2×): meta 10, valor 15 → **50**. TARGET_RANGE: 100 dentro de `tolerance`, 0 em `zeroAtDeviation`                                                                                | sim                                                                        |
| `BASELINE_DEVIATION` | desvio relativo ao **baseline do próprio cliente** (seção 3.1). 100 dentro de `tolerancePct` (padrão 0), 0 em `maxDeviationPct` (padrão 50 %). Ex.: histórico `[100,100,100]`, valor 80, HIGHER_IS_BETTER → desvio −20 % → **60**. Faixas absolutas opcionais (`absolute`) combinadas pelo pior caso ou pela média               | sim (só a piora penaliza; TARGET_RANGE e CUSTOM penalizam qualquer desvio) |
| `BOOLEAN_MAP`        | verdadeiro/falso → health. Padrão pela direção: HIGHER_IS_BETTER 100/0, HIGHER_IS_WORSE 0/100. Entende `sim/não/true/false/1/0`. TARGET_RANGE e CUSTOM exigem `trueHealth`/`falseHealth`                                                                                                                                         | sim                                                                        |
| `SCORE_MAP`          | texto (ou número) → health, sem diferenciar maiúsculas. Chave ausente → N/A ou `defaultHealth`                                                                                                                                                                                                                                   | o mapa é explícito                                                         |
| `CUSTOM_SAFE_RULE`   | JSON Logic sobre `{ value, text, previous, baseline, history, params }`. `output: 'health'` (padrão) devolve o health; `output: 'value'` devolve um valor derivado que passa pela estratégia em `then` (aí a direção se aplica). Resultado não numérico → N/A. Operador fora da allowlist → `UnsafeRuleError` — **nunca `eval`** | via `then`                                                                 |

### 3.1 Baseline com outliers

`computeBaseline(history, { window = 6, minHistory = 2, method = 'auto', outlierFactor = 3 })`:

- usa os últimos `window` períodos com dado; menos de `minHistory` → sem baseline (N/A, ou só as
  faixas absolutas se configuradas);
- detecta outliers pela distância à mediana em escala robusta (MAD × 1,4826; se o MAD for zero,
  desvio absoluto médio × 1,2533);
- `auto`: **mediana** quando há outlier, média senão.

Exemplo verificado (HIGHER_IS_WORSE, valor atual 15, histórico `[10, 10, 11, 10, 100]`):

| Método           | Baseline | Desvio |  Health |
| ---------------- | -------: | -----: | ------: |
| `auto` → mediana |       10 |  +50 % |   **0** |
| `mean` (forçado) |     28,2 |  −47 % | **100** |

A média engolida pelo outlier esconderia a piora; por isso a mediana é o padrão quando há outlier.

Baseline zero não tem desvio relativo: o health é decidido pelo sentido da mudança (subiu com
HIGHER_IS_WORSE → 0; ficou em zero → 100).

---

## 4. Tendência — `trend_health` (§10)

`computeTrend({ series, healthSeries?, direction, currentHealth, baseline? }, config)`.

Janela padrão **3 períodos**; métodos `DELTA_PERCENT` (padrão), `DELTA_ABSOLUTE`, `MOVING_AVERAGE`,
`SLOPE` (regressão linear simples) e `BASELINE_COMPARISON` (média dos períodos anteriores à janela).
Menos de 2 períodos com dado na janela → **N/A**.

A mudança é **orientada pela direção** (`improvement`: > 0 melhorou, < 0 piorou) e o health é
**ancorado no `current_health`**:

```text
trend_health = clamp(current_health + 100 × improvement / fullDeteriorationChange, 0, 100)
```

`fullDeteriorationChange` é a mudança adversa que derruba 100 pontos: padrão 1 (= −100 %) para os
métodos relativos; obrigatório para `DELTA_ABSOLUTE`/`SLOPE` sobre valores brutos; 100 pontos (50
por período no `SLOPE`) sobre a série de health.

Por que ancorar: estável → igual ao atual. Um cliente saudável e estável continua em 100; um cliente
crítico e estável continua crítico (com neutro fixo em 50 o primeiro nunca chegaria a 100 e o
segundo subiria para "Risco" sem melhorar nada).

Exemplos verificados:

| Série (janela 3) | Direção          | current_health | Mudança | trend_health |
| ---------------- | ---------------- | -------------: | ------: | -----------: |
| `[80, 70, 60]`   | HIGHER_IS_BETTER |             60 |   −25 % |       **35** |
| `[50, 50, 50]`   | qualquer         |             90 |     0 % |       **90** |
| `[10, 15, 20]`   | HIGHER_IS_BETTER |             50 |  +100 % |      **100** |
| `[10, 15, 20]`   | HIGHER_IS_WORSE  |             50 |  +100 % |        **0** |
| `[20, 15, 10]`   | HIGHER_IS_WORSE  |             50 |   −50 % |      **100** |

A mesma série lida com direções opostas dá tendências opostas — é o que "respeitar a direção"
significa. `TARGET_RANGE` mede a distância até a meta (chegar mais perto = melhora); `CUSTOM` e
`TARGET_RANGE` sem meta usam a série de `current_health` (`basis: 'HEALTH'`).

---

## 5. Persistência — `persistence_health` (§11)

```text
persistence_health = 100 × (1 − unhealthy_periods / evaluated_periods)
```

Janela padrão **3**; "não saudável" = `current_health < unhealthyBelow` (padrão 60, ou seja, Risco
ou Crítico). Períodos sem health não são avaliados. Menos de 2 avaliados → N/A.

| Health por período | Não saudáveis | persistence_health |
| ------------------ | ------------: | -----------------: |
| `[80, 50, 30]`     |        2 de 3 |          **33,33** |
| `[90, 85, 80]`     |        0 de 3 |            **100** |
| `[null, 50, 80]`   |        1 de 2 |             **50** |

Também devolve `currentUnhealthyStreak` (períodos consecutivos não saudáveis terminando no atual).

---

## 6. Health da métrica (§8)

```text
metric_health = current × 0,45 + trend × 0,35 + persistence × 0,20
```

Pesos configuráveis por métrica (`componentWeights`; só a proporção importa). Componente `null`
sai da conta: **o peso dele é redistribuído** proporcionalmente entre os válidos e a **confiança da
métrica** cai para `peso válido / peso total`.

Exemplo de referência (`Uso da plataforma`, LINEAR_RANGE 0–100, série `[90, 85, 80]`):

| Componente        |     Valor |                Peso |
| ----------------- | --------: | ------------------: |
| current           |        80 |                0,45 |
| trend             |     68,89 |                0,35 |
| persistence       |       100 |                0,20 |
| **metric_health** | **80,11** | confiança **100 %** |

| Situação                          | Pesos usados                   |    metric_health | Confiança |
| --------------------------------- | ------------------------------ | ---------------: | --------: |
| sem tendência (1 período de dado) | current 0,692 · persist. 0,308 | 86,15 (80/–/100) |      65 % |
| só o atual (1 período)            | current 1                      |               80 |      45 % |
| **sem `current_health`**          | —                              |          **N/A** |   **0 %** |

Sem `current_health` a métrica é N/A mesmo que tendência e persistência existam: elas não dizem
como o cliente está agora e ausência nunca vira saúde.

---

## 7. Health geral, confiança e risco (§24–§26)

```text
overall_health       = Σ(metric_health_i × w_i) / Σ(w_i disponíveis)
analysis_confidence  = Σ(w_i × disponibilidade_i) / Σ(w_i) × 100
                       disponibilidade_i = (métrica avaliada ? confiança_i / 100 : 0) × frescor_i
risk_score           = 100 − overall_health
```

Com o preset GlobalSys v1 (pesos de §71, soma **1,00**):

| Caso                                     | overall_health | risk | Classe  | Confiança |
| ---------------------------------------- | -------------: | ---: | ------- | --------: |
| 10 métricas em 100                       |            100 |    0 | Normal  |     100 % |
| `critical_tickets` (peso 0,18) sem dado  |            100 |    0 | Normal  |      82 % |
| NPS (0,03) sem resposta, resto em 100    |            100 |    0 | Normal  |      97 % |
| reuniões previstas = 0 (0,05), resto 100 |            100 |    0 | Normal  |      95 % |
| duas métricas 0,5/0,5 em 80 e 65         |           72,5 | 27,5 | Atenção |     100 % |
| nenhuma métrica avaliada                 |            N/A |  N/A | —       |       0 % |

Classes pelas faixas configuráveis (`DEFAULT_HEALTH_BANDS` 80/60/40 em `@inovaapss/shared`).

---

## 8. Impacto comercial e prioridade (§27–§28)

```text
commercial_impact = média ponderada de fatores 0–100
                    (valor mensal / referência da carteira × 0,6; importância estratégica × 0,4;
                     fatores extras configuráveis) — fator desconhecido sai da conta
priority_score    = risk × 0,70 + commercial_impact × 0,30       (pesos configuráveis)
priority_score    = max(priority_score, priority_floor)          se algum gatilho definiu piso
```

| risco | impacto |                priority | Classe |
| ----: | ------: | ----------------------: | ------ |
|    60 |      40 |                  **54** | P2     |
|    70 |      10 |                  **52** | P2     |
|    70 |     100 |                  **79** | P1     |
|    20 |      10 | 17 → **85** com piso 85 | P0     |

Mesmo risco, impacto diferente, prioridade diferente: **prioridade não é risco**. Sem impacto
conhecido a prioridade usa só o risco. Classes por `DEFAULT_PRIORITY_BANDS` 85/70/50.

### Gatilhos (§27)

`evaluateTriggers` avalia predicados tipados (`THRESHOLD` sobre valor/health/campo extra, `STREAK`
por N períodos consecutivos com dado) ou uma regra JSON Logic. Um gatilho disparado gera um alerta
(`hits`) e, se configurado, um `priorityFloor`. **Nunca altera o health**: o teste
"gatilho é separado do peso" confere que `metric_health`, `overall_health` e `risk_score` são
idênticos com e sem o gatilho, e só a prioridade muda (0 → 85, P0).

---

## 9. Evidências (§29)

`buildEvidence` devolve, para cada métrica: `currentValue`, `baselineValue`, `delta`, `trend`
(`up/down/stable`), `healthScore`, `weight` (normalizado entre as disponíveis), `contribution`
(`weight × (100 − health)`, pontos de risco) e `humanExplanation`, ordenadas por contribuição.
Métricas sem dado ficam no fim, com contribuição 0.

Textos gerados (`explainMetric`, português, sem `Intl`):

| Situação                              | Texto                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------ |
| percentual caiu (unidade `%`)         | `Cumprimento de SLA caiu 24 p.p. em 3 meses.`                            |
| quantidade subiu                      | `Chamados críticos subiram de 2 para 5 chamados em 3 períodos (+150 %).` |
| dobrou                                | `Taxa de reabertura dobrou em 3 períodos (de 5 para 10 %).`              |
| estável                               | `Uso da plataforma está estável em 70 % há 3 períodos.`                  |
| sem tendência, com baseline           | `Uso da plataforma está 19 % abaixo do baseline.`                        |
| sem dado                              | `NPS: sem dado no período.`                                              |
| modelo da organização com campo extra | `2 reuniões previstas não ocorreram`                                     |

---

## 10. Forecast — projeção por tendência ([DATAVIZ.md](DATAVIZ.md) §5)

```text
slope     = regressão linear simples sobre os últimos N overall_health (N = 3; com 2 pontos é o delta)
projetado = clamp(health_atual + slope × 1, 0, 100)
confiança: < 2 pontos → sem projeção, "low" · 2 ≤ pontos < N → "low"
           pontos ≥ N e analysis_confidence ≥ 70 → "high" · senão "medium"
crossesDown = classe(projetado) ∈ {Risco, Crítico} e pior que a atual
```

| Histórico de health | Projetado | Classe atual → projetada | crossesDown |
| ------------------- | --------: | ------------------------ | ----------- |
| `[80, 70, 60]`      |        50 | Atenção → Risco          | **sim**     |
| `[30, 20, 10]`      |         0 | Crítico → Crítico        | não         |
| `[40, 50, 60]`      |        70 | Risco → Atenção          | não         |
| `[60]`              |       N/A | — (confiança "low")      | não         |

`buildForecastChart` ordena por `priority_score` desc, conta os cruzamentos (título do gráfico) e
devolve os thresholds das faixas vigentes. Os tipos `ForecastRow`/`ForecastChartData` estão em
`packages/engine/src/scoring/types.ts`; `packages/shared/src/dashboard` pode reexportá-los.

---

## 11. Como usar

```ts
import { scoreClient } from '@inovaapss/engine';

const result = scoreClient({
  clientId: 'c1',
  metrics: [{ metric: metricConfig, series: [{ periodEnd: '2026-08-31', value: 80 }] }],
  commercialImpact: { monthlyValue: 5000, referenceMonthlyValue: 10000, strategicImportance: 80 },
  config: { periodLabel: 'mês' },
});
// result.overallHealth, riskScore, healthClass, analysisConfidence, priorityScore, priorityClass,
// result.metrics[i] (metric_score_snapshots), result.evidence, result.triggers
```

A API (Etapas 3–4) monta `MetricInput[]` a partir de `metric_model_items` + `metric_values` e grava
`metric_score_snapshots` / `client_score_snapshots` com a versão do modelo (§31).

Cobertura dos testes do pacote: 99 % de linhas, 97 % de ramos, 100 % de funções
(`pnpm --filter @inovaapss/engine test`).
