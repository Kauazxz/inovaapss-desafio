import { describe, expect, it } from 'vitest';

import {
  ALLOWED_RULE_OPERATORS,
  assertSafeRule,
  evaluateSafeRule,
  evaluateSafeRuleAsBoolean,
  evaluateSafeRuleAsNumber,
  isSafeRule,
  MAX_RULE_SERIES_LENGTH,
} from './safe-rule.js';
import { UnsafeRuleError } from '../shared/errors.js';

import type { RuleContext } from './types.js';

const ctx: RuleContext = {
  value: 7,
  text: null,
  previous: 5,
  baseline: 6,
  history: [4, 5, 6],
  params: { factor: 10 },
};

describe('regras seguras (JSON Logic, §9 CUSTOM_SAFE_RULE)', () => {
  it('avalia aritmética, comparação e acesso a params', () => {
    expect(evaluateSafeRule({ '*': [{ var: 'value' }, { var: 'params.factor' }] }, ctx)).toBe(70);
    expect(evaluateSafeRuleAsBoolean({ '>': [{ var: 'value' }, { var: 'previous' }] }, ctx)).toBe(
      true,
    );
    expect(
      evaluateSafeRuleAsNumber(
        { if: [{ '<': [{ var: 'value' }, { var: 'baseline' }] }, 0, 100] },
        ctx,
      ),
    ).toBe(100);
  });

  it('recusa operadores fora da allowlist (nunca há eval)', () => {
    expect(() => assertSafeRule({ method: [{ var: 'value' }, 'toString'] })).toThrow(
      UnsafeRuleError,
    );
    expect(() => evaluateSafeRule({ eval: 'process.exit()' } as never, ctx)).toThrow(
      UnsafeRuleError,
    );
    expect(ALLOWED_RULE_OPERATORS.has('method')).toBe(false);
    expect(ALLOWED_RULE_OPERATORS.has('eval')).toBe(false);
  });

  it('recusa caminhos perigosos e caminhos não literais em var', () => {
    expect(() => assertSafeRule({ var: 'params.constructor' })).toThrow(UnsafeRuleError);
    expect(() => assertSafeRule({ var: '__proto__.polluted' })).toThrow(UnsafeRuleError);
    expect(() => assertSafeRule({ var: [{ substr: ['value', 0] }] })).toThrow(UnsafeRuleError);
  });

  it('recusa caminhos perigosos também em missing e missing_some', () => {
    expect(() => assertSafeRule({ missing: ['history.constructor'] })).toThrow(UnsafeRuleError);
    expect(() => assertSafeRule({ missing: 'params.__proto__' })).toThrow(UnsafeRuleError);
    expect(() => assertSafeRule({ missing_some: [1, ['value', 'extra.prototype']] })).toThrow(
      UnsafeRuleError,
    );
    expect(isSafeRule({ missing: ['value', 'previous'] })).toBe(true);
    expect(evaluateSafeRule({ missing: ['value', 'params.nada'] }, ctx)).toEqual(['params.nada']);
  });

  it('recusa operadores que crescem o resultado (merge/cat): sem 2^n via reduce', () => {
    const doubling = {
      reduce: [
        { var: 'history' },
        { merge: [{ var: 'accumulator' }, { var: 'accumulator' }] },
        [1],
      ],
    };
    expect(isSafeRule(doubling)).toBe(false);
    expect(() => assertSafeRule(doubling)).toThrow(/merge/);
    expect(
      isSafeRule({ reduce: [{ var: 'history' }, { cat: [{ var: 'accumulator' }, 'x'] }, ''] }),
    ).toBe(false);
    expect(ALLOWED_RULE_OPERATORS.has('merge')).toBe(false);
    expect(ALLOWED_RULE_OPERATORS.has('cat')).toBe(false);
    // reduce continua disponível para somas e contagens.
    expect(
      evaluateSafeRuleAsNumber(
        { reduce: [{ var: 'history' }, { '+': [{ var: 'accumulator' }, { var: 'current' }] }, 0] },
        ctx,
      ),
    ).toBe(15);
  });

  it('a regra só enxerga os últimos períodos de history/series', () => {
    const long: RuleContext = {
      ...ctx,
      history: Array.from({ length: MAX_RULE_SERIES_LENGTH + 40 }, (_, i) => i),
      series: Array.from({ length: MAX_RULE_SERIES_LENGTH + 40 }, (_, i) => i),
    };
    const count = { reduce: [{ var: 'history' }, { '+': [{ var: 'accumulator' }, 1] }, 0] };
    expect(evaluateSafeRuleAsNumber(count, long)).toBe(MAX_RULE_SERIES_LENGTH);
    const countSeries = { reduce: [{ var: 'series' }, { '+': [{ var: 'accumulator' }, 1] }, 0] };
    expect(evaluateSafeRuleAsNumber(countSeries, long)).toBe(MAX_RULE_SERIES_LENGTH);
    // O último período (o atual) é preservado.
    expect(evaluateSafeRule({ var: 'history.59' }, long)).toBe(MAX_RULE_SERIES_LENGTH + 39);
  });

  it('recusa nós malformados, regras grandes demais e profundas demais', () => {
    expect(() => assertSafeRule({ '+': [1, 1], '-': [1, 1] })).toThrow(UnsafeRuleError);
    const huge = { '+': Array.from({ length: 600 }, () => 1) };
    expect(() => assertSafeRule(huge)).toThrow(/nós/);
    let deep: Record<string, unknown> = { '!': true };
    for (let i = 0; i < 40; i += 1) deep = { '!': deep };
    expect(() => assertSafeRule(deep)).toThrow(/profundidade/);
  });

  it('aceita literais e listas como regra', () => {
    expect(isSafeRule(42)).toBe(true);
    expect(isSafeRule([1, { var: 'value' }])).toBe(true);
    expect(isSafeRule({ method: [] })).toBe(false);
  });

  it('coage o resultado: booleano vira 1/0, texto vira null', () => {
    expect(evaluateSafeRuleAsNumber({ '>': [{ var: 'value' }, 1] }, ctx)).toBe(1);
    expect(evaluateSafeRuleAsNumber({ '<': [{ var: 'value' }, 1] }, ctx)).toBe(0);
    expect(evaluateSafeRuleAsNumber({ substr: ['abc', 1] }, ctx)).toBeNull();
    expect(evaluateSafeRuleAsNumber({ '/': [1, 0] }, ctx)).toBeNull();
  });

  it('o contexto não expõe funções nem protótipo', () => {
    const dirty = {
      ...ctx,
      extra: { fn: (() => 1) as unknown as number, ok: 2 },
    } as RuleContext;
    expect(evaluateSafeRule({ var: 'extra.fn' }, dirty)).toBeNull();
    expect(evaluateSafeRule({ var: 'extra.ok' }, dirty)).toBe(2);
    expect(() => evaluateSafeRule({ var: 'history.constructor' }, ctx)).toThrow(UnsafeRuleError);
  });
});
