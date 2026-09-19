import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TICKET_SLA_WEIGHTS,
  contractSlaConsumption,
  elapsedMinutes,
  operationalTargetConsumption,
  resolveTicketSlaWeights,
  ticketSlaHealth,
} from './consumption.js';
import { operationalTargetMinutes, resolveApplicableSla } from './policy.js';
import { aggregateClientSla, evaluateTicketSla, evaluateTicketsSla } from './ticket-health.js';
import { EngineConfigError } from '../shared/errors.js';

import type { SlaPolicy, SlaTicket } from './types.js';

const critical: SlaPolicy = {
  id: 'p-critical',
  planId: 'premium',
  severityId: 'critical',
  ticketTypeId: null,
  contractualSlaMinutes: 120,
  operationalTargetType: 'PERCENT_OF_SLA',
  operationalTargetValue: 10,
};
const fallback: SlaPolicy = {
  id: 'p-any',
  planId: null,
  severityId: null,
  ticketTypeId: null,
  contractualSlaMinutes: 480,
  operationalTargetType: 'ABSOLUTE_MINUTES',
  operationalTargetValue: 240,
};
const policies = [fallback, critical];

const ticket = (overrides: Partial<SlaTicket> = {}): SlaTicket => ({
  id: 't1',
  status: 'OPEN',
  openedAt: '2026-09-19T10:00:00Z',
  planId: 'premium',
  severityId: 'critical',
  ticketTypeId: 'incident',
  ...overrides,
});

describe('SLA aplicável (§14)', () => {
  it('a política mais específica vence o coringa', () => {
    expect(
      resolveApplicableSla(policies, {
        planId: 'premium',
        severityId: 'critical',
        ticketTypeId: 'incident',
      })?.id,
    ).toBe('p-critical');
    expect(
      resolveApplicableSla(policies, { planId: 'basic', severityId: 'low', ticketTypeId: null })
        ?.id,
    ).toBe('p-any');
    expect(
      resolveApplicableSla([critical], {
        planId: 'basic',
        severityId: 'critical',
        ticketTypeId: null,
      }),
    ).toBeNull();
    expect(
      resolveApplicableSla([critical], { planId: 'premium', severityId: null, ticketTypeId: null }),
    ).toBeNull();
  });

  it('respeita validade e ativação', () => {
    const old: SlaPolicy = {
      ...critical,
      id: 'old',
      contractualSlaMinutes: 240,
      validFrom: '2025-01-01',
      validTo: '2025-12-31',
    };
    const current: SlaPolicy = { ...critical, id: 'new', validFrom: '2026-01-01' };
    const lookup = { planId: 'premium', severityId: 'critical', ticketTypeId: null };
    expect(resolveApplicableSla([old, current], { ...lookup, at: '2025-06-01' })?.id).toBe('old');
    expect(resolveApplicableSla([old, current], { ...lookup, at: '2026-06-01' })?.id).toBe('new');
    expect(resolveApplicableSla([old], { ...lookup, at: '2026-06-01' })).toBeNull();
    expect(resolveApplicableSla([{ ...current, isActive: false }], lookup)).toBeNull();
    expect(resolveApplicableSla([old, current], { ...lookup, at: 'data inválida' })?.id).toBe(
      'new',
    );
  });

  it('em empate de especificidade vence o validFrom mais recente', () => {
    const a: SlaPolicy = { ...critical, id: 'a', validFrom: '2026-01-01' };
    const b: SlaPolicy = { ...critical, id: 'b', validFrom: '2026-06-01' };
    const c: SlaPolicy = { ...critical, id: 'c' };
    expect(
      resolveApplicableSla([a, b, c], {
        planId: 'premium',
        severityId: 'critical',
        ticketTypeId: null,
      })?.id,
    ).toBe('b');
    expect(
      resolveApplicableSla([c, a], {
        planId: 'premium',
        severityId: 'critical',
        ticketTypeId: null,
      })?.id,
    ).toBe('a');
  });
});

