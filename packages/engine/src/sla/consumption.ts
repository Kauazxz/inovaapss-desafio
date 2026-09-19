import { OPEN_TICKET_STATUSES, clampScore } from '@inovaapss/shared';

import { EngineConfigError } from '../shared/errors.js';
import { isFiniteNumber, minutesBetween, round } from '../shared/math.js';

import type { SlaTicket, TicketSlaWeights } from './types.js';

export const DEFAULT_TICKET_SLA_WEIGHTS: TicketSlaWeights = { contract: 0.6, operational: 0.4 };

export interface ElapsedResult {
  minutes: number | null;
  isOpen: boolean;
  reason: string | null;
}

/**
 * §14 — tempo decorrido do chamado. Aberto (OPEN, IN_PROGRESS, WAITING_*): `now − opened_at`.
 * Resolvido/fechado: `resolved_at − opened_at` (ou `closed_at` na falta). Cancelado: não avaliado.
 */
export function elapsedMinutes(ticket: SlaTicket, now?: string): ElapsedResult {
  const isOpen = OPEN_TICKET_STATUSES.includes(ticket.status);
  if (ticket.status === 'CANCELLED') {
    return { minutes: null, isOpen: false, reason: 'Chamado cancelado: fora da avaliação de SLA.' };
  }
  if (Number.isNaN(Date.parse(ticket.openedAt))) {
    return { minutes: null, isOpen, reason: 'Data de abertura inválida.' };
  }

  let end: string | null | undefined;
  if (isOpen) {
    if (!now || Number.isNaN(Date.parse(now))) {
      return { minutes: null, isOpen, reason: 'Chamado aberto sem instante de referência (now).' };
    }
    end = now;
  } else {
    end = ticket.resolvedAt ?? ticket.closedAt ?? null;
    if (!end || Number.isNaN(Date.parse(end))) {
      return { minutes: null, isOpen, reason: 'Chamado resolvido sem data de resolução.' };
    }
  }

  const minutes = minutesBetween(ticket.openedAt, end);
  if (minutes === null) return { minutes: null, isOpen, reason: 'Datas inválidas.' };
  return { minutes: round(Math.max(0, minutes), 4), isOpen, reason: null };
}

/** §14 — `elapsed / contractual_sla × 100`. */
export function contractSlaConsumption(
  elapsed: number | null,
  contractualSlaMinutes: number | null,
): number | null {
  if (!isFiniteNumber(elapsed) || !isFiniteNumber(contractualSlaMinutes)) return null;
  if (contractualSlaMinutes <= 0) return null;
  return round((elapsed / contractualSlaMinutes) * 100, 2);
}

/** §14 — `elapsed / operational_target × 100`. */
export function operationalTargetConsumption(
  elapsed: number | null,
  operationalTargetMinutes: number | null,
): number | null {
  if (!isFiniteNumber(elapsed) || !isFiniteNumber(operationalTargetMinutes)) return null;
  if (operationalTargetMinutes <= 0) return null;
  return round((elapsed / operationalTargetMinutes) * 100, 2);
}

/** Pesos validados; parcial completa com o padrão 60/40. */
export function resolveTicketSlaWeights(weights: Partial<TicketSlaWeights> = {}): TicketSlaWeights {
  const resolved = { ...DEFAULT_TICKET_SLA_WEIGHTS, ...weights };
  if (
    !isFiniteNumber(resolved.contract) ||
    !isFiniteNumber(resolved.operational) ||
    resolved.contract < 0 ||
    resolved.operational < 0 ||
    resolved.contract + resolved.operational <= 0
  ) {
    throw new EngineConfigError('Pesos do SLA por chamado inválidos.');
  }
  return resolved;
}

/**
 * §14 — health do chamado:
 *   weighted = min(contract, 100) × 0,60 + min(operational, 100) × 0,40
 *   health   = clamp(100 − weighted, 0, 100)
 * Sem consumo da meta (política sem meta), o peso vai todo para o contratual.
 */
export function ticketSlaHealth(
  contractConsumption: number | null,
  operationalConsumption: number | null,
  weights: Partial<TicketSlaWeights> = {},
): number | null {
  const w = resolveTicketSlaWeights(weights);
  const parts: { consumption: number; weight: number }[] = [];
  if (isFiniteNumber(contractConsumption)) {
    parts.push({ consumption: Math.min(contractConsumption, 100), weight: w.contract });
  }
  if (isFiniteNumber(operationalConsumption)) {
    parts.push({ consumption: Math.min(operationalConsumption, 100), weight: w.operational });
  }
  const totalWeight = parts.reduce((acc, p) => acc + p.weight, 0);
  if (parts.length === 0 || totalWeight <= 0) return null;
  const weighted = parts.reduce((acc, p) => acc + p.consumption * (p.weight / totalWeight), 0);
  return round(clampScore(100 - weighted), 2);
}
