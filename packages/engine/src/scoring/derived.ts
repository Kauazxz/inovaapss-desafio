import { clampScore } from '@inovaapss/shared';

import { isFiniteNumber, round } from '../shared/math.js';

/**
 * Métricas derivadas do preset GlobalSys (§13–§22, §70). Funções puras: entrada ausente ou
 * inválida devolve `null` (N/A) — nunca zero por falta de dado.
 */

function ratePer(numerator: number | null, denominator: number | null): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator)) return null;
  if (numerator < 0 || denominator < 0) return null;
  return round((numerator / Math.max(denominator, 1)) * 100, 2);
}

/** §13 — `critical_tickets / max(open_tickets, 1) × 100`. */
export function criticalTicketRate(
  criticalTickets: number | null,
  openTickets: number | null,
): number | null {
  return ratePer(criticalTickets, openTickets);
}

/** §17 — `reopened_tickets / max(open_tickets, 1) × 100`. */
export function reopenRate(
  reopenedTickets: number | null,
  openTickets: number | null,
): number | null {
  return ratePer(reopenedTickets, openTickets);
}

/**
 * §16 — `tickets_within_sla / max(resolved_tickets, 1) × 100`. Se a organização já informa
 * `pct_sla_compliance`, ele tem precedência (evita dupla contagem, §23).
 */
export function slaCompliancePct(
  ticketsWithinSla: number | null,
  resolvedTickets: number | null,
  pctSlaCompliance?: number | null,
): number | null {
  if (isFiniteNumber(pctSlaCompliance)) return round(clampScore(pctSlaCompliance), 2);
  return ratePer(ticketsWithinSla, resolvedTickets);
}

/**
 * §21 — `(meetings_planned − meetings_completed) / meetings_planned × 100`.
 * Sem reunião prevista (`planned = 0`) não é saudável nem crítico: N/A.
 */
export function missedMeetingRate(
  meetingsPlanned: number | null,
  meetingsCompleted: number | null,
): number | null {
  if (!isFiniteNumber(meetingsPlanned) || !isFiniteNumber(meetingsCompleted)) return null;
  if (meetingsPlanned <= 0) return null;
  const missed = Math.max(0, meetingsPlanned - Math.max(0, meetingsCompleted));
  return round((missed / meetingsPlanned) * 100, 2);
}

/** §21 — quantas reuniões previstas não ocorreram (para o texto da evidência). */
export function missedMeetings(
  meetingsPlanned: number | null,
  meetingsCompleted: number | null,
): number | null {
  if (!isFiniteNumber(meetingsPlanned) || !isFiniteNumber(meetingsCompleted)) return null;
  if (meetingsPlanned <= 0) return null;
  return Math.max(0, meetingsPlanned - Math.max(0, meetingsCompleted));
}

/**
 * §22 — NPS respondido: `clamp(nps_score × 10, 0, 100)`. Não respondido: N/A — nunca zero.
 */
export function npsHealth(npsAnswered: boolean | null, npsScore: number | null): number | null {
  if (npsAnswered !== true) return null;
  if (!isFiniteNumber(npsScore)) return null;
  return round(clampScore(npsScore * 10), 2);
}

export interface NpsPeriod {
  answered: boolean;
  score: number | null;
}

export interface NpsResponseAnalysis {
  /** Health do período atual (`null` quando não respondeu). */
  health: number | null;
  answered: boolean;
  /** Períodos consecutivos, terminando no atual, sem resposta. */
  consecutiveUnanswered: number;
  /** Fração 0–1 de períodos respondidos no histórico; `null` sem histórico. */
  responseRate: number | null;
  /** Última nota conhecida (NPS 0–10) e há quantos períodos. */
  lastAnsweredScore: number | null;
  periodsSinceLastAnswer: number | null;
  /** O cliente costumava responder e parou (≥ 2 períodos sem resposta com taxa histórica ≥ 50 %). */
  behaviorChanged: boolean;
  reason: string;
}

/**
 * §22 — análise do comportamento de resposta ao NPS. A sequência sem resposta é um sinal que a
 * organização pode usar em gatilhos (`extra.nps_unanswered_streak`), mas o health nunca vira zero
 * automaticamente por falta de resposta.
 */
export function analyzeNpsResponses(history: readonly NpsPeriod[]): NpsResponseAnalysis {
  if (history.length === 0) {
    return {
      health: null,
      answered: false,
      consecutiveUnanswered: 0,
      responseRate: null,
      lastAnsweredScore: null,
      periodsSinceLastAnswer: null,
      behaviorChanged: false,
      reason: 'Sem histórico de NPS.',
    };
  }
  const current = history[history.length - 1] as NpsPeriod;
  const answeredCount = history.filter((p) => p.answered).length;
  const responseRate = round(answeredCount / history.length, 4);

  let consecutiveUnanswered = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if ((history[i] as NpsPeriod).answered) break;
    consecutiveUnanswered += 1;
  }

  let lastAnsweredScore: number | null = null;
  let periodsSinceLastAnswer: number | null = null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const p = history[i] as NpsPeriod;
    if (p.answered && isFiniteNumber(p.score)) {
      lastAnsweredScore = p.score;
      periodsSinceLastAnswer = history.length - 1 - i;
      break;
    }
  }

  const earlier = history.slice(0, history.length - consecutiveUnanswered);
  const earlierRate =
    earlier.length > 0 ? earlier.filter((p) => p.answered).length / earlier.length : 0;
  const behaviorChanged = consecutiveUnanswered >= 2 && earlier.length >= 2 && earlierRate >= 0.5;

  const health = npsHealth(current.answered, current.score);
  let reason: string;
  if (current.answered) {
    reason = `NPS respondido: nota ${isFiniteNumber(current.score) ? current.score : '—'}.`;
  } else if (behaviorChanged) {
    reason = `Cliente costumava responder ao NPS e não responde há ${consecutiveUnanswered} períodos: mudança de comportamento (N/A, não zero).`;
  } else {
    reason = `NPS sem resposta há ${consecutiveUnanswered} período(s): N/A (não é zero).`;
  }

  return {
    health,
    answered: current.answered,
    consecutiveUnanswered,
    responseRate,
    lastAnsweredScore,
    periodsSinceLastAnswer,
    behaviorChanged,
    reason,
  };
}
