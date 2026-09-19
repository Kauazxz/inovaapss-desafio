# Metrics Engine — como uma métrica é configurada

"Tudo é métrica" ([SPEC.md](SPEC.md) §6): o motor conhece **tipos** de métrica, não nomes. A
GlobalSys é uma configuração; uma nova organização troca todas as métricas sem mexer no motor. Este
documento descreve o contrato de configuração que `@inovaapss/engine` consome
(`packages/engine/src/scoring/types.ts`) e como a Etapa 3 o persiste em `metric_definitions` +
`metric_model_items`. As fórmulas estão em [SCORING.md](SCORING.md).

---

## 1. `MetricConfig` — o que o motor precisa saber

```ts
interface MetricConfig {
  id: string; // metric_definition_id
  name: string; // aparece nas explicações ("Cumprimento de SLA")
  key?: string; // chave estável do preset ("sla_compliance")
  type?: MetricType; // TIME | PERCENTAGE | QUANTITY | ... (§6)
  unit?: string; // "%", "min", "dias", "chamados" — muda o texto da evidência
  direction: MetricDirection; // HIGHER_IS_BETTER | HIGHER_IS_WORSE | TARGET_RANGE | CUSTOM
  weight: number; // peso no modelo (0,18 ou 18 — só a proporção importa)
  normalization: NormalizationConfig; // seção 2
  componentWeights?: { current?; trend?; persistence? }; // padrão 0,45 / 0,35 / 0,20
  trend?: TrendConfig; // seção 3
  persistence?: PersistenceConfig; // seção 3
  triggers?: TriggerConfig[]; // seção 4
  explanationTemplate?: string; // seção 5
  isActive?: boolean; // false = fora do cálculo
}
```

A série de valores chega como `PeriodValue[]` (`{ periodEnd, value, text? }`, do mais antigo ao
mais recente; `value: null` = período sem dado) e campos auxiliares para gatilhos e textos em
`extra` (ex.: `{ critical_tickets: 3, missed: 2 }`).

---

## 2. Normalização (`normalization`)

| `strategy`           | Campos                                                                                                                                                                               | Quando usar                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `THRESHOLD_BANDS`    | `bands: [{ upTo, health }]` (última com `upTo: null`)                                                                                                                                | limites absolutos conhecidos (reclamações: 0→100, 1→70, ≤3→30, resto→0)            |
| `LINEAR_RANGE`       | `min`, `max`, `target?: {min, max}` (TARGET_RANGE)                                                                                                                                   | percentuais e escalas contínuas (uso da plataforma 0–100 %)                        |
| `RATIO_TO_TARGET`    | `target`, `zeroAtRatio?` (2), `tolerance?` (0), `zeroAtDeviation?` (1)                                                                                                               | há uma meta explícita (taxa de reabertura ≤ 10 %)                                  |
| `BASELINE_DEVIATION` | `window?` (6), `minHistory?` (2), `method?` (auto/mean/median), `outlierFactor?` (3), `tolerancePct?` (0), `maxDeviationPct?` (50), `absolute?` (faixas), `combine?` (worst/average) | comparar o cliente com ele mesmo (chamados abertos, uso, críticos — §13, §15, §19) |
| `BOOLEAN_MAP`        | `trueHealth?`, `falseHealth?`                                                                                                                                                        | sim/não (pagamento em dia?)                                                        |
| `SCORE_MAP`          | `map: { chave: health }`, `defaultHealth?`                                                                                                                                           | categorias (classificação de NPS, nível de risco textual)                          |
| `CUSTOM_SAFE_RULE`   | `rule` (JSON Logic), `output?` (health/value), `then?`, `params?`                                                                                                                    | fórmula própria da organização                                                     |

Regras comuns: valor `null` → health `null` (N/A). Configuração inválida (faixas vazias, `min ≥ max`,
meta zero, operador proibido) → `EngineConfigError`/`UnsafeRuleError` — a Etapa 3 chama
`normalize()` com um valor de exemplo ao salvar e devolve a mensagem em português ao usuário.

### Fórmula segura (`CUSTOM_SAFE_RULE`)

- JSON Logic, sem `eval`, sem `method`, sem operadores registrados. Allowlist em
  `ALLOWED_RULE_OPERATORS` (`var`, `if`, comparações, aritmética, `min/max`, `map/filter/reduce`,
  `in`, `cat`, `substr`...).
- Contexto visível: `value`, `text`, `previous`, `baseline`, `history[]`, `series[]`, `params.*`,
  `extra.*`, `health` (nos gatilhos). Objetos sem protótipo: `constructor`/`__proto__` são
  recusados na regra e removidos do contexto.
- Limites: 500 nós, profundidade 30.
- `isSafeRule(rule)` para validar no formulário sem avaliar.

Exemplo — health = 100 se o valor ficou dentro de 20 % do baseline, senão 40:

```json
{
  "strategy": "CUSTOM_SAFE_RULE",
  "rule": {
    "if": [{ "<=": [{ "var": "value" }, { "*": [{ "var": "baseline" }, 1.2] }] }, 100, 40]
  }
}
```

Exemplo — valor derivado (delta em relação ao anterior) normalizado em seguida:

```json
{
  "strategy": "CUSTOM_SAFE_RULE",
  "output": "value",
  "rule": { "-": [{ "var": "value" }, { "var": "previous" }] },
  "then": { "strategy": "LINEAR_RANGE", "min": 0, "max": 40 }
}
```

---

## 3. Tendência e persistência

