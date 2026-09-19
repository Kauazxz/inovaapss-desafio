import { DEFAULT_COMPONENT_WEIGHTS, type ComponentWeights } from '@inovaapss/shared';

import { explainMetric, type ExplainOptions } from './explain.js';
import { buildRuleContext, normalize } from './normalization.js';
import { computePersistence } from './persistence.js';
import { computeTrend } from './trend.js';
import { evaluateTriggers } from './triggers.js';
import { EngineConfigError } from '../shared/errors.js';
import { formatNumber, formatSigned } from '../shared/format.js';
import { isFiniteNumber, round } from '../shared/math.js';

import type {
  ComponentBreakdown,
  MetricInput,
  MetricScore,
  NormalizationResult,
  PeriodValue,
} from './types.js';

export type ScoreMetricOptions = ExplainOptions;

/** Ordena a série por `periodEnd` (estável; datas inválidas mantêm a ordem de chegada). */
export function sortSeries(series: readonly PeriodValue[]): PeriodValue[] {
  return series
    .map((item, index) => ({ item, index, time: Date.parse(item.periodEnd) }))
    .sort((a, b) => {
      if (Number.isNaN(a.time) || Number.isNaN(b.time)) return a.index - b.index;
      return a.time - b.time || a.index - b.index;
    })
    .map(({ item }) => item);
}

export interface CombinedComponents {
  metricHealth: number | null;
  confidence: number;
  components: ComponentBreakdown;
}

/**
 * §8 — combina current/trend/persistence com os pesos configurados (padrão 0,45/0,35/0,20).
 * Componente `null` sai da conta: o peso dele é redistribuído proporcionalmente entre os válidos
 * e a confiança da métrica cai na mesma proporção (peso válido / peso total).
 */
export function combineComponents(
  values: { current: number | null; trend: number | null; persistence: number | null },
  configured: Partial<ComponentWeights> = {},
  options: { requireCurrent?: boolean } = {},
): CombinedComponents {
  const weightsConfigured: ComponentWeights = { ...DEFAULT_COMPONENT_WEIGHTS, ...configured };
  const entries = Object.entries(weightsConfigured) as [keyof ComponentWeights, number][];
  for (const [key, weight] of entries) {
    if (!isFiniteNumber(weight) || weight < 0) {
      throw new EngineConfigError(`Peso do componente ${key} inválido: ${String(weight)}.`);
    }
  }
  const total = entries.reduce((acc, [, w]) => acc + w, 0);
  if (total <= 0) throw new EngineConfigError('Os pesos dos componentes não podem somar zero.');

  // Sem current_health a métrica é N/A: tendência e persistência sozinhas não dizem como o
  // cliente está agora, e ausência nunca vira saúde (§25, §66).
  const requireCurrent = options.requireCurrent ?? true;
  if (requireCurrent && !isFiniteNumber(values.current)) {
    return {
      metricHealth: null,
      confidence: 0,
      components: {
        ...values,
        weightsUsed: { current: 0, trend: 0, persistence: 0 },
        weightsConfigured,
      },
    };
  }

  const valid = entries.filter(([key]) => isFiniteNumber(values[key]));
  const validWeight = valid.reduce((acc, [, w]) => acc + w, 0);

  const weightsUsed: ComponentWeights = { current: 0, trend: 0, persistence: 0 };
  if (validWeight > 0) {
    for (const [key, w] of valid) {
      (weightsUsed as Record<keyof ComponentWeights, number>)[key] = round(w / validWeight, 6);
    }
  }

  const metricHealth =
    validWeight > 0
      ? round(
          valid.reduce((acc, [key]) => acc + (values[key] as number) * weightsUsed[key], 0),
          2,
        )
      : null;

  return {
    metricHealth,
    confidence: round((validWeight / total) * 100, 2),
    components: { ...values, weightsUsed, weightsConfigured },
  };
}

/**
 * Calcula o score completo de uma métrica para o período atual (§8–§11, §27, §29):
 * normaliza cada período (histórico do próprio cliente como baseline), tendência, persistência,
 * composição com redistribuição de pesos, gatilhos e explicação.
 */