describe('meta operacional sugerida (§14)', () => {
  it('SLA 120 min e meta 10 % → 12 min; minutos absolutos passam direto', () => {
    expect(operationalTargetMinutes(critical)).toBe(12);
    expect(operationalTargetMinutes(fallback)).toBe(240);
    expect(
      operationalTargetMinutes({
        contractualSlaMinutes: 60,
        operationalTargetType: 'PERCENT_OF_SLA',
        operationalTargetValue: 40,
      }),
    ).toBe(24);
  });

  it('a meta não altera o SLA contratual', () => {
    expect(critical.contractualSlaMinutes).toBe(120);
    expect(operationalTargetMinutes(critical)).not.toBe(critical.contractualSlaMinutes);
  });

  it('recusa configuração inválida', () => {
    expect(() => operationalTargetMinutes({ ...critical, contractualSlaMinutes: 0 })).toThrow(
      EngineConfigError,
    );
    expect(() => operationalTargetMinutes({ ...critical, operationalTargetValue: 0 })).toThrow(
      EngineConfigError,
    );
    expect(() =>
      operationalTargetMinutes({
        ...critical,
        operationalTargetType: 'MAGIC' as SlaPolicy['operationalTargetType'],
      }),
    ).toThrow(EngineConfigError);
  });
});

describe('tempo decorrido (§14)', () => {
  it('aberto: now − opened_at; resolvido: resolved_at − opened_at', () => {
    expect(elapsedMinutes(ticket(), '2026-09-19T10:06:00Z').minutes).toBe(6);
    expect(
      elapsedMinutes(ticket({ status: 'WAITING_CUSTOMER' }), '2026-09-19T12:00:00Z').minutes,
    ).toBe(120);
    expect(
      elapsedMinutes(ticket({ status: 'RESOLVED', resolvedAt: '2026-09-19T11:00:00Z' })).minutes,
    ).toBe(60);
    expect(
      elapsedMinutes(ticket({ status: 'CLOSED', closedAt: '2026-09-19T11:30:00Z' })).minutes,
    ).toBe(90);
    expect(
      elapsedMinutes(ticket({ status: 'RESOLVED', resolvedAt: '2026-09-19T09:00:00Z' })).minutes,
    ).toBe(0);
  });

  it('cancelado, aberto sem now ou datas inválidas → não avaliável', () => {
    expect(elapsedMinutes(ticket({ status: 'CANCELLED' })).reason).toMatch(/cancelado/);
    expect(elapsedMinutes(ticket()).reason).toMatch(/now/);
    expect(elapsedMinutes(ticket(), 'x').minutes).toBeNull();
    expect(elapsedMinutes(ticket({ status: 'RESOLVED' })).reason).toMatch(/sem data de resolução/);
    expect(elapsedMinutes(ticket({ status: 'RESOLVED', resolvedAt: 'x' })).minutes).toBeNull();
    expect(elapsedMinutes(ticket({ openedAt: 'x' })).reason).toMatch(/abertura inválida/);
  });
});

describe('consumo e health por chamado (§14, §70)', () => {
  it('consumo contratual e da meta são distintos', () => {
    expect(contractSlaConsumption(60, 120)).toBe(50);
    expect(operationalTargetConsumption(60, 12)).toBe(500);
    expect(contractSlaConsumption(60, 0)).toBeNull();
    expect(operationalTargetConsumption(null, 12)).toBeNull();
  });

  it('health = clamp(100 − (min(contratual,100) × 0,60 + min(meta,100) × 0,40))', () => {
    expect(ticketSlaHealth(5, 50)).toBe(77);
    expect(ticketSlaHealth(50, 500)).toBe(30);
    expect(ticketSlaHealth(200, 500)).toBe(0);
    expect(ticketSlaHealth(0, 0)).toBe(100);
    expect(DEFAULT_TICKET_SLA_WEIGHTS).toEqual({ contract: 0.6, operational: 0.4 });
  });

  it('pesos configuráveis e redistribuição quando falta um consumo', () => {
    expect(ticketSlaHealth(50, 500, { contract: 0.5, operational: 0.5 })).toBe(25);
    expect(ticketSlaHealth(50, null)).toBe(50);
    expect(ticketSlaHealth(null, 50)).toBe(50);
    expect(ticketSlaHealth(null, null)).toBeNull();
    expect(resolveTicketSlaWeights({ contract: 0.7 })).toEqual({ contract: 0.7, operational: 0.4 });
    expect(() => resolveTicketSlaWeights({ contract: -1 })).toThrow(EngineConfigError);
    expect(() => ticketSlaHealth(1, 1, { contract: 0, operational: 0 })).toThrow(EngineConfigError);
  });
});

