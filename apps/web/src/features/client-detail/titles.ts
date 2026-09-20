/**
 * Títulos dinâmicos com o "e daí?" (DATAVIZ.md §1.5) da visão do cliente. Fora dos componentes
 * para o Fast Refresh e para os testes montarem a frase esperada.
 */
import type { MetricScoreDto } from '@inovaapss/shared';

import { formatInteger } from '@/lib/format';

/** Os 10 scores: quem responde pelo risco ("Chamados críticos e SLA respondem por 21 dos 69 pontos de risco"). */
export function metricScoresTitle(
  scores: readonly MetricScoreDto[],
  riskScore: number | null,
): string {
  const negative = [...scores]
    .filter((score) => score.metricHealth !== null && score.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution);
  if (negative.length === 0) return 'Nenhuma métrica puxa o health para baixo neste período';
  const top = negative.slice(0, 2);
  const points = top.reduce((sum, score) => sum + score.contribution, 0);
  const names = top.map((score) => score.metricName).join(' e ');
  const total = riskScore === null ? '' : ` dos ${formatInteger(riskScore)}`;
  return `${names} ${top.length > 1 ? 'respondem' : 'responde'} por ${formatInteger(points)}${total} pontos de risco`;
}

/** Reuniões: "2 de 6 reuniões previstas não ocorreram nos últimos 6 meses" ou o N/A. */
export function meetingsTitle(
  points: readonly { planned: number; completed: number; label: string }[],
): string {
  const withMeetings = points.filter((point) => point.planned > 0);
  if (withMeetings.length === 0) return 'N/A — nenhuma reunião prevista no período';
  const planned = withMeetings.reduce((sum, point) => sum + point.planned, 0);
  const missed = withMeetings.reduce((sum, point) => sum + point.planned - point.completed, 0);
  const span = `${points.length === 1 ? 'no último mês' : `nos últimos ${points.length} meses`}`;
  if (missed === 0) return `Todas as ${planned} reuniões previstas ocorreram ${span}`;
  const last = [...withMeetings].reverse().find((point) => point.completed < point.planned);
  const recency = last ? ` — a última em ${last.label}` : '';
  return `${missed} de ${planned} reuniões previstas não ${missed === 1 ? 'ocorreu' : 'ocorreram'} ${span}${recency}`;
}

/** NPS: "Respondeu 3 de 4 pesquisas; última nota 6 (Detrator)" — nunca trata silêncio como zero. */
export function npsTitle(
  quarters: readonly {
    label: string;
    answered: boolean;
    score: number | null;
    classification: string | null;
  }[],
): string {
  const answered = quarters.filter((quarter) => quarter.answered);
  if (answered.length === 0)
    return `Não respondeu nenhuma das ${quarters.length} pesquisas — sem nota, não zero`;
  const last = quarters[quarters.length - 1];
  const lastText =
    last && last.answered && last.score !== null
      ? `última nota ${last.score} (${last.classification ?? ''}) em ${last.label}`
      : `não respondeu a última pesquisa (${last?.label ?? ''})`;
  return `Respondeu ${answered.length} de ${quarters.length} pesquisas; ${lastText}`;
}
