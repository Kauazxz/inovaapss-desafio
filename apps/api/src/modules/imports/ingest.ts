/**
 * Da linha validada ao que vai para o banco — parte pura, sem Drizzle, para os testes cobrirem
 * as regras sem subir um Postgres.
 *
 * Duas delas não podem se perder em nenhuma reescrita (docs/DEFINICOES_METRICAS.md §15 e §16, a
 * mesma coisa que o seed da planilha faz):
 *
 *   §15  reuniões previstas = 0  → o percentual de reuniões perdidas é NULO ("não se aplica"),
 *        nunca 0 %. Zero por cento diria "não perdeu nenhuma reunião", quando na verdade não
 *        havia reunião marcada. Vale para qualquer taxa com divisor zero.
 *   §16  NPS não respondido      → valor NULO com `answered = 'false'`, nunca nota zero. Nota
 *        zero é a pior avaliação possível; silêncio não é avaliação. A coluna `answered`
 *        separa "foi perguntado e não respondeu" de "não foi perguntado".
 */
import type { ClientStatusRow, MonthlyMetricsRow, NpsRow } from '@inovaapss/importer';

/**
 * Campo do dataset `monthly_metrics` → slug da métrica cadastrada. Os slugs são os do preset
 * GlobalSys (db/seed/presets/globalsys-v1.ts); uma métrica que a organização não tenha é
 * simplesmente ignorada, e o código aparece em `skipped`.
 */
export const MONTHLY_METRIC_SLUGS: Readonly<Record<string, string>> = {
  open_tickets: 'open_tickets',
  critical_tickets: 'critical_tickets',
  avg_resolution_hours: 'resolution_vs_sla',
  platform_usage_pct: 'platform_usage',
  sla_compliance_pct: 'sla_compliance',
  formal_complaints: 'formal_complaints',
  payment_delay_days: 'payment_delay',
};

/** Slug da métrica que recebe a nota do NPS. */
export const NPS_METRIC_SLUG = 'nps_dissatisfaction';
/** Taxa de reabertura (chamados reabertos ÷ abertos). */
export const REOPENED_METRIC_SLUG = 'reopened_tickets';
/** Taxa de reuniões perdidas ((previstas − realizadas) ÷ previstas). */
export const MISSED_MEETINGS_METRIC_SLUG = 'missed_meetings';

/** Um valor pronto para virar linha em `metric_values`. */
export interface MetricValueInput {
  externalCode: string;
  metricSlug: string;
  /** "AAAA-MM". */
  period: string;
  /** Null = não medido (N/A). Nunca zero por ausência. */
  value: number | null;
  /** Só o NPS usa: true respondeu, false foi perguntado e não respondeu. */
  answered?: boolean;
}

/** "2025-01" → { start: "2025-01-01", end: "2025-01-31" }. */
export function monthBounds(period: string): { start: string; end: string } {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) throw new Error(`Período inválido: ${period}`);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * Taxa percentual. Divisor zero, nulo ou numerador nulo → null ("não se aplica"), nunca 0 %
 * (§15). É esta linha que impede um cliente sem reunião marcada de aparecer com 0 % de reuniões
 * perdidas, o que o motor leria como desempenho perfeito.
 */
export function rate(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(4));
}

/** Reuniões perdidas no mês; nulo quando falta qualquer um dos dois números. */
export function missedMeetings(row: MonthlyMetricsRow): number | null {
  if (row.meetings_planned === null || row.meetings_completed === null) return null;
  return row.meetings_planned - row.meetings_completed;
}

/** Converte as linhas de atendimento mensal nos valores de cada métrica. */
export function monthlyMetricValues(rows: readonly MonthlyMetricsRow[]): MetricValueInput[] {
  const values: MetricValueInput[] = [];
  for (const row of rows) {
    const base = { externalCode: row.external_code, period: row.period };
    for (const [field, slug] of Object.entries(MONTHLY_METRIC_SLUGS)) {
      values.push({
        ...base,
        metricSlug: slug,
        value: row[field as keyof MonthlyMetricsRow] as number | null,
      });
    }
    values.push({
      ...base,
      metricSlug: REOPENED_METRIC_SLUG,
      value: rate(row.reopened_tickets, row.open_tickets),
    });
    values.push({
      ...base,
      metricSlug: MISSED_MEETINGS_METRIC_SLUG,
      value: rate(missedMeetings(row), row.meetings_planned),
    });
  }
  return values;
}

/**
 * Converte as pesquisas de NPS. Quem não respondeu entra com valor nulo e `answered: false` —
 * a ausência de resposta é uma observação, não uma nota (§16).
 */
export function npsMetricValues(rows: readonly NpsRow[]): MetricValueInput[] {
  return rows.map((row) => ({
    externalCode: row.external_code,
    period: row.period,
    metricSlug: NPS_METRIC_SLUG,
    value: row.answered ? row.score : null,
    answered: row.answered,
  }));
}

/** Todos os valores de um arquivo, na ordem em que serão gravados. */
export function toMetricValueInputs(
  monthly: readonly MonthlyMetricsRow[],
  nps: readonly NpsRow[],
): MetricValueInput[] {
  return [...monthlyMetricValues(monthly), ...npsMetricValues(nps)];
}

/** Situação do cliente, por código externo, para a gravação decidir status e fim do contrato. */
export function statusByExternalCode(
  rows: readonly ClientStatusRow[],
): Map<string, ClientStatusRow> {
  return new Map(rows.map((row) => [row.external_code, row]));
}

/** Último dia do mês do cancelamento — quando o contrato termina (§33). */
export function cancellationEndDate(row: ClientStatusRow | undefined): string | null {
  if (row === undefined || row.status !== 'cancelled' || row.cancellation_period === null) {
    return null;
  }
  return monthBounds(row.cancellation_period).end;
}
