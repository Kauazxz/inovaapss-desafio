import { isFiniteNumber, round } from '../shared/math.js';

import type { EvidenceDriver, MetricScore } from './types.js';

/** Direção do valor bruto entre o período anterior e o atual. */
export function rawTrendDirection(
  currentValue: number | null,
  previousValue: number | null,
): 'up' | 'down' | 'stable' | null {
  if (!isFiniteNumber(currentValue) || !isFiniteNumber(previousValue)) return null;
  if (currentValue > previousValue) return 'up';
  if (currentValue < previousValue) return 'down';
  return 'stable';
}

/**
 * §29 — drivers do score ordenados pela contribuição para o risco (peso normalizado × (100 − health)).
 * O primeiro é "a principal evidência" do dashboard. Métricas sem health entram no fim, com
 * contribuição zero e a explicação "sem dado" — ausência nunca vira driver de risco nem de saúde.
 */
export function buildEvidence(
  scores: readonly MetricScore[],
  normalizedWeights: Readonly<Record<string, number>>,
): EvidenceDriver[] {
  const drivers = scores.map((score): EvidenceDriver => {
    const weight = normalizedWeights[score.metricId] ?? 0;
    const health = score.metricHealth;
    const contribution = isFiniteNumber(health) ? round(weight * (100 - health), 2) : 0;
    return {
      metricId: score.metricId,
      metricName: score.metricName,
      currentValue: score.currentValue,
      baselineValue: score.normalization.baseline,
      delta:
        isFiniteNumber(score.currentValue) && isFiniteNumber(score.previousValue)
          ? round(score.currentValue - score.previousValue, 4)
          : null,
      trend: rawTrendDirection(score.currentValue, score.previousValue),
      healthScore: health,
      weight: round(weight, 6),
      contribution,
      humanExplanation: score.explanation.summary,
      isNegative: isFiniteNumber(health) && contribution > 0 && health < 100,
    };
  });

  return drivers.sort((a, b) => {
    if (b.contribution !== a.contribution) return b.contribution - a.contribution;
    const aHealth = a.healthScore ?? Number.POSITIVE_INFINITY;
    const bHealth = b.healthScore ?? Number.POSITIVE_INFINITY;
    if (aHealth !== bHealth) return aHealth - bHealth;
    return b.weight - a.weight;
  });
}

/** A principal evidência negativa, ou `null` quando nada puxa a saúde para baixo. */
export function topNegativeEvidence(drivers: readonly EvidenceDriver[]): EvidenceDriver | null {
  return drivers.find((d) => d.isNegative) ?? null;
}
