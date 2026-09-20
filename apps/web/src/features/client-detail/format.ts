/** Textos e formatos da visão do cliente (§57/§58: score sempre com contexto). Tudo em pt-BR. */
import {
  HEALTH_CLASS_LABELS,
  PROJECTION_CONFIDENCE_LABELS,
  type ClientScoreSummaryDto,
  type HealthClass,
  type HealthTrend,
} from '@inovaapss/shared';

import { formatInteger } from '@/lib/format';

const MINUS = '−';

const shortDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const longDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `31 ago. 2026` — datas de contrato e eventos. */
export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso));
}

/** `31 de agosto de 2026` — para leitores de tela e tooltips. */
export function formatLongDate(iso: string): string {
  return longDate.format(new Date(iso));
}

/** Número decimal em pt-BR com até `digits` casas: `12,5`. */
export function formatDecimal(value: number, digits = 1): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value);
}

/** Valor bruto de uma métrica com a unidade: `84 %`, `12,5 h`, `3 chamados`, `N/A`. */
export function formatMetricValue(
  value: number | null,
  unit: string | null,
  naReason: string | null = null,
): string {
  if (value === null) return naReason ? `N/A — ${naReason}` : 'N/A';
  const text = formatDecimal(value, 1);
  if (!unit) return text;
  return `${text} ${unit}`;
}

/** Variação em texto com sinal: `+3`, `−12 p.p.`, `sem variação`. */
export function formatSignedDelta(delta: number | null, unit = ''): string | null {
  if (delta === null) return null;
  if (delta === 0) return 'sem variação';
  const sign = delta > 0 ? '+' : MINUS;
  return `${sign}${formatDecimal(Math.abs(delta), 1)}${unit ? ` ${unit}` : ''}`;
}

export const HEALTH_TREND_TEXT: Readonly<Record<HealthTrend, string>> = {
  up: 'em melhora',
  down: 'em queda',
  stable: 'estável',
  unknown: 'sem tendência ainda',
};

/** "31/100 — Crítico" (nunca só o número — §58). */
export function formatHealthWithClass(health: number | null, healthClass: HealthClass | null) {
  if (health === null) return 'sem cálculo';
  const label = healthClass ? ` — ${HEALTH_CLASS_LABELS[healthClass]}` : '';
  return `${formatInteger(health)}/100${label}`;
}

/** "caiu 5 pontos vs. ago/26" · "subiu 3 pontos" · "sem período anterior". */
export function formatHealthChange(score: ClientScoreSummaryDto, previousLabel?: string): string {
  if (score.overallHealth === null || score.previousHealth === null) return 'sem período anterior';
  const delta = Math.round(score.overallHealth - score.previousHealth);
  const since = previousLabel ? ` vs. ${previousLabel}` : ' vs. período anterior';
  if (delta === 0) return `sem variação${since}`;
  const points = Math.abs(delta) === 1 ? '1 ponto' : `${Math.abs(delta)} pontos`;
  return `${delta < 0 ? 'caiu' : 'subiu'} ${points}${since}`;
}

/** "projeção 26 — Crítico (confiança alta)" ou "sem projeção — histórico insuficiente". */
export function formatProjection(score: ClientScoreSummaryDto): string {
  if (score.healthProjected === null) return 'sem projeção — histórico insuficiente';
  const label = score.projectedClass ? ` — ${HEALTH_CLASS_LABELS[score.projectedClass]}` : '';
  return `projeção ${formatInteger(score.healthProjected)}${label} (confiança ${PROJECTION_CONFIDENCE_LABELS[score.projectionConfidence]})`;
}

/** "18 %" — peso do modelo em percentual. */
export function formatWeight(weight: number): string {
  return `${formatInteger(weight * 100)} %`;
}

/** Classe do health com a faixa numérica: "Crítico (0–39)". */
export function formatClassWithBand(
  healthClass: HealthClass,
  thresholds: { attention: number; risk: number; critical: number },
): string {
  const bands: Record<HealthClass, string> = {
    NORMAL: `${thresholds.attention}–100`,
    ATTENTION: `${thresholds.risk}–${thresholds.attention - 1}`,
    RISK: `${thresholds.critical}–${thresholds.risk - 1}`,
    CRITICAL: `0–${thresholds.critical - 1}`,
  };
  return `${HEALTH_CLASS_LABELS[healthClass]} (${bands[healthClass]})`;
}
