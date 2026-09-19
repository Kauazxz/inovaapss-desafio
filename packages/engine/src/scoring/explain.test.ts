import { describe, expect, it } from 'vitest';

import { explainMetric, type ExplainInput } from './explain.js';

import type { NormalizationResult, TrendResult } from './types.js';

const trend = (overrides: Partial<TrendResult> = {}): TrendResult => ({
  health: 50,
  method: 'DELTA_PERCENT',
  basis: 'RAW',
  window: 3,
  periodsUsed: 3,
  firstValue: 90,
  lastValue: 66,
  change: -24,
  changePercent: -26.67,
  slope: -12,
  movingAverage: 78,
  baseline: null,
  improvement: -0.2667,
  reason: null,
  ...overrides,
});

const normalization = (overrides: Partial<NormalizationResult> = {}): NormalizationResult => ({
  health: 66,
  strategy: 'LINEAR_RANGE',
  baseline: null,
  deviationPct: null,
  reason: null,
  ...overrides,
});

const input = (
  overrides: Partial<ExplainInput> & { name?: string; unit?: string },
): ExplainInput => ({
  metric: {
    name: overrides.name ?? 'Cumprimento de SLA',
    direction: 'HIGHER_IS_BETTER',
    ...(overrides.unit !== undefined ? { unit: overrides.unit } : {}),
  },
  currentValue: 66,
  previousValue: 78,
  normalization: normalization(),
  trend: trend(),
  ...overrides,
});

describe('explicação humana (§29, §58)', () => {
  it('percentual: diferença em pontos percentuais', () => {
    expect(explainMetric(input({ unit: '%' }), { periodLabel: 'mês' })).toBe(
      'Cumprimento de SLA caiu 24 p.p. em 3 meses.',
    );
  });

  it('quantidade: de X para Y com variação relativa e concordância no plural', () => {
    const text = explainMetric(
      input({
        name: 'Chamados críticos',
        unit: 'chamados',
        currentValue: 5,
        previousValue: 3,
        trend: trend({ firstValue: 2, lastValue: 5, change: 3, changePercent: 150 }),
      }),
    );
    expect(text).toBe('Chamados críticos subiram de 2 para 5 chamados em 3 períodos (+150 %).');
  });

  it('dobrou', () => {
    const text = explainMetric(
      input({
        name: 'Taxa de reabertura',
        unit: '%',
        currentValue: 10,
        trend: trend({ firstValue: 5, lastValue: 10, change: 5, changePercent: 100 }),
      }),
    );
    expect(text).toBe('Taxa de reabertura dobrou em 3 períodos (de 5 para 10 %).');
  });

  it('estável', () => {
    const text = explainMetric(
      input({
        name: 'Uso da plataforma',
        unit: '%',
        currentValue: 70,
        trend: trend({ firstValue: 70, lastValue: 70, change: 0, changePercent: 0 }),
      }),
    );
    expect(text).toBe('Uso da plataforma está estável em 70 % há 3 períodos.');
  });

  it('sem tendência: desvio em relação ao baseline ou à meta', () => {
    const below = explainMetric(
      input({
        name: 'Uso da plataforma',
        currentValue: 65,
        trend: trend({ health: null, firstValue: null, change: null, periodsUsed: 1 }),
        normalization: normalization({
          strategy: 'BASELINE_DEVIATION',
          baseline: 80,
          deviationPct: -19,
        }),
      }),
    );
    expect(below).toBe('Uso da plataforma está 19 % abaixo do baseline.');
    const above = explainMetric(
      input({
        name: 'Chamados abertos',
        currentValue: 12,
        trend: trend({ health: null, firstValue: null, change: null, periodsUsed: 1 }),
        normalization: normalization({
          strategy: 'RATIO_TO_TARGET',
          baseline: 10,
          deviationPct: 20,
        }),
      }),
    );
    expect(above).toBe('Chamados abertos estão 20 % acima da meta.');
    const same = explainMetric(
      input({
        name: 'Chamados abertos',
        currentValue: 10,
        trend: trend({ health: null, firstValue: null, change: null, periodsUsed: 1 }),
        normalization: normalization({
          strategy: 'BASELINE_DEVIATION',
          baseline: 10,
          deviationPct: 0,
        }),
      }),
    );
    expect(same).toBe('Chamados abertos estão no baseline (10).');
  });

  it('sem dado e sem contexto', () => {
    expect(explainMetric(input({ name: 'NPS', currentValue: null }))).toBe(
      'NPS: sem dado no período.',
    );
    const bare = explainMetric(
      input({
        name: 'Atraso de pagamento',
        unit: 'dias',
        currentValue: 5,
        trend: trend({ health: null, firstValue: null, change: null, periodsUsed: 0 }),
      }),
    );
    expect(bare).toBe('Atraso de pagamento: 5 dias no período atual.');
  });

  it('modelo configurado pela organização, com campos extras', () => {
    const withExtra = explainMetric({
      ...input({ name: 'Reuniões não realizadas', currentValue: 50 }),
      metric: {
        name: 'Reuniões não realizadas',
        direction: 'HIGHER_IS_WORSE',
        explanationTemplate: '{extra.missed} reuniões previstas não ocorreram',
      },
      extra: { missed: 2, note: 'x', flag: true },
    });
    expect(withExtra).toBe('2 reuniões previstas não ocorreram');

    const withDelta = explainMetric({
      ...input({ unit: '%' }),
      metric: {
        name: 'SLA',
        unit: '%',
        direction: 'HIGHER_IS_BETTER',
        explanationTemplate: '{name}: {delta} ({deltaPct} %) em {window}; baseline {baseline}',
      },
    });
    expect(withDelta).toBe('SLA: −12 (−26,7 %) em 3 períodos; baseline —');
  });
});
