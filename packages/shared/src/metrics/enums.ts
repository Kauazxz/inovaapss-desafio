/**
 * Enums do motor de métricas persistido (Etapa 3): periodicidade da métrica e status da versão
 * de um modelo. Tipo, direção, fonte, estratégia de normalização e modo de peso já estão em
 * `domain.ts` (§6, §9, §32).
 */

// ---------- §6 Periodicidade com que o valor da métrica é medido ----------
export const METRIC_PERIODICITIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export type MetricPeriodicity = (typeof METRIC_PERIODICITIES)[number];
export const MetricPeriodicity = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY',
} as const satisfies Record<string, MetricPeriodicity>;

// ---------- §31 Status de uma versão do modelo ----------
export const METRIC_MODEL_VERSION_STATUSES = ['draft', 'active', 'archived'] as const;
export type MetricModelVersionStatus = (typeof METRIC_MODEL_VERSION_STATUSES)[number];
export const MetricModelVersionStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const satisfies Record<string, MetricModelVersionStatus>;

/** §41 — tolerância ao conferir que os pesos ativos somam 100 % (1,0000 ± 0,0001). */
export const WEIGHT_SUM_TOLERANCE = 0.0001;
/** Pesos são gravados com 4 casas decimais (numeric(6,4)). */
export const WEIGHT_DECIMALS = 4;
