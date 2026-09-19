import {
  DEFAULT_HEALTH_BANDS,
  DEFAULT_TREND_WINDOW_PERIODS,
  classifyHealth,
  classifyPriority,
  clampScore,
  type ClassBand,
  type HealthClass,
  type PriorityClass,
} from '@inovaapss/shared';

import { EngineConfigError } from '../shared/errors.js';
import { isFiniteNumber, linearSlope, round } from '../shared/math.js';

import type { ForecastChartData, ForecastRow, ProjectionConfidence } from './types.js';

/** Ordem de gravidade: quanto maior, pior. */
const CLASS_SEVERITY: Readonly<Record<HealthClass, number>> = {
  NORMAL: 0,
  ATTENTION: 1,
  RISK: 2,
  CRITICAL: 3,
};

export interface ForecastConfig {
  /** Janela N de períodos (padrão 3, §10). */
  trendWindow?: number;
  healthBands?: readonly ClassBand<HealthClass>[];
  /** analysis_confidence mínimo para projeção "high" (padrão 70). */
  highConfidenceAt?: number;
  /** Classes que contam como "cruzou para baixo" (padrão Risco e Crítico). */
  crossingClasses?: readonly HealthClass[];
}

export interface ForecastClientInput {
  clientId: string;
  clientName: string;
  mrr: number;
  currency: string;
  priorityScore: number;
  priorityClass?: PriorityClass;
  /** overall_health por período, do mais antigo para o mais recente; o último é o atual. */
  healthHistory: readonly (number | null)[];
  /** analysis_confidence do snapshot atual (0–100). */
  analysisConfidence: number;
  /** human_explanation do driver com maior contribuição negativa. */
  topEvidence: string;
  /** period_end do snapshot atual (ISO 8601). */
  periodEnd: string;
}

export interface ProjectionResult {
  projected: number | null;
  slope: number | null;
  periodsAvailable: number;
  confidence: ProjectionConfidence;
}

/**
 * DATAVIZ.md §5.2 — projeção por tendência (não é modelo preditivo):
 * `projetado = clamp(health_atual + slope × 1, 0, 100)`, com o slope da regressão linear simples
 * sobre os últimos N períodos (com 2 pontos é o delta). Menos de 2 pontos → sem projeção, "low".
 */
export function projectHealth(
  healthHistory: readonly (number | null)[],
  analysisConfidence: number,
  config: ForecastConfig = {},
): ProjectionResult {
  const window = config.trendWindow ?? DEFAULT_TREND_WINDOW_PERIODS;
  if (!Number.isInteger(window) || window < 2) {
    throw new EngineConfigError('Forecast: a janela precisa ser um inteiro ≥ 2.');
  }
  const points = healthHistory.slice(-window).filter(isFiniteNumber);
  const periodsAvailable = points.length;
  const current = points[points.length - 1];

  if (periodsAvailable < 2 || current === undefined) {
    return { projected: null, slope: null, periodsAvailable, confidence: 'low' };
  }
  const slope = linearSlope(points) as number;
  const projected = round(clampScore(current + slope), 2);
  const highAt = config.highConfidenceAt ?? 70;

  let confidence: ProjectionConfidence;
  if (periodsAvailable < window) confidence = 'low';
  else if (analysisConfidence >= highAt) confidence = 'high';
  else confidence = 'medium';

  return { projected, slope: round(slope, 4), periodsAvailable, confidence };
}

/** Thresholds para as linhas de referência do gráfico, a partir das faixas vigentes. */
export function thresholdsFromBands(
  bands: readonly ClassBand<HealthClass>[],
): ForecastChartData['thresholds'] {
  const minOf = (cls: HealthClass, fallback: number) =>
    bands.find((b) => b.class === cls)?.min ?? fallback;
  return {
    attention: minOf('NORMAL', 80),
    risk: minOf('ATTENTION', 60),
    critical: minOf('RISK', 40),
  };
}

/** Monta uma linha do gráfico de forecast priorizado para um cliente. */
export function buildForecastRow(
  input: ForecastClientInput,
  config: ForecastConfig = {},
): ForecastRow {
  const bands = config.healthBands ?? DEFAULT_HEALTH_BANDS;
  const window = config.trendWindow ?? DEFAULT_TREND_WINDOW_PERIODS;
  const crossingClasses = config.crossingClasses ?? ['RISK', 'CRITICAL'];

  const finite = input.healthHistory.filter(isFiniteNumber);
  const healthCurrent = round(clampScore(finite[finite.length - 1] ?? 0), 2);
  if (finite.length === 0) {
    throw new EngineConfigError(`Forecast: cliente ${input.clientId} sem health atual.`);
  }
  const currentClass = classifyHealth(healthCurrent, bands);
  const projection = projectHealth(input.healthHistory, input.analysisConfidence, config);
  const projectedClass =
    projection.projected === null ? null : classifyHealth(projection.projected, bands);
  const crossesDown =
    projectedClass !== null &&
    crossingClasses.includes(projectedClass) &&
    CLASS_SEVERITY[projectedClass] > CLASS_SEVERITY[currentClass];

  return {
    clientId: input.clientId,
    clientName: input.clientName,
    mrr: input.mrr,
    currency: input.currency,
    priorityScore: round(clampScore(input.priorityScore), 2),
    priorityClass: input.priorityClass ?? classifyPriority(input.priorityScore),
    healthCurrent,
    currentClass,
    healthProjected: projection.projected,
    projectedClass,
    slopePerPeriod: projection.slope,
    trendWindow: window,
    periodsAvailable: projection.periodsAvailable,
    confidence: round(clampScore(input.analysisConfidence), 2),
    projectionConfidence: projection.confidence,
    crossesDown,
    topEvidence: input.topEvidence,
    periodEnd: input.periodEnd,
  };
}

export interface ForecastChartOptions extends ForecastConfig {
  /** Nome do período para o subtítulo ("mês"). Padrão "período". */
  periodLabel?: string;
  /** Quantas linhas devolver (padrão: todas; a UI corta em 10/25). */
  limit?: number;
}

/** Payload completo do gráfico: linhas ordenadas por prioridade e o que o título precisa. */
export function buildForecastChart(
  clients: readonly ForecastClientInput[],
  options: ForecastChartOptions = {},
): ForecastChartData {
  const bands = options.healthBands ?? DEFAULT_HEALTH_BANDS;
  const rows = clients
    .map((c) => buildForecastRow(c, options))
    .sort((a, b) => b.priorityScore - a.priorityScore || a.healthCurrent - b.healthCurrent);
  const limited =
    isFiniteNumber(options.limit) && options.limit > 0 ? rows.slice(0, options.limit) : rows;
  return {
    rows: limited,
    thresholds: thresholdsFromBands(bands),
    trendWindow: options.trendWindow ?? DEFAULT_TREND_WINDOW_PERIODS,
    periodLabel: options.periodLabel ?? 'período',
    crossingCount: limited.filter((r) => r.crossesDown).length,
  };
}