```ts
trend?: {
  window?: number;                  // 3
  method?: 'DELTA_PERCENT' | 'DELTA_ABSOLUTE' | 'MOVING_AVERAGE' | 'SLOPE' | 'BASELINE_COMPARISON';
  fullDeteriorationChange?: number; // mudança adversa que zera o trend (1 = −100 % nos relativos)
  basis?: 'RAW' | 'HEALTH';         // valores brutos (com a direção) ou o health por período
  baselineWindow?: number;          // BASELINE_COMPARISON
  target?: number;                  // TARGET_RANGE sem meta inferível
}
persistence?: {
  window?: number;                  // 3
  unhealthyBelow?: number;          // 60
  minEvaluatedPeriods?: number;     // 2
}
```

Ambos respeitam a direção e devolvem N/A com histórico insuficiente; o peso é redistribuído e a
confiança da métrica cai (SCORING.md §6).

---

## 4. Gatilhos (`triggers`) — separados do peso (§27)

```ts
{ id, name, severity?: 'INFO'|'WARNING'|'CRITICAL', priorityFloor?: 0–100, message?, isActive?,
  kind: 'THRESHOLD', field: 'value' | 'health' | 'extra.<campo>', operator: '>'|'>='|'<'|'<='|'=='|'!=', threshold }
{ ..., kind: 'STREAK', operator, threshold, consecutivePeriods }      // N períodos seguidos com dado
{ ..., kind: 'JSON_LOGIC', rule }                                     // regra segura sobre o contexto
```

Um gatilho disparado vira alerta (`TriggerHit`) e, se tiver `priorityFloor`, eleva a prioridade do
cliente até esse piso. O health não muda. `message` aceita `{name} {value} {health} {threshold}
{periods} {extra.<campo>}`. Dado ausente nunca dispara.

Exemplos do preset:

| Gatilho                         | Configuração                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| ticket crítico > 120 % do SLA   | `THRESHOLD` em `extra.worst_ticket_contract_consumption > 120`, piso 85                        |
| 3 tickets críticos reincidentes | `STREAK` `>= 1` por 3 períodos, piso 70                                                        |
| condição contratual             | `JSON_LOGIC` `{ ">": [{ "var": "extra.payment_delay_days" }, { "var": "params.max_delay" }] }` |

---

## 5. Explicação (`explanationTemplate`, `unit`)

Sem modelo, o motor escreve a frase sozinho ("Cumprimento de SLA caiu 24 p.p. em 3 meses."). Com
modelo, substitui `{name} {value} {previous} {delta} {deltaAbs} {deltaPct} {baseline}
{deviationPct} {window} {unit} {extra.<campo>}`. Ex.: `"{extra.missed} reuniões previstas não
ocorreram"`.

---

## 6. Métricas derivadas do preset GlobalSys

Funções em `derived.ts` produzem o valor bruto antes da normalização (a API grava em
`metric_values` com `source = DERIVED`):

| Função                                     | Fórmula                                                            | N/A quando              |
| ------------------------------------------ | ------------------------------------------------------------------ | ----------------------- |
| `criticalTicketRate(critical, open)`       | `critical / max(open, 1) × 100`                                    | entrada ausente         |
| `reopenRate(reopened, open)`               | `reopened / max(open, 1) × 100`                                    | entrada ausente         |
| `slaCompliancePct(within, resolved, pct?)` | `pct` informado, senão `within / max(resolved,1) × 100`            | entrada ausente         |
| `missedMeetingRate(planned, completed)`    | `(planned − completed) / planned × 100`                            | **`planned = 0`** (§21) |
| `npsHealth(answered, score)`               | `clamp(score × 10, 0, 100)`                                        | **não respondeu** (§22) |
| `analyzeNpsResponses(history)`             | sequência sem resposta, taxa de resposta, mudança de comportamento | —                       |
| Métrica 2 (SLA)                            | [SLA_ENGINE.md](SLA_ENGINE.md) `aggregateClientSla`                | sem chamado avaliável   |

NPS sem resposta e reuniões sem previsão viram N/A na métrica: não entram no overall e reduzem a
confiança (97 % e 95 % com o preset), nunca viram zero. A sequência sem resposta pode alimentar um
gatilho via `extra.nps_unanswered_streak`.

---

## 7. Como a Etapa 3 persiste isto

| Campo do `MetricConfig`                                      | Tabela / coluna (§36)                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `id`, `name`, `key`, `type`, `unit`, `direction`, `isActive` | `metric_definitions` (`slug` = `key`)                                               |
| `weight`, `componentWeights`                                 | `metric_model_items.weight`, `current_weight`, `trend_weight`, `persistence_weight` |
| `normalization`                                              | `metric_model_items.normalization_strategy` + `normalization_config_json`           |
| `trend`, `persistence`                                       | `metric_model_items.threshold_config_json` (chaves `trend`, `persistence`)          |
| `triggers`                                                   | `metric_model_items.critical_trigger_config_json`                                   |
| `explanationTemplate`, `params`                              | `metric_model_items.formula_config_json`                                            |

Recomendações para a Etapa 3:

1. Validar `normalization_config_json` com Zod (`packages/validation`) **e** com um `normalize()`
   de exemplo; validar regras com `isSafeRule`.
2. Exigir que os pesos ativos somem 100 % para ativar um modelo fechado (§41), sem redistribuir
   em silêncio — o motor aceita qualquer proporção, a regra de negócio é da API.
3. Versionar: mudar peso/faixa cria `metric_model_versions`; snapshots guardam a versão (§31).
4. Preset GlobalSys v1 = 10 `MetricConfig` com os pesos de §71 (o teste
   `client-score.test.ts` traz um exemplo completo com normalizações ilustrativas; os thresholds
   reais vêm da calibração com a planilha, §44).

Pendência anotada: `ForecastRow`/`ForecastChartData`, `MetricConfig` e os tipos de configuração
vivem no engine; `packages/shared` pode reexportá-los (`dashboard/forecast.ts`) quando o front
precisar sem depender do motor.