describe('avaliação completa do chamado', () => {
  it('exemplo da spec: SLA 120 min, meta 10 %, 6 min decorridos', () => {
    const result = evaluateTicketSla(ticket(), policies, { now: '2026-09-19T10:06:00Z' });
    expect(result.policyId).toBe('p-critical');
    expect(result.contractualSlaMinutes).toBe(120);
    expect(result.operationalTargetMinutes).toBe(12);
    expect(result.elapsedMinutes).toBe(6);
    expect(result.contractSlaConsumption).toBe(5);
    expect(result.operationalTargetConsumption).toBe(50);
    expect(result.health).toBe(77);
    expect(result.breachedContract).toBe(false);
    expect(result.breachedOperationalTarget).toBe(false);
    expect(result.isOpen).toBe(true);
  });

  it('estourar a meta operacional não é estourar o contrato', () => {
    const result = evaluateTicketSla(
      ticket({ status: 'RESOLVED', resolvedAt: '2026-09-19T11:00:00Z' }),
      policies,
    );
    expect(result.contractSlaConsumption).toBe(50);
    expect(result.operationalTargetConsumption).toBe(500);
    expect(result.breachedContract).toBe(false);
    expect(result.breachedOperationalTarget).toBe(true);
    expect(result.health).toBe(30);
    expect(result.isOpen).toBe(false);
  });

  it('estouro contratual', () => {
    const result = evaluateTicketSla(ticket(), policies, { now: '2026-09-19T13:00:00Z' });
    expect(result.contractSlaConsumption).toBe(150);
    expect(result.breachedContract).toBe(true);
    expect(result.health).toBe(0);
  });

  it('sem política, cancelado ou sem now → health null com motivo', () => {
    const noPolicy = evaluateTicketSla(ticket({ planId: 'basic' }), [critical], {
      now: '2026-09-19T10:06:00Z',
    });
    expect(noPolicy.health).toBeNull();
    expect(noPolicy.policyId).toBeNull();
    expect(noPolicy.reason).toMatch(/Nenhuma política/);
    const cancelled = evaluateTicketSla(ticket({ status: 'CANCELLED' }), policies);
    expect(cancelled.health).toBeNull();
    expect(cancelled.reason).toMatch(/cancelado/);
    expect(evaluateTicketSla(ticket(), policies).reason).toMatch(/now/);
  });

  it('pesos configuráveis passam pela avaliação', () => {
    const result = evaluateTicketSla(ticket(), policies, {
      now: '2026-09-19T11:00:00Z',
      weights: { contract: 1, operational: 0 },
    });
    expect(result.health).toBe(50);
  });
});

describe('agregação por cliente', () => {
  const now = '2026-09-19T11:00:00Z';
  const tickets: SlaTicket[] = [
    ticket({ id: 'fresh', openedAt: '2026-09-19T10:54:00Z' }), // 6 min → 77
    ticket({ id: 'late', openedAt: '2026-09-19T10:00:00Z' }), // 60 min → 30
    ticket({
      id: 'done',
      status: 'RESOLVED',
      openedAt: '2026-09-19T08:00:00Z',
      resolvedAt: '2026-09-19T08:06:00Z',
    }), // 77
    ticket({ id: 'gone', status: 'CANCELLED' }),
    ticket({ id: 'orphan', planId: 'basic', severityId: 'low', ticketTypeId: null }), // p-any, 60 min: 12,5 % e 25 % → 82,5
  ];

  it('média (padrão), pior caso e só abertos', () => {
    const results = evaluateTicketsSla(tickets, policies, { now });
    const average = aggregateClientSla(results);
    expect(average.method).toBe('AVERAGE');
    expect(average.evaluatedTickets).toBe(4);
    expect(average.skippedTickets).toBe(1);
    expect(average.health).toBeCloseTo((77 + 30 + 77 + 82.5) / 4, 2);
    expect(average.worstTicketId).toBe('late');
    expect(average.worstTicketHealth).toBe(30);
    expect(average.breachedOperationalCount).toBe(1);
    expect(average.breachedContractCount).toBe(0);

    expect(aggregateClientSla(results, { method: 'WORST' }).health).toBe(30);
    const open = aggregateClientSla(results, { openOnly: true });
    expect(open.evaluatedTickets).toBe(3);
    expect(open.skippedTickets).toBe(0);
  });

  it('sem chamado avaliável → N/A', () => {
    const empty = aggregateClientSla([]);
    expect(empty.health).toBeNull();
    expect(empty.worstTicketId).toBeNull();
    const onlyCancelled = aggregateClientSla(
      evaluateTicketsSla([ticket({ status: 'CANCELLED' })], policies),
    );
    expect(onlyCancelled.health).toBeNull();
    expect(onlyCancelled.skippedTickets).toBe(1);
  });
});