export function scoreMetric(input: MetricInput, options: ScoreMetricOptions = {}): MetricScore {
  const { metric } = input;
  if (!isFiniteNumber(metric.weight) || metric.weight < 0) {
    throw new EngineConfigError(`Métrica ${metric.name}: peso inválido.`);
  }
  const series = sortSeries(input.series);
  const values = series.map((p) => (isFiniteNumber(p.value) ? p.value : null));

  // current_health por período, usando só o que se sabia até aquele período (§59).
  const normalizations: NormalizationResult[] = series.map((period, index) =>
    normalize(
      {
        value: values[index] ?? null,
        text: period.text ?? null,
        history: values.slice(0, index),
        direction: metric.direction,
      },
      metric.normalization,
    ),
  );
  const healthSeries = normalizations.map((n) => n.health);

  const current = series[series.length - 1];
  const normalization: NormalizationResult = normalizations[normalizations.length - 1] ?? {
    health: null,
    strategy: metric.normalization.strategy,
    baseline: null,
    deviationPct: null,
    reason: 'Série vazia: nenhum período informado.',
  };
  const currentValue = values[values.length - 1] ?? null;
  const previousValue = values.length >= 2 ? (values[values.length - 2] ?? null) : null;

  const trend = computeTrend(
    {
      series: values,
      healthSeries,
      direction: metric.direction,
      currentHealth: normalization.health,
      baseline: normalization.baseline,
    },
    metric.trend ?? {},
  );
  const persistence = computePersistence(healthSeries, metric.persistence ?? {});

  const combined = combineComponents(
    { current: normalization.health, trend: trend.health, persistence: persistence.health },
    metric.componentWeights ?? {},
  );

  const ruleContext = buildRuleContext(
    {
      value: currentValue,
      text: current?.text ?? null,
      history: values.slice(0, -1),
      direction: metric.direction,
    },
    {},
    input.extra,
  );
  ruleContext.health = normalization.health;
  const triggers = evaluateTriggers(metric.triggers, ruleContext, metric.id);

  const summary = explainMetric(
    {
      metric,
      currentValue,
      previousValue,
      normalization,
      trend,
      ...(input.extra ? { extra: input.extra } : {}),
    },
    options,
  );

  const componentTexts: string[] = [
    normalization.health === null
      ? `Atual: N/A (${normalization.strategy})`
      : `Atual: ${formatNumber(normalization.health)} (${normalization.strategy})`,
    trend.health === null
      ? `Tendência: N/A (${trend.method})`
      : `Tendência: ${formatNumber(trend.health)} (${trend.method}, ${trend.changePercent === null ? formatSigned(trend.change ?? 0) : `${formatSigned(trend.changePercent)} %`} em ${trend.periodsUsed} períodos)`,
    persistence.health === null
      ? 'Persistência: N/A'
      : `Persistência: ${formatNumber(persistence.health)} (${persistence.unhealthyPeriods} de ${persistence.evaluatedPeriods} períodos não saudáveis)`,
  ];

  const notes: string[] = [];
  for (const reason of [normalization.reason, trend.reason, persistence.reason]) {
    if (reason) notes.push(reason);
  }
  if (combined.metricHealth === null) {
    notes.push(
      'Métrica não avaliada neste período (N/A): não entra no health geral e reduz a confiança.',
    );
  } else if (combined.confidence < 100) {
    notes.push(
      `Pesos redistribuídos entre os componentes disponíveis; confiança da métrica ${formatNumber(combined.confidence)} %.`,
    );
  }
  for (const hit of triggers.hits) notes.push(`Gatilho: ${hit.message}`);

  return {
    metricId: metric.id,
    metricKey: metric.key ?? null,
    metricName: metric.name,
    weight: metric.weight,
    direction: metric.direction,
    unit: metric.unit ?? null,
    metricHealth: combined.metricHealth,
    currentHealth: normalization.health,
    trendHealth: trend.health,
    persistenceHealth: persistence.health,
    confidence: combined.confidence,
    components: combined.components,
    currentValue,
    previousValue,
    periodEnd: current?.periodEnd ?? null,
    normalization,
    trend,
    persistence,
    triggers,
    explanation: { summary, components: componentTexts, notes },
  };
}
