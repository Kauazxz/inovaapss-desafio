/**
 * De linha importada para `metric_values` (§36; §11, §15 e §16 de docs/DEFINICOES_METRICAS.md).
 *
 * Puro de propósito: é a única definição de "qual coluna da planilha vira qual métrica" no
 * projeto, usada tanto pela confirmação de uma importação (modules/imports/service.ts) quanto
 * pela carga da planilha do desafio (db/seed/globalsys-data.ts). Nada aqui toca banco.
 *
 * Duas regras do documento de métricas moram aqui:
 *   §15 — divisor zero ("nenhuma reunião prevista") é "não se aplica", valor nulo, nunca 0 %.
 *   §16 — NPS não respondido é observação válida: valor nulo com `answered = false`, nunca nota 0.
 */
import type { MonthlyMetricsRow, NpsRow } from '@inovaapss/importer';

/** Slug da métrica do preset GlobalSys que recebe o valor. */
export type MetricSlug =
  | 'critical_tickets'
  | 'open_tickets'
  | 'resolution_vs_sla'
  | 'platform_usage'
  | 'sla_compliance'
  | 'formal_complaints'
  | 'payment_delay'
  | 'reopened_tickets'
  | 'missed_meetings'
  | 'nps_dissatisfaction';

/** Um valor pronto para virar uma linha de `metric_values`. */
export interface MetricValueDraft {
  metricSlug: MetricSlug;
  /** Valor do período; `null` = não medido (N/A), nunca zero por ausência. */
  value: number | null;
  /** Só para pesquisas (§16): o cliente foi consultado e respondeu, ou não. */
  answered?: boolean;
}

/** Métricas que `monthly_metrics` alimenta, na ordem em que aparecem no preset. */
export const MONTHLY_METRIC_SLUGS: readonly MetricSlug[] = [
  'critical_tickets',
  'open_tickets',
  'resolution_vs_sla',
  'platform_usage',
  'sla_compliance',
  'formal_complaints',
  'payment_delay',
  'reopened_tickets',
  'missed_meetings',
];

/** Métrica que `nps` alimenta. */
export const NPS_METRIC_SLUG: MetricSlug = 'nps_dissatisfaction';

/** Taxa percentual com divisor zero ou ausente tratado como "não se aplica" (§15). */
export function rate(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(4));
}

/** "2025-01" → { start: "2025-01-01", end: "2025-01-31" }. */
export function monthBounds(period: string): { start: string; end: string } {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`Período inválido: ${period}`);
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * Os valores de métrica de uma linha de atendimento mensal. Sempre devolve um item por métrica
 * — inclusive com valor nulo — porque "não medido" é informação: entra na confiança do score
 * (§66 da SPEC), diferente de simplesmente não existir.
 */
export function monthlyMetricValues(row: MonthlyMetricsRow): MetricValueDraft[] {
  const missedMeetings =
    row.meetings_planned === null || row.meetings_completed === null
      ? null
      : row.meetings_planned - row.meetings_completed;

  return [
    { metricSlug: 'critical_tickets', value: row.critical_tickets },
    { metricSlug: 'open_tickets', value: row.open_tickets },
    { metricSlug: 'resolution_vs_sla', value: row.avg_resolution_hours },
    { metricSlug: 'platform_usage', value: row.platform_usage_pct },
    { metricSlug: 'sla_compliance', value: row.sla_compliance_pct },
    { metricSlug: 'formal_complaints', value: row.formal_complaints },
    { metricSlug: 'payment_delay', value: row.payment_delay_days },
    // Taxas derivadas (§11 e §15 do documento de métricas).
    { metricSlug: 'reopened_tickets', value: rate(row.reopened_tickets, row.open_tickets) },
    { metricSlug: 'missed_meetings', value: rate(missedMeetings, row.meetings_planned) },
  ];
}

/** O valor de NPS de uma pesquisa (§16: não respondeu → valor nulo com answered = false). */
export function npsMetricValue(row: NpsRow): MetricValueDraft {
  return {
    metricSlug: NPS_METRIC_SLUG,
    value: row.answered ? row.score : null,
    answered: row.answered,
  };
}
