import type {
  ClassBand,
  ComponentWeights,
  HealthClass,
  MetricDirection,
  MetricType,
  PriorityClass,
} from '@inovaapss/shared';

// ---------------------------------------------------------------------------
// Valores por período
// ---------------------------------------------------------------------------

/**
 * Um valor bruto de métrica em um período (linha de `metric_values`).
 * `value = null` significa "não medido" — nunca é tratado como zero.
 */
export interface PeriodValue {
  /** Fim do período, ISO 8601 (data ou data-hora). Ordena a série. */
  periodEnd: string;
  /** Valor numérico bruto. `null` = ausente (N/A). */
  value: number | null;
  /** Valor textual (categorias, SCORE_MAP). Opcional. */
  text?: string | null;
}

// ---------------------------------------------------------------------------
// Normalização (§9)
// ---------------------------------------------------------------------------

/** Faixa de THRESHOLD_BANDS: vale para valor ≤ `upTo`; `upTo = null` é a última (pega o resto). */
export interface ThresholdBand {
  upTo: number | null;
  health: number;
}

export interface ThresholdBandsConfig {
  strategy: 'THRESHOLD_BANDS';
  /** Ordenadas por `upTo` crescente; a última deve ter `upTo: null`. */
  bands: ThresholdBand[];
}

export interface LinearRangeConfig {
  strategy: 'LINEAR_RANGE';
  /** Extremos da escala de valores. Fora deles o health satura em 0 ou 100. */
  min: number;
  max: number;
  /** Só para TARGET_RANGE: intervalo em que o health é 100. */
  target?: { min: number; max: number };
}

export interface RatioToTargetConfig {
  strategy: 'RATIO_TO_TARGET';
  /** Meta (valor ideal). Zero → não avaliável. */
  target: number;
  /** HIGHER_IS_WORSE: múltiplo da meta em que o health chega a 0 (padrão 2 = o dobro da meta). */
  zeroAtRatio?: number;
  /** TARGET_RANGE: desvio relativo tolerado sem penalidade (padrão 0) e o que zera (padrão 1 = 100 %). */
  tolerance?: number;
  zeroAtDeviation?: number;
}

export interface BaselineDeviationConfig {
  strategy: 'BASELINE_DEVIATION';
  /** Quantos períodos anteriores compõem o baseline (padrão 6). */
  window?: number;
  /** Mínimo de períodos anteriores para haver baseline (padrão 2). */
  minHistory?: number;
  /** `auto` (padrão) = mediana quando há outliers, média senão. */
  method?: 'auto' | 'mean' | 'median';
  /** Fator do detector de outliers em escala robusta (padrão 3). */
  outlierFactor?: number;
  /** Desvio (%) tolerado sem penalidade (padrão 0). */
  tolerancePct?: number;
  /** Desvio (%) que leva o health a 0 (padrão 50). */
  maxDeviationPct?: number;
  /**
   * §13 "BASELINE_DEVIATION + thresholds": faixas absolutas opcionais aplicadas ao valor bruto.
   * Combinadas com o desvio pelo pior caso (`worst`, padrão) ou pela média (`average`).
   * Sem histórico suficiente, o resultado é só o das faixas absolutas.
   */
  absolute?: ThresholdBandsConfig;
  combine?: 'worst' | 'average';
}

export interface BooleanMapConfig {
  strategy: 'BOOLEAN_MAP';
  /** Health para verdadeiro/falso. Padrão pela direção: HIGHER_IS_BETTER 100/0, HIGHER_IS_WORSE 0/100. */
  trueHealth?: number;
  falseHealth?: number;
}

export interface ScoreMapConfig {
  strategy: 'SCORE_MAP';
  /** Chave = texto do valor (ou o número como string) → health. */
  map: Record<string, number>;
  /** Health para chaves não mapeadas. Omitido → N/A. */
  defaultHealth?: number;
}

/** Regra JSON Logic serializável (objeto, literal ou lista). */
export type JsonLogicRule = Record<string, unknown> | number | string | boolean | null | unknown[];

export interface CustomSafeRuleConfig {
  strategy: 'CUSTOM_SAFE_RULE';
  /** Regra JSON Logic avaliada sobre `RuleContext`. Operadores fora da allowlist são recusados. */
  rule: JsonLogicRule;
  /**
   * `health` (padrão): a regra devolve o health 0–100.
   * `value`: a regra devolve um valor derivado que passa pela normalização em `then`
   * (aí a direção da métrica é respeitada pela estratégia seguinte).
   */
  output?: 'health' | 'value';
  then?: Exclude<NormalizationConfig, CustomSafeRuleConfig>;
  /** Parâmetros livres disponíveis em `params.*` dentro da regra. */
  params?: Record<string, number | string | boolean | null>;
}

