import { DEFAULT_COMPONENT_WEIGHTS, type ComponentWeights } from '@inovaapss/shared';

import { analyzeResponses } from './derived.js';
import { explainMetric, explainUnanswered, type ExplainOptions } from './explain.js';
import { buildRuleContext, normalize } from './normalization.js';
import { computePersistence } from './persistence.js';
import { computeTrend } from './trend.js';
import { evaluateTriggers } from './triggers.js';
import { EngineConfigError } from '../shared/errors.js';
import { formatNumber, formatSigned, pluralize } from '../shared/format.js';
import { isFiniteNumber, round } from '../shared/math.js';

import type {
  ComponentBreakdown,
  MetricInput,
  MetricScore,
  NormalizationResult,
  PeriodValue,
  ResponseAnalysis,
  UnansweredPolicy,
} from './types.js';

export type ScoreMetricOptions = ExplainOptions;

/** §22 — padrão: manter o último health respondido por até 3 períodos sem resposta. */
export const DEFAULT_UNANSWERED_POLICY: Required<UnansweredPolicy> = {
  carryLast: true,
  maxCarryPeriods: 3,
};

/** Frescor de um health mantido de `periodsSince` períodos atrás: 0,75 · 0,5 · 0,25 com o padrão 3. */
export function carriedFreshness(periodsSince: number, maxCarryPeriods: number): number {
  return round(Math.max(0, 1 - periodsSince / (maxCarryPeriods + 1)), 4);
}

interface UnansweredResolution {
  response: ResponseAnalysis;
  /** Health mantido do último período respondido, ou `null` (N/A). */
  carriedHealth: number | null;
  /** Índice, na série ordenada, do período de onde o health foi mantido. */
  carriedFrom: number | null;
  freshness: number;
}

/**
 * §22 — o período atual tem `answered: false`: o cliente foi consultado e não respondeu. Não é
 * "sem dado": analisa o histórico de resposta e, pela política da métrica, mantém o último health
 * respondido com frescor reduzido (até `maxCarryPeriods`), senão N/A. Nunca zero.
 */
function resolveUnanswered(
  series: readonly PeriodValue[],
  values: readonly (number | null)[],
  healths: readonly (number | null)[],
  policy: UnansweredPolicy | undefined,
): UnansweredResolution {
  const response = analyzeResponses(
    series.map((p, i) => ({
      answered: p.answered ?? values[i] !== null,
      value: values[i] ?? null,
    })),
  );
  const { carryLast, maxCarryPeriods } = { ...DEFAULT_UNANSWERED_POLICY, ...policy };
  if (!Number.isInteger(maxCarryPeriods) || maxCarryPeriods < 0) {
    throw new EngineConfigError('unanswered.maxCarryPeriods deve ser um inteiro ≥ 0.');
  }
  const since = response.periodsSinceLastAnswer;
  if (!carryLast || since === null || since > maxCarryPeriods) {
    return { response, carriedHealth: null, carriedFrom: null, freshness: 1 };
  }
  const from = series.length - 1 - since;
  const carried = healths[from];
  if (!isFiniteNumber(carried)) {
    return { response, carriedHealth: null, carriedFrom: null, freshness: 1 };
  }
  return {
    response,
    carriedHealth: carried,
    carriedFrom: from,
    freshness: carriedFreshness(since, maxCarryPeriods),
  };
}

/** Campos que o motor acrescenta a `extra` quando a série traz `answered` (gatilhos e modelos de texto). */
function responseExtra(response: ResponseAnalysis): Record<string, number | boolean | null> {
  return {
    unanswered_streak: response.consecutiveUnanswered,
    response_rate: response.responseRate,
    behavior_changed: response.behaviorChanged,
    periods_since_last_answer: response.periodsSinceLastAnswer,
    last_answered_value: response.lastAnsweredValue,
  };
}

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
  // `answered: false` = consultado e não respondeu (§22): o valor é ignorado, mas o período não
  // é "sem dado" — é tratado logo abaixo, depois da normalização.
  const values = series.map((p) =>
    p.answered !== false && isFiniteNumber(p.value) ? p.value : null,
  );
  const tracksResponses = series.some((p) => p.answered !== undefined);

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
  let normalization: NormalizationResult = normalizations[normalizations.length - 1] ?? {
    health: null,
    strategy: metric.normalization.strategy,
    baseline: null,
    deviationPct: null,
    reason: 'Série vazia: nenhum período informado.',
  };
  const currentValue = values[values.length - 1] ?? null;
  const previousValue = values.length >= 2 ? (values[values.length - 2] ?? null) : null;

  let response: ResponseAnalysis | null = null;
  let freshness = 1;
  let extra = input.extra;
  if (tracksResponses) {
    const resolved = resolveUnanswered(series, values, healthSeries, metric.unanswered);
    response = resolved.response;
    extra = { ...responseExtra(response), ...input.extra };
    if (current?.answered === false) {
      if (resolved.carriedHealth !== null && resolved.carriedFrom !== null) {
        const from = normalizations[resolved.carriedFrom] as NormalizationResult;
        freshness = resolved.freshness;
        normalization = {
          ...from,
          reason: `Sem resposta neste período: mantido o último health respondido (há ${pluralize(response.periodsSinceLastAnswer ?? 0, 'período')}) com frescor ${formatNumber(freshness * 100, 0)} %.`,
        };
        healthSeries[healthSeries.length - 1] = resolved.carriedHealth;
      } else {
        normalization = {
          ...normalization,
          reason: `${response.reason} Métrica N/A neste período (não é zero).`,
        };
      }
    }
  }

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
    extra,
  );
  ruleContext.health = normalization.health;
  const triggers = evaluateTriggers(metric.triggers, ruleContext, metric.id);

  const explainInput = {
    metric,
    currentValue,
    previousValue,
    normalization,
    trend,
    ...(extra ? { extra } : {}),
  };
  const summary =
    response !== null && current?.answered === false && !metric.explanationTemplate
      ? explainUnanswered({ ...explainInput, response, carried: freshness < 1 }, options)
      : explainMetric(explainInput, options);

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
  if (response !== null) notes.push(response.reason);
  if (combined.metricHealth === null) {
    notes.push(
      'Métrica não avaliada neste período (N/A): não entra no health geral e reduz a confiança.',
    );
  } else if (freshness < 1) {
    notes.push(
      `Health mantido do último período respondido: entra no health geral com frescor ${formatNumber(freshness * 100, 0)} % (reduz a confiança, não a saúde).`,
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
    freshness,
    response,
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
