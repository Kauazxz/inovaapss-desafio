import { describe, expect, it } from 'vitest';

import { fillTemplate, formatNumber, formatSigned, pluralize } from './format.js';

describe('formatNumber (pt-BR sem Intl)', () => {
  it('usa vírgula decimal e ponto de milhar', () => {
    expect(formatNumber(24)).toBe('24');
    expect(formatNumber(24.5)).toBe('24,5');
    expect(formatNumber(1234.56)).toBe('1.234,6');
    expect(formatNumber(1234.56, 2)).toBe('1.234,56');
    expect(formatNumber(0.05)).toBe('0,1');
  });

  it('trata negativos, zero arredondado e inválidos', () => {
    expect(formatNumber(-19.04)).toBe('−19');
    expect(formatNumber(-0.04)).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('—');
  });
});

describe('formatSigned', () => {
  it('põe o sinal explícito', () => {
    expect(formatSigned(12)).toBe('+12');
    expect(formatSigned(-3.5)).toBe('−3,5');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(Number.NaN)).toBe('—');
  });
});

describe('pluralize', () => {
  it('conhece os períodos do produto e cai no "s" genérico', () => {
    expect(pluralize(1, 'mês')).toBe('1 mês');
    expect(pluralize(3, 'mês')).toBe('3 meses');
    expect(pluralize(2, 'período')).toBe('2 períodos');
    expect(pluralize(2, 'ciclo')).toBe('2 ciclos');
    expect(pluralize(2, 'meses')).toBe('2 meses');
  });
});

describe('fillTemplate', () => {
  it('substitui chaves e usa travessão para ausentes', () => {
    expect(
      fillTemplate('{name} caiu {delta} em {window}', {
        name: 'SLA',
        delta: 24.5,
        window: '3 meses',
      }),
    ).toBe('SLA caiu 24,5 em 3 meses');
    expect(fillTemplate('{extra.missed} reuniões', { 'extra.missed': 2 })).toBe('2 reuniões');
    expect(fillTemplate('{x}', {})).toBe('—');
    expect(fillTemplate('{x}', { x: null })).toBe('—');
  });
});
