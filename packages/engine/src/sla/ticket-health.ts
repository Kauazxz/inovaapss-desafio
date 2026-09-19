import {
  contractSlaConsumption,
  elapsedMinutes,
  operationalTargetConsumption,
  ticketSlaHealth,
} from './consumption.js';
import { operationalTargetMinutes, resolveApplicableSla } from './policy.js';
import { isFiniteNumber, round } from '../shared/math.js';

import type {
  ClientSlaAggregate,
  ClientSlaAggregateOptions,
  SlaPolicy,
  SlaTicket,
  TicketSlaOptions,
  TicketSlaResult,
} from './types.js';

/**
 * §14 — avaliação completa de um chamado: SLA aplicável, meta operacional, tempo decorrido,
 * consumos e health. Sem política aplicável ou sem datas, `health = null` com o motivo.
 */
export function evaluateTicketSla(
  ticket: SlaTicket,
  policies: readonly SlaPolicy[],
  options: TicketSlaOptions = {},
): TicketSlaResult {
  const elapsed = elapsedMinutes(ticket, options.now);
  const policy = resolveApplicableSla(policies, {
    planId: ticket.planId ?? null,
    severityId: ticket.severityId ?? null,
    ticketTypeId: ticket.ticketTypeId ?? null,
    at: ticket.openedAt,
  });

  const baseResult: TicketSlaResult = {
    ticketId: ticket.id,
    status: ticket.status,
    policyId: policy?.id ?? null,
    contractualSlaMinutes: policy?.contractualSlaMinutes ?? null,
    operationalTargetMinutes: policy ? operationalTargetMinutes(policy) : null,
    elapsedMinutes: elapsed.minutes,
    contractSlaConsumption: null,
    operationalTargetConsumption: null,
    health: null,
    breachedContract: false,
    breachedOperationalTarget: false,
    isOpen: elapsed.isOpen,
    reason: null,
  };

  if (!policy) {
    return { ...baseResult, reason: 'Nenhuma política de SLA aplicável ao chamado.' };
  }
  if (elapsed.minutes === null) {
    return { ...baseResult, reason: elapsed.reason };
  }

  const contract = contractSlaConsumption(elapsed.minutes, policy.contractualSlaMinutes);
  const operational = operationalTargetConsumption(
    elapsed.minutes,
    baseResult.operationalTargetMinutes,
  );
  return {
    ...baseResult,
    contractSlaConsumption: contract,
    operationalTargetConsumption: operational,
    health: ticketSlaHealth(contract, operational, options.weights ?? {}),
    breachedContract: contract !== null && contract > 100,
    breachedOperationalTarget: operational !== null && operational > 100,
  };
}

/** Avalia vários chamados com a mesma política e o mesmo `now`. */
export function evaluateTicketsSla(
  tickets: readonly SlaTicket[],
  policies: readonly SlaPolicy[],
  options: TicketSlaOptions = {},
): TicketSlaResult[] {
  return tickets.map((t) => evaluateTicketSla(t, policies, options));
}

/**
 * Agrega o health de SLA dos chamados de um cliente (Métrica 2, §14): média (padrão) ou pior
 * caso. Chamados não avaliáveis (cancelados, sem política, sem data) ficam de fora e são contados
 * em `skippedTickets`. Sem chamado avaliável, `health = null` (N/A).
 */
export function aggregateClientSla(
  results: readonly TicketSlaResult[],
  options: ClientSlaAggregateOptions = {},
): ClientSlaAggregate {
  const method = options.method ?? 'AVERAGE';
  const candidates = options.openOnly ? results.filter((r) => r.isOpen) : results;
  const evaluated = candidates.filter((r) => isFiniteNumber(r.health));

  let worst: TicketSlaResult | null = null;
  for (const r of evaluated) {
    if (worst === null || (r.health as number) < (worst.health as number)) worst = r;
  }

  let health: number | null = null;
  if (evaluated.length > 0) {
    health =
      method === 'WORST'
        ? (worst?.health ?? null)
        : round(evaluated.reduce((acc, r) => acc + (r.health as number), 0) / evaluated.length, 2);
  }

  return {
    health,
    method,
    evaluatedTickets: evaluated.length,
    skippedTickets: candidates.length - evaluated.length,
    breachedContractCount: evaluated.filter((r) => r.breachedContract).length,
    breachedOperationalCount: evaluated.filter((r) => r.breachedOperationalTarget).length,
    worstTicketId: worst?.ticketId ?? null,
    worstTicketHealth: worst?.health ?? null,
  };
}
