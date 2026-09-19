import {
  DEFAULT_HEALTH_BANDS,
  DEFAULT_PRIORITY_BANDS,
  DEFAULT_PRIORITY_WEIGHTS,
  classifyHealth,
  classifyPriority,
  clampScore,
  riskFromHealth,
  type ClassBand,
  type HealthClass,
} from '@inovaapss/shared';

import { EngineConfigError } from '../shared/errors.js';
import { isFiniteNumber, round } from '../shared/math.js';

import type {
  CommercialImpactConfig,
  CommercialImpactInput,
  CommercialImpactResult,
  MetricContribution,
  OverallHealthConfig,
  OverallHealthResult,
  PriorityConfig,
  PriorityInput,
  PriorityResult,
} from './types.js';

/**
 * §24 — health geral ponderado só pelas métricas disponíveis; §25 — confiança = cobertura
 * ponderada (peso × disponibilidade, onde disponibilidade considera a confiança da métrica e o
 * frescor opcional); §26 — risco = 100 − health.
 */
export function computeOverallHealth(
  contributions: readonly MetricContribution[],
  config: OverallHealthConfig = {},
  bands: readonly ClassBand<HealthClass>[] = DEFAULT_HEALTH_BANDS,
): OverallHealthResult {
  const useConfidence = config.useMetricConfidence ?? true;
  let totalWeight = 0;
  let availableWeight = 0;
  let weightedHealth = 0;
  let coverage = 0;

  for (const c of contributions) {
    if (!isFiniteNumber(c.weight) || c.weight < 0) {
      throw new EngineConfigError(`Peso inválido para a métrica ${c.metricId}.`);
    }
    if (c.weight === 0) continue;
    totalWeight += c.weight;
    if (!isFiniteNumber(c.metricHealth)) continue;
    availableWeight += c.weight;
    weightedHealth += c.weight * clampScore(c.metricHealth);
    const confidenceFactor = useConfidence ? clampScore(c.confidence) / 100 : 1;
    const freshness = isFiniteNumber(c.freshness) ? Math.min(1, Math.max(0, c.freshness)) : 1;
    coverage += c.weight * confidenceFactor * freshness;
  }

  const normalizedWeights: Record<string, number> = {};
  if (availableWeight > 0) {
    for (const c of contributions) {
      if (c.weight > 0 && isFiniteNumber(c.metricHealth)) {
        normalizedWeights[c.metricId] = round(c.weight / availableWeight, 6);
      }
    }
  }

  const overallHealth = availableWeight > 0 ? round(weightedHealth / availableWeight, 2) : null;
  return {
    overallHealth,
    riskScore: overallHealth === null ? null : round(riskFromHealth(overallHealth), 2),
    healthClass: overallHealth === null ? null : classifyHealth(overallHealth, bands),
    analysisConfidence: totalWeight > 0 ? round((coverage / totalWeight) * 100, 2) : 0,
    totalWeight: round(totalWeight, 6),
    availableWeight: round(availableWeight, 6),
    normalizedWeights,
  };
}

/**
 * §28 — impacto comercial 0–100 a partir de fatores configuráveis (valor mensal relativo ao
 * maior da carteira, importância estratégica, fatores extras). Fator desconhecido sai da conta
 * (peso redistribuído); sem nenhum fator, `null`.
 */
export function computeCommercialImpact(
  input: CommercialImpactInput,
  config: CommercialImpactConfig = {},
): CommercialImpactResult {
  const factors: Record<string, { score: number | null; weight: number }> = {};

  const monthlyWeight = config.weights?.monthlyValue ?? 0.6;
  const strategicWeight = config.weights?.strategicImportance ?? 0.4;

  let monthlyScore: number | null = null;
  if (isFiniteNumber(input.monthlyValue) && isFiniteNumber(input.referenceMonthlyValue)) {
    monthlyScore =
      input.referenceMonthlyValue > 0
        ? round(clampScore((input.monthlyValue / input.referenceMonthlyValue) * 100), 2)
        : null;
  }
  factors.monthlyValue = { score: monthlyScore, weight: monthlyWeight };

  factors.strategicImportance = {
    score: isFiniteNumber(input.strategicImportance)
      ? round(clampScore(input.strategicImportance), 2)
      : null,
    weight: strategicWeight,
  };

  for (const [key, factor] of Object.entries(input.extraFactors ?? {})) {
    factors[key] = {
      score: isFiniteNumber(factor.score) ? round(clampScore(factor.score), 2) : null,
      weight: factor.weight,
    };
  }

  let weightSum = 0;
  let weighted = 0;
  for (const factor of Object.values(factors)) {
    if (!isFiniteNumber(factor.weight) || factor.weight < 0) {
      throw new EngineConfigError('Impacto comercial: peso de fator inválido.');
    }
    if (factor.score === null || factor.weight === 0) continue;
    weightSum += factor.weight;
    weighted += factor.weight * factor.score;
  }

  return { score: weightSum > 0 ? round(weighted / weightSum, 2) : null, factors };
}

/**
 * §28 — prioridade = risco × 0,70 + impacto comercial × 0,30 (pesos configuráveis), classificada
 * pelas faixas P0–P3. Sem impacto conhecido, usa só o risco. O piso dos gatilhos (§27) eleva o
 * score sem tocar no risco.
 */
export function computePriority(input: PriorityInput, config: PriorityConfig = {}): PriorityResult {
  const weights = config.weights ?? DEFAULT_PRIORITY_WEIGHTS;
  if (
    !isFiniteNumber(weights.risk) ||
    !isFiniteNumber(weights.impact) ||
    weights.risk < 0 ||
    weights.impact < 0 ||
    weights.risk + weights.impact <= 0
  ) {
    throw new EngineConfigError('Prioridade: pesos de risco e impacto inválidos.');
  }
  const bands = config.bands ?? DEFAULT_PRIORITY_BANDS;

  if (!isFiniteNumber(input.riskScore)) {
    const floor = isFiniteNumber(input.priorityFloor) ? clampScore(input.priorityFloor) : null;
    return {
      priorityScore: floor,
      priorityClass: floor === null ? null : classifyPriority(floor, bands),
      computedScore: null,
      floorApplied: floor !== null,
      weightsUsed: { risk: 0, impact: 0 },
    };
  }

  const risk = clampScore(input.riskScore);
  let weightsUsed: { risk: number; impact: number };
  let computed: number;
  if (isFiniteNumber(input.commercialImpactScore)) {
    const total = weights.risk + weights.impact;
    weightsUsed = {
      risk: round(weights.risk / total, 6),
      impact: round(weights.impact / total, 6),
    };
    computed =
      risk * weightsUsed.risk + clampScore(input.commercialImpactScore) * weightsUsed.impact;
  } else {
    weightsUsed = { risk: 1, impact: 0 };
    computed = risk;
  }
  computed = round(clampScore(computed), 2);

  const floor = isFiniteNumber(input.priorityFloor) ? clampScore(input.priorityFloor) : null;
  const floorApplied = floor !== null && floor > computed;
  const priorityScore = floorApplied ? round(floor, 2) : computed;

  return {
    priorityScore,
    priorityClass: classifyPriority(priorityScore, bands),
    computedScore: computed,
    floorApplied,
    weightsUsed,
  };
}