export type NormalizationConfig =
  | ThresholdBandsConfig
  | LinearRangeConfig
  | RatioToTargetConfig
  | BaselineDeviationConfig
  | BooleanMapConfig
  | ScoreMapConfig
  | CustomSafeRuleConfig;

/** Contexto que uma regra segura enxerga. Só dados; nenhuma função. */
export interface RuleContext {
  value: number | null;
  text: string | null;
  previous: number | null;
  baseline: number | null;
  history: number[];
  /** Série bruta incluindo o atual, com `null` nos períodos sem dado (gatilhos STREAK). */
  series?: (number | null)[];
  params: Record<string, number | string | boolean | null>;
  /** Preenchido pelos gatilhos (§27). */
  health?: number | null;
  extra?: Record<string, number | string | boolean | null>;
}

export interface NormalizationResult {
  /** 0–100 (100 = saudável) ou `null` = N/A. */
  health: number | null;
  strategy: NormalizationConfig['strategy'];
  /** Baseline usado (BASELINE_DEVIATION) ou meta (RATIO_TO_TARGET). */
  baseline: number | null;
  /** Desvio relativo (%) em relação ao baseline/meta, quando fizer sentido. */
  deviationPct: number | null;
  /** Método de baseline efetivamente usado. */
  baselineMethod?: 'mean' | 'median';
  hasOutliers?: boolean;
  /** Por que ficou N/A, ou detalhe útil para a evidência. Em português. */
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Tendência (§10) e persistência (§11)
// ---------------------------------------------------------------------------

export type TrendMethod =
  'DELTA_ABSOLUTE' | 'DELTA_PERCENT' | 'MOVING_AVERAGE' | 'SLOPE' | 'BASELINE_COMPARISON';

export interface TrendConfig {
  /** Períodos analisados (padrão 3, §10). */
  window?: number;
  /** Padrão DELTA_PERCENT. */
  method?: TrendMethod;
  /**
   * Mudança (na unidade do método) que leva o trend_health a 0.
   * Métodos relativos (DELTA_PERCENT, MOVING_AVERAGE, BASELINE_COMPARISON): fração — padrão 1 (−100 %).
   * Métodos absolutos (DELTA_ABSOLUTE, SLOPE) sobre valores brutos: obrigatório, na unidade da métrica; sobre health: padrão 100 pontos (50 por período no SLOPE).
   */
  fullDeteriorationChange?: number;
  /**
   * `RAW` (padrão): tendência sobre os valores brutos, com a direção da métrica.
   * `HEALTH`: tendência sobre o current_health de cada período (direção sempre "maior é melhor").
   * Direção CUSTOM usa HEALTH automaticamente.
   */
  basis?: 'RAW' | 'HEALTH';
  /** Períodos do baseline em BASELINE_COMPARISON (padrão: os anteriores à janela, até 6). */
  baselineWindow?: number;
  /** Alvo para TARGET_RANGE quando não dá para inferir da normalização. */
  target?: number;
}

export interface TrendResult {
  health: number | null;
  method: TrendMethod;
  basis: 'RAW' | 'HEALTH';
  window: number;
  periodsUsed: number;
  firstValue: number | null;
  lastValue: number | null;
  /** Mudança bruta (último − primeiro, ou o que o método define). Positivo = valor subiu. */
  change: number | null;
  /** Mudança relativa em %, quando calculável. */
  changePercent: number | null;
  /** Inclinação (unidades por período) da regressão linear na janela. */
  slope: number | null;
  movingAverage: number | null;
  baseline: number | null;
  /** Mudança já orientada pela direção: > 0 melhorou, < 0 piorou (na unidade do método). */
  improvement: number | null;
  reason: string | null;
}

export interface PersistenceConfig {
  /** Períodos avaliados (padrão 3, §11). */
  window?: number;
  /** Período "não saudável" = current_health < este valor (padrão 60 = Risco ou Crítico). */
  unhealthyBelow?: number;
  /** Mínimo de períodos avaliáveis para calcular (padrão 2). */
  minEvaluatedPeriods?: number;
}

export interface PersistenceResult {
  health: number | null;
  window: number;
  evaluatedPeriods: number;
  unhealthyPeriods: number;
  /** Quantos períodos consecutivos (terminando no atual) estão não saudáveis. */
  currentUnhealthyStreak: number;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Gatilhos críticos (§27)
// ---------------------------------------------------------------------------

export type ComparisonOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

export type TriggerSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

interface TriggerBase {
  id: string;
  name: string;
  severity?: TriggerSeverity;
  /** Piso de prioridade (0–100) quando dispara (§27). */
  priorityFloor?: number;
  /** Texto do alerta em português. Placeholders: {value} {health} {threshold} {periods} {name}. */
  message?: string;
  isActive?: boolean;
}

/** Predicado tipado: compara um campo do contexto com um limite. */
export interface ThresholdTrigger extends TriggerBase {
  kind: 'THRESHOLD';
  /** `value` = valor bruto atual, `health` = current_health, `extra.<chave>` = campo extra. */
  field: 'value' | 'health' | `extra.${string}`;
  operator: ComparisonOperator;
  threshold: number;
}

/** Predicado tipado: a condição vale há N períodos consecutivos (valor bruto). */
export interface StreakTrigger extends TriggerBase {
  kind: 'STREAK';
  operator: ComparisonOperator;
  threshold: number;
  consecutivePeriods: number;
}

/** Regra JSON Logic sobre `RuleContext`; dispara quando o resultado é verdadeiro. */
export interface JsonLogicTrigger extends TriggerBase {
  kind: 'JSON_LOGIC';
  rule: JsonLogicRule;
}

export type TriggerConfig = ThresholdTrigger | StreakTrigger | JsonLogicTrigger;

export interface TriggerHit {
  triggerId: string;
  name: string;
  severity: TriggerSeverity;
  priorityFloor: number | null;
  message: string;
  metricId: string | null;
}

export interface TriggerEvaluation {
  hits: TriggerHit[];
  /** Maior piso entre os gatilhos disparados; `null` se nenhum define piso. */
  priorityFloor: number | null;
}

// ---------------------------------------------------------------------------
// Métrica configurada e resultado por métrica (§8)
// ---------------------------------------------------------------------------

export interface MetricConfig {
  id: string;
  name: string;
  /** Chave estável (ex.: `sla_compliance`); usada em explicações e no preset. */
  key?: string;
  type?: MetricType;
  /** Unidade para textos: `%`, `p.p.`, `min`, `dias`, `chamados`... */
  unit?: string;
  direction: MetricDirection;
  /** Peso no modelo (fração ou %, só a proporção importa). */
  weight: number;
  normalization: NormalizationConfig;
  componentWeights?: Partial<ComponentWeights>;
  trend?: TrendConfig;
  persistence?: PersistenceConfig;
  triggers?: TriggerConfig[];
  isActive?: boolean;
  /**
   * Modelo opcional da explicação humana. Placeholders: {name} {value} {previous} {delta}
   * {deltaAbs} {deltaPct} {baseline} {deviationPct} {window} {unit}.
   */
  explanationTemplate?: string;
}

export interface MetricInput {
  metric: MetricConfig;
  /** Série cronológica (mais antigo → mais recente). O último elemento é o período atual. */
  series: PeriodValue[];
  /** Campos extras para gatilhos (`extra.<chave>`), ex.: `{ critical_tickets: 3 }`. */
  extra?: Record<string, number | string | boolean | null>;
}

export interface ComponentBreakdown {
  current: number | null;
  trend: number | null;
  persistence: number | null;
  /** Pesos efetivamente usados (redistribuídos entre componentes válidos). */
  weightsUsed: ComponentWeights;
  /** Pesos configurados. */
  weightsConfigured: ComponentWeights;
}

export interface MetricScore {
  metricId: string;
  metricKey: string | null;
  metricName: string;
  weight: number;
  direction: MetricDirection;
  unit: string | null;
  /** 0–100 ou `null` quando a métrica não pôde ser avaliada. */
  metricHealth: number | null;
  currentHealth: number | null;
  trendHealth: number | null;
  persistenceHealth: number | null;
  /** 0–100: proporção do peso dos componentes que puderam ser calculados. */
  confidence: number;
  components: ComponentBreakdown;
  currentValue: number | null;
  previousValue: number | null;
  periodEnd: string | null;
  normalization: NormalizationResult;
  trend: TrendResult;
  persistence: PersistenceResult;
  triggers: TriggerEvaluation;
  /** Explicação estruturada (vai para `explanation_json`). */
  explanation: {
    summary: string;
    components: string[];
    notes: string[];
  };
}

// ---------------------------------------------------------------------------
// Score geral do cliente (§24–§28)
// ---------------------------------------------------------------------------

export interface MetricContribution {
  metricId: string;
  weight: number;
  metricHealth: number | null;
  /** 0–100, confiança da métrica (§8). */
  confidence: number;
  /** 0–1: frescor do dado (§25). Padrão 1. */
  freshness?: number;
}

export interface OverallHealthConfig {
  /** Considera a confiança de cada métrica na cobertura (padrão true). */
  useMetricConfidence?: boolean;
}

export interface OverallHealthResult {
  /** `null` quando nenhuma métrica pôde ser avaliada. */
  overallHealth: number | null;
  riskScore: number | null;
  healthClass: HealthClass | null;
  /** 0–100 (§25). */
  analysisConfidence: number;
  totalWeight: number;
  availableWeight: number;
  /** Peso normalizado (0–1) de cada métrica disponível, para a explicação. */
  normalizedWeights: Record<string, number>;
}

export interface PriorityConfig {
  weights?: { risk: number; impact: number };
  bands?: readonly { class: PriorityClass; min: number }[];
}

export interface PriorityInput {
  riskScore: number | null;
  /** 0–100. `null` = sem impacto comercial conhecido (usa só o risco). */
  commercialImpactScore: number | null;
  /** Piso vindo dos gatilhos (§27). */
  priorityFloor?: number | null;
}

export interface PriorityResult {
  priorityScore: number | null;
  priorityClass: PriorityClass | null;
  /** Score antes de aplicar o piso. */
  computedScore: number | null;
  floorApplied: boolean;
  weightsUsed: { risk: number; impact: number };
}

export interface CommercialImpactFactor {
  /** Valor do fator já em 0–100. `null` = desconhecido (peso redistribuído). */
  score: number | null;
  weight: number;
}

export interface CommercialImpactInput {
  /** Valor mensal do contrato e a referência (maior MRR da carteira, ou teto configurado). */
  monthlyValue?: number | null;
  referenceMonthlyValue?: number | null;
  /** Importância estratégica em 0–100 (a UI pode mapear 1–5 → 0–100). */
  strategicImportance?: number | null;
  /** Outros fatores configuráveis (plano, porte...), já em 0–100. */
  extraFactors?: Record<string, CommercialImpactFactor>;
}

export interface CommercialImpactConfig {
  weights?: { monthlyValue?: number; strategicImportance?: number };
}

export interface CommercialImpactResult {
  score: number | null;
  factors: Record<string, { score: number | null; weight: number }>;
}

// ---------------------------------------------------------------------------
// Evidências (§29)
// ---------------------------------------------------------------------------

export interface EvidenceDriver {
  metricId: string;
  metricName: string;
  currentValue: number | null;
  baselineValue: number | null;
  /** Último − anterior (unidade da métrica). */
  delta: number | null;
  /** `up` | `down` | `stable` em termos de valor bruto; `null` sem histórico. */
  trend: 'up' | 'down' | 'stable' | null;
  /** Saúde da métrica (0–100). */
  healthScore: number | null;
  /** Peso normalizado (0–1) entre as métricas disponíveis. */
  weight: number;
  /** Pontos de risco que a métrica contribui: weight × (100 − health). */
  contribution: number;
  humanExplanation: string;
  /** true quando a métrica está puxando a saúde para baixo. */
  isNegative: boolean;
}

// ---------------------------------------------------------------------------
// Forecast (DATAVIZ.md §5)
// ---------------------------------------------------------------------------

// Os contratos do gráfico de forecast são de packages/shared (fonte única, DATAVIZ.md §5.4):
// API, web e engine leem o mesmo tipo. Reexportados aqui para quem importa só do engine.
export type {
  ForecastChartData,
  ForecastRow,
  HealthThresholds,
  ProjectionConfidence,
} from '@inovaapss/shared';

// ---------------------------------------------------------------------------
// Score completo do cliente (orquestração de §8–§29)
// ---------------------------------------------------------------------------

export interface ClientScoreConfig {
  /** Faixas de health (§7). Padrão 80/60/40. */
  healthBands?: readonly ClassBand<HealthClass>[];
  priority?: PriorityConfig;
  overall?: OverallHealthConfig;
  commercialImpact?: CommercialImpactConfig;
  /** Nome do período nos textos ("mês", "semana"...). Padrão "período". */
  periodLabel?: string;
}

export interface ClientScoreInput {
  clientId: string;
  /** Métricas do modelo ativo com as séries do cliente. Métricas com `isActive: false` são ignoradas. */
  metrics: MetricInput[];
  /** Impacto comercial já em 0–100, ou os fatores para calculá-lo. `null` = desconhecido. */
  commercialImpact?: CommercialImpactInput | number | null;
  config?: ClientScoreConfig;
}

export interface ClientScoreResult {
  clientId: string;
  /** `period_end` mais recente entre as métricas. */
  periodEnd: string | null;
  overallHealth: number | null;
  riskScore: number | null;
  healthClass: HealthClass | null;
  analysisConfidence: number;
  commercialImpactScore: number | null;
  priorityScore: number | null;
  priorityClass: PriorityClass | null;
  /** Piso de prioridade vindo dos gatilhos (§27). */
  priorityFloor: number | null;
  metrics: MetricScore[];
  evidence: EvidenceDriver[];
  triggers: TriggerEvaluation;
  overall: OverallHealthResult;
  priority: PriorityResult;
}
