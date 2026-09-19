import { describe, expect, it } from 'vitest';

import { buildEvidence, rawTrendDirection, topNegativeEvidence } from './evidence.js';
import { scoreMetric } from './metric-health.js';

import type { MetricConfig, PeriodValue } from './types.js';

const linear = (id: string, name: string, weight: number): MetricConfig => ({
  id,
  name,
  unit: '%',
  direction: 'HIGHER_IS_BETTER',
  weight,
  normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
});

const series = (values: (number | null)[]): PeriodValue[] =>
  values.map((value, i) => ({ periodEnd: `2026-0${i + 1}-28`, value }));

describe('evidências (§29)', () => {
  it('ordena os drivers pela contribuição para o risco', () => {
    const a = scoreMetric({ metric: linear('a', 'Uso', 0.5), series: series([80, 80, 80]) });
    const b = scoreMetric({ metric: linear('b', 'SLA', 0.5), series: series([90, 65, 40]) });
    const drivers = buildEvidence([a, b], { a: 0.5, b: 0.5 });
    expect(drivers.map((d) => d.metricId)).toEqual(['b', 'a']);
    expect(drivers[0]?.contribution).toBeGreaterThan(drivers[1]?.contribution ?? 0);
    expect(drivers[0]?.isNegative).toBe(true);
    expect(drivers[0]?.humanExplanation).toBe('SLA caiu 50 p.p. em 3 períodos.');
    expect(drivers[0]?.delta).toBe(-25);
    expect(drivers[0]?.trend).toBe('down');
    expect(drivers[0]?.weight).toBe(0.5);
    expect(drivers[1]?.contribution).toBe(8); // 80 × 0,45 + 80 × 0,35 + 100 × 0,20 = 84
    expect(drivers[1]?.trend).toBe('stable');
  });

  it('métrica sem dado fica no fim, com contribuição zero e sem ser negativa', () => {
    const ok = scoreMetric({ metric: linear('ok', 'Uso', 0.5), series: series([80, 80, 80]) });
    const na = scoreMetric({ metric: linear('na', 'NPS', 0.5), series: series([null]) });
    const drivers = buildEvidence([na, ok], { ok: 1 });
    expect(drivers.map((d) => d.metricId)).toEqual(['ok', 'na']);
    expect(drivers[1]?.contribution).toBe(0);
    expect(drivers[1]?.isNegative).toBe(false);
    expect(drivers[1]?.healthScore).toBeNull();
    expect(drivers[1]?.trend).toBeNull();
    expect(drivers[1]?.humanExplanation).toBe('NPS: sem dado no período.');
  });

  it('empate em contribuição: menor health primeiro, depois maior peso', () => {
    const full1 = scoreMetric({ metric: linear('x', 'X', 0.3), series: series([100, 100]) });
    const full2 = scoreMetric({ metric: linear('y', 'Y', 0.7), series: series([100, 100]) });
    const drivers = buildEvidence([full1, full2], { x: 0.3, y: 0.7 });
    expect(drivers.map((d) => d.metricId)).toEqual(['y', 'x']);
    expect(topNegativeEvidence(drivers)).toBeNull();
  });

  it('a principal evidência negativa', () => {
    const a = scoreMetric({ metric: linear('a', 'Uso', 0.5), series: series([80, 80, 80]) });
    const b = scoreMetric({ metric: linear('b', 'SLA', 0.5), series: series([90, 65, 40]) });
    expect(topNegativeEvidence(buildEvidence([a, b], { a: 0.5, b: 0.5 }))?.metricId).toBe('b');
  });

  it('direção do valor bruto', () => {
    expect(rawTrendDirection(5, 3)).toBe('up');
    expect(rawTrendDirection(3, 5)).toBe('down');
    expect(rawTrendDirection(5, 5)).toBe('stable');
    expect(rawTrendDirection(5, null)).toBeNull();
  });
});
