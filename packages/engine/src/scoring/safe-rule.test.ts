import { describe, expect, it } from 'vitest';

import {
  ALLOWED_RULE_OPERATORS,
  assertSafeRule,
  evaluateSafeRule,
  evaluateSafeRuleAsBoolean,
  evaluateSafeRuleAsNumber,
  isSafeRule,
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
    expect(() => assertSafeRule({ var: [{ cat: ['va', 'lue'] }] })).toThrow(UnsafeRuleError);
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
    expect(evaluateSafeRuleAsNumber({ cat: ['a', 'b'] }, ctx)).toBeNull();
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
