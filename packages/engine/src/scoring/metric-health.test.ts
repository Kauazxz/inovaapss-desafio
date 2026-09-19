import { describe, expect, it } from 'vitest';

import { combineComponents, scoreMetric, sortSeries } from './metric-health.js';
import { EngineConfigError } from '../shared/errors.js';

import type { MetricConfig, MetricInput, PeriodValue } from './types.js';

const usage: MetricConfig = {
  id: 'usage',
  key: 'platform_usage',
  name: 'Uso da plataforma',
  unit: '%',
  direction: 'HIGHER_IS_BETTER',
  weight: 0.14,
  normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
};

const series = (values: (number | null)[], start = 1): PeriodValue[] =>
  values.map((value, i) => ({ periodEnd: `2026-${String(start + i).padStart(2, '0')}-28`, value }));

describe('combineComponents (§8)', () => {
  it('pesos padrão 0,45 / 0,35 / 0,20', () => {
    const result = combineComponents({ current: 80, trend: 60, persistence: 100 });
    expect(result.metricHealth).toBe(77);
    expect(result.confidence).toBe(100);
    expect(result.components.weightsUsed).toEqual({ current: 0.45, trend: 0.35, persistence: 0.2 });
  });

  it('redistribui pesos entre componentes válidos e reduz a confiança', () => {
    const noTrend = combineComponents({ current: 80, trend: null, persistence: 100 });
    expect(noTrend.components.weightsUsed.current).toBeCloseTo(0.6923, 3);
    expect(noTrend.components.weightsUsed.persistence).toBeCloseTo(0.3077, 3);
    expect(noTrend.components.weightsUsed.trend).toBe(0);
    expect(noTrend.metricHealth).toBeCloseTo(86.15, 1);
    expect(noTrend.confidence).toBe(65);

    const onlyCurrent = combineComponents({ current: 80, trend: null, persistence: null });
    expect(onlyCurrent.metricHealth).toBe(80);
    expect(onlyCurrent.confidence).toBe(45);
  });

  it('sem current_health a métrica é N/A (ausência nunca vira saúde)', () => {
    const result = combineComponents({ current: null, trend: 90, persistence: 100 });
    expect(result.metricHealth).toBeNull();
    expect(result.confidence).toBe(0);
    const relaxed = combineComponents(
      { current: null, trend: 90, persistence: 100 },
      {},
      { requireCurrent: false },
    );
    expect(relaxed.metricHealth).toBeCloseTo(93.64, 1);
    expect(relaxed.confidence).toBe(55);
    expect(
      combineComponents(
        { current: null, trend: null, persistence: null },
        {},
        { requireCurrent: false },
      ).metricHealth,
    ).toBeNull();
  });

  it('pesos configuráveis (só a proporção importa)', () => {
    const result = combineComponents(
      { current: 80, trend: 40, persistence: 0 },
      { current: 2, trend: 1, persistence: 1 },
    );
    expect(result.metricHealth).toBe(50);
    expect(result.components.weightsUsed).toEqual({ current: 0.5, trend: 0.25, persistence: 0.25 });
  });

  it('recusa pesos inválidos', () => {
    expect(() =>
      combineComponents({ current: 1, trend: 1, persistence: 1 }, { current: -1 }),
    ).toThrow(EngineConfigError);
    expect(() =>
      combineComponents(
        { current: 1, trend: 1, persistence: 1 },
        { current: 0, trend: 0, persistence: 0 },
      ),
    ).toThrow(EngineConfigError);
  });
});

