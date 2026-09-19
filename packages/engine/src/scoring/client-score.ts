import { buildEvidence } from './evidence.js';
import { scoreMetric } from './metric-health.js';
import { computeCommercialImpact, computeOverallHealth, computePriority } from './overall.js';
import { mergeTriggerEvaluations } from './triggers.js';
import { isFiniteNumber } from '../shared/math.js';

import type { ClientScoreInput, ClientScoreResult, MetricContribution } from './types.js';

/**
 * Pipeline completo de um cliente (§69): métricas → health geral → risco → confiança → impacto
 * comercial → prioridade → evidências. Puro: quem persiste snapshots é a API.
 */
export function scoreClient(input: ClientScoreInput): ClientScoreResult {
  const config = input.config ?? {};
  const activeMetrics = input.metrics.filter((m) => m.metric.isActive !== false);

  const metricScores = activeMetrics.map((m) =>
    scoreMetric(m, config.periodLabel ? { periodLabel: config.periodLabel } : {}),
  );

  const contributions: MetricContribution[] = metricScores.map((s) => ({
    metricId: s.metricId,
    weight: s.weight,
    metricHealth: s.metricHealth,
    confidence: s.confidence,
  }));
  const overall = computeOverallHealth(contributions, config.overall ?? {}, config.healthBands);

  const triggers = mergeTriggerEvaluations(metricScores.map((s) => s.triggers));

  let commercialImpactScore: number | null = null;
  if (isFiniteNumber(input.commercialImpact)) {
    commercialImpactScore = Math.min(100, Math.max(0, input.commercialImpact));
  } else if (input.commercialImpact && typeof input.commercialImpact === 'object') {
    commercialImpactScore = computeCommercialImpact(
      input.commercialImpact,
      config.commercialImpact ?? {},
    ).score;
  }

  const priority = computePriority(
    {
      riskScore: overall.riskScore,
      commercialImpactScore,
      priorityFloor: triggers.priorityFloor,
    },
    config.priority ?? {},
  );

  const evidence = buildEvidence(metricScores, overall.normalizedWeights);

  const periodEnd = metricScores
    .map((s) => s.periodEnd)
    .filter((p): p is string => typeof p === 'string')
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

  return {
    clientId: input.clientId,
    periodEnd: periodEnd ?? null,
    overallHealth: overall.overallHealth,
    riskScore: overall.riskScore,
    healthClass: overall.healthClass,
    analysisConfidence: overall.analysisConfidence,
    commercialImpactScore,
    priorityScore: priority.priorityScore,
    priorityClass: priority.priorityClass,
    priorityFloor: triggers.priorityFloor,
    metrics: metricScores,
    evidence,
    triggers,
    overall,
    priority,
  };
}
