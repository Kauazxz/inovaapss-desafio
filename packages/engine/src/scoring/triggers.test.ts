import { describe, expect, it } from 'vitest';

import { compare, evaluateTriggers, mergeTriggerEvaluations } from './triggers.js';
import { EngineConfigError, UnsafeRuleError } from '../shared/errors.js';

import type { ComparisonOperator, RuleContext, TriggerConfig } from './types.js';

const context = (overrides: Partial<RuleContext> = {}): RuleContext => ({
  value: 130,
  text: null,
  previous: 110,
  baseline: 100,
  history: [90, 110],
  params: {},
  health: 20,
  extra: { critical_tickets: 3 },
  ...overrides,
});

describe('gatilhos críticos (§27)', () => {
  it('THRESHOLD compara o valor bruto e define piso de prioridade', () => {
    const trigger: TriggerConfig = {
      id: 't1',
      kind: 'THRESHOLD',
      name: 'Ticket crítico acima de 120 % do SLA',
      field: 'value',
      operator: '>',
      threshold: 120,
      priorityFloor: 85,
    };
    const hit = evaluateTriggers([trigger], context(), 'm1');
    expect(hit.hits).toHaveLength(1);
    expect(hit.priorityFloor).toBe(85);
    expect(hit.hits[0]?.severity).toBe('CRITICAL');
    expect(hit.hits[0]?.metricId).toBe('m1');
    expect(hit.hits[0]?.message).toContain('value > 120');
    expect(evaluateTriggers([trigger], context({ value: 100 })).hits).toHaveLength(0);
  });

  it('dado ausente nunca dispara gatilho', () => {
    const trigger: TriggerConfig = {
      id: 't',
      kind: 'THRESHOLD',
      name: 'x',
      field: 'value',
      operator: '<',
      threshold: 1000,
    };
    expect(evaluateTriggers([trigger], context({ value: null })).hits).toHaveLength(0);
    const healthTrigger: TriggerConfig = { ...trigger, field: 'health' };
    expect(evaluateTriggers([healthTrigger], context({ health: null })).hits).toHaveLength(0);
    const extraTrigger: TriggerConfig = { ...trigger, field: 'extra.nada' };
    expect(evaluateTriggers([extraTrigger], context()).hits).toHaveLength(0);
  });

  it('THRESHOLD sobre health e sobre campos extras', () => {
    const onHealth: TriggerConfig = {
      id: 'h',
      kind: 'THRESHOLD',
      name: 'Health crítico',
      field: 'health',
      operator: '<',
      threshold: 40,
      severity: 'WARNING',
    };
    const onExtra: TriggerConfig = {
      id: 'e',
      kind: 'THRESHOLD',
      name: '3 tickets críticos',
      field: 'extra.critical_tickets',
      operator: '>=',
      threshold: 3,
      priorityFloor: 70,
    };
    const result = evaluateTriggers([onHealth, onExtra], context());
    expect(result.hits.map((h) => h.triggerId)).toEqual(['h', 'e']);
    expect(result.hits[0]?.severity).toBe('WARNING');
    expect(result.priorityFloor).toBe(70);
  });

  it('STREAK exige a condição em N períodos consecutivos (histórico + atual)', () => {
    const streak: TriggerConfig = {
      id: 's',
      kind: 'STREAK',
      name: '3 períodos com ticket crítico',
      operator: '>=',
      threshold: 1,
      consecutivePeriods: 3,
      priorityFloor: 60,
    };
    expect(evaluateTriggers([streak], context({ history: [1, 2], value: 3 })).hits).toHaveLength(1);
    expect(evaluateTriggers([streak], context({ history: [0, 2], value: 3 })).hits).toHaveLength(0);
    expect(evaluateTriggers([streak], context({ history: [2], value: 3 })).hits).toHaveLength(0);
    expect(
      evaluateTriggers([streak], context({ series: [1, null, 2, 3], value: 3 })).hits,
    ).toHaveLength(0);
    expect(() => evaluateTriggers([{ ...streak, consecutivePeriods: 0 }], context())).toThrow(
      EngineConfigError,
    );
  });

  it('JSON_LOGIC avalia regra segura e recusa código arbitrário', () => {
    const logic: TriggerConfig = {
      id: 'j',
      kind: 'JSON_LOGIC',
      name: 'Subiu mais de 20 % sobre o baseline',
      rule: { '>': [{ var: 'value' }, { '*': [{ var: 'baseline' }, 1.2] }] },
    };
    expect(evaluateTriggers([logic], context()).hits).toHaveLength(1);
    expect(evaluateTriggers([logic], context({ value: 105 })).hits).toHaveLength(0);
    expect(() => evaluateTriggers([{ ...logic, rule: { method: ['x', 'y'] } }], context())).toThrow(
      UnsafeRuleError,
    );
  });

  it('mensagem com placeholders e gatilho inativo', () => {
    const trigger: TriggerConfig = {
      id: 't',
      kind: 'THRESHOLD',
      name: 'SLA estourado',
      field: 'value',
      operator: '>',
      threshold: 120,
      message: '{name}: {value} % do SLA (limite {threshold} %, {extra.critical_tickets} críticos)',
    };
    const result = evaluateTriggers([trigger], context());
    expect(result.hits[0]?.message).toBe('SLA estourado: 130 % do SLA (limite 120 %, 3 críticos)');
    expect(evaluateTriggers([{ ...trigger, isActive: false }], context()).hits).toHaveLength(0);
    expect(evaluateTriggers(undefined, context()).hits).toHaveLength(0);
  });

  it('piso é limitado a 0–100 e o maior vence na fusão', () => {
    const a = evaluateTriggers(
      [
        {
          id: 'a',
          kind: 'THRESHOLD',
          name: 'a',
          field: 'value',
          operator: '>',
          threshold: 0,
          priorityFloor: 150,
        },
      ],
      context(),
    );
    const b = evaluateTriggers(
      [
        {
          id: 'b',
          kind: 'THRESHOLD',
          name: 'b',
          field: 'value',
          operator: '>',
          threshold: 0,
          priorityFloor: 40,
        },
      ],
      context(),
    );
    const c = evaluateTriggers(
      [{ id: 'c', kind: 'THRESHOLD', name: 'c', field: 'value', operator: '>', threshold: 0 }],
      context(),
    );
    expect(a.priorityFloor).toBe(100);
    expect(c.priorityFloor).toBeNull();
    const merged = mergeTriggerEvaluations([b, c, a]);
    expect(merged.hits).toHaveLength(3);
    expect(merged.priorityFloor).toBe(100);
    expect(mergeTriggerEvaluations([c]).priorityFloor).toBeNull();
  });

  it('mensagens padrão por tipo', () => {
    const streak: TriggerConfig = {
      id: 's',
      kind: 'STREAK',
      name: 'Reincidência',
      operator: '>=',
      threshold: 1,
      consecutivePeriods: 2,
    };
    const logic: TriggerConfig = { id: 'j', kind: 'JSON_LOGIC', name: 'Regra', rule: true };
    const result = evaluateTriggers([streak, logic], context({ history: [1], value: 2 }));
    expect(result.hits[0]?.message).toBe('Reincidência: >= 1 há 2 períodos consecutivos.');
    expect(result.hits[1]?.message).toBe('Regra: condição atendida (atual 2).');
  });

  it('compare cobre todos os operadores e recusa desconhecidos', () => {
    const table: [number, ComparisonOperator, number, boolean][] = [
      [2, '>', 1, true],
      [1, '>=', 1, true],
      [1, '<', 2, true],
      [2, '<=', 1, false],
      [1, '==', 1, true],
      [1, '!=', 1, false],
    ];
    for (const [l, op, r, expected] of table) expect(compare(l, op, r)).toBe(expected);
    expect(() => compare(1, '~' as ComparisonOperator, 1)).toThrow(EngineConfigError);
    expect(() =>
      evaluateTriggers([{ kind: 'MAGIC' } as unknown as TriggerConfig], context()),
    ).toThrow(EngineConfigError);
  });
});