describe('scoreMetric', () => {
  it('compõe atual, tendência e persistência com o exemplo de referência do SCORING.md', () => {
    const score = scoreMetric({ metric: usage, series: series([90, 85, 80]) });
    expect(score.currentHealth).toBe(80);
    expect(score.trendHealth).toBeCloseTo(68.89, 1);
    expect(score.persistenceHealth).toBe(100);
    expect(score.metricHealth).toBeCloseTo(80.11, 1);
    expect(score.confidence).toBe(100);
    expect(score.currentValue).toBe(80);
    expect(score.previousValue).toBe(85);
    expect(score.periodEnd).toBe('2026-03-28');
    expect(score.metricKey).toBe('platform_usage');
    expect(score.explanation.summary).toBe('Uso da plataforma caiu 10 p.p. em 3 períodos.');
    expect(score.explanation.components).toHaveLength(3);
    expect(score.triggers.hits).toHaveLength(0);
  });

  it('com um período só: sem tendência nem persistência, confiança 45 %', () => {
    const score = scoreMetric({ metric: usage, series: series([80]) });
    expect(score.metricHealth).toBe(80);
    expect(score.trendHealth).toBeNull();
    expect(score.persistenceHealth).toBeNull();
    expect(score.confidence).toBe(45);
    expect(score.explanation.notes.join(' ')).toMatch(/redistribuídos/);
  });

  it('período atual sem dado → métrica N/A (não vira zero nem saúde)', () => {
    const score = scoreMetric({ metric: usage, series: series([80, 90, null]) });
    expect(score.metricHealth).toBeNull();
    expect(score.currentHealth).toBeNull();
    expect(score.confidence).toBe(0);
    expect(score.explanation.summary).toBe('Uso da plataforma: sem dado no período.');
    expect(score.explanation.notes.join(' ')).toMatch(/N\/A/);
  });

  it('série vazia → N/A com motivo', () => {
    const score = scoreMetric({ metric: usage, series: [] });
    expect(score.metricHealth).toBeNull();
    expect(score.normalization.reason).toMatch(/Série vazia/);
    expect(score.periodEnd).toBeNull();
  });

  it('ordena a série por periodEnd antes de calcular', () => {
    const unsorted: PeriodValue[] = [
      { periodEnd: '2026-03-31', value: 66 },
      { periodEnd: '2026-01-31', value: 90 },
      { periodEnd: '2026-02-28', value: 78 },
    ];
    const score = scoreMetric({ metric: usage, series: unsorted });
    expect(score.currentValue).toBe(66);
    expect(score.previousValue).toBe(78);
    expect(
      sortSeries([
        { periodEnd: 'b', value: 1 },
        { periodEnd: 'a', value: 2 },
      ]).map((p) => p.value),
    ).toEqual([1, 2]);
  });

  it('gatilho é separado do peso: dispara sem alterar o health da métrica', () => {
    const input: MetricInput = { metric: usage, series: series([90, 85, 80]) };
    const withTrigger: MetricInput = {
      ...input,
      metric: {
        ...usage,
        triggers: [
          {
            id: 't',
            kind: 'THRESHOLD',
            name: 'Uso abaixo de 85 %',
            field: 'value',
            operator: '<',
            threshold: 85,
            priorityFloor: 85,
          },
        ],
      },
    };
    const plain = scoreMetric(input);
    const triggered = scoreMetric(withTrigger);
    expect(triggered.metricHealth).toBe(plain.metricHealth);
    expect(triggered.triggers.hits).toHaveLength(1);
    expect(triggered.triggers.priorityFloor).toBe(85);
    expect(triggered.explanation.notes.join(' ')).toMatch(/Gatilho/);
  });

  it('campos extras alimentam gatilhos e modelos de explicação', () => {
    const meetings: MetricConfig = {
      id: 'meet',
      name: 'Reuniões não realizadas',
      unit: '%',
      direction: 'HIGHER_IS_WORSE',
      weight: 0.05,
      normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
      explanationTemplate: '{extra.missed} reuniões previstas não ocorreram',
      triggers: [
        {
          id: 'm',
          kind: 'THRESHOLD',
          name: 'Reuniões perdidas',
          field: 'extra.missed',
          operator: '>=',
          threshold: 2,
        },
      ],
    };
    const score = scoreMetric({ metric: meetings, series: series([0, 50]), extra: { missed: 2 } });
    expect(score.explanation.summary).toBe('2 reuniões previstas não ocorreram');
    expect(score.triggers.hits).toHaveLength(1);
    expect(score.currentHealth).toBe(50);
  });

  it('pesos de componente configuráveis por métrica', () => {
    const score = scoreMetric({
      metric: { ...usage, componentWeights: { current: 1, trend: 0, persistence: 0 } },
      series: series([90, 85, 80]),
    });
    expect(score.metricHealth).toBe(80);
    expect(score.components.weightsConfigured).toEqual({ current: 1, trend: 0, persistence: 0 });
  });

  it('BASELINE_DEVIATION usa só o histórico anterior a cada período (sem vazamento)', () => {
    const complaints: MetricConfig = {
      id: 'c',
      name: 'Reclamações formais',
      direction: 'HIGHER_IS_WORSE',
      weight: 0.09,
      normalization: { strategy: 'BASELINE_DEVIATION' },
    };
    const score = scoreMetric({ metric: complaints, series: series([2, 2, 2, 3]) });
    expect(score.normalization.baseline).toBe(2);
    expect(score.normalization.deviationPct).toBe(50);
    expect(score.currentHealth).toBe(0);
    // Os dois primeiros períodos não tinham baseline: só os dois últimos entram na persistência.
    expect(score.persistence.evaluatedPeriods).toBe(2);
  });

  it('mensagem de período configurável', () => {
    const sla: MetricConfig = { ...usage, id: 'sla', name: 'Cumprimento de SLA' };
    const score = scoreMetric(
      { metric: sla, series: series([90, 78, 66]) },
      { periodLabel: 'mês' },
    );
    expect(score.explanation.summary).toBe('Cumprimento de SLA caiu 24 p.p. em 3 meses.');
  });

  it('recusa peso inválido', () => {
    expect(() => scoreMetric({ metric: { ...usage, weight: -1 }, series: series([1]) })).toThrow(
      EngineConfigError,
    );
  });
});
