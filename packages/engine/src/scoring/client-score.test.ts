/**
 * Testes de aceite do motor (§55) sobre o pipeline completo de um cliente, com o preset GlobalSys
 * v1 (§12, §71). As séries abaixo são dados de exemplo sintéticos para exercitar as fórmulas —
 * não são resultados da planilha real (§44).
 */
import { describe, expect, it } from 'vitest';

import { scoreClient } from './client-score.js';
import { missedMeetingRate, npsHealth } from './derived.js';

import type { MetricConfig, MetricInput, PeriodValue } from './types.js';

const PERIODS = ['2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31'];
const series = (values: (number | null)[]): PeriodValue[] =>
  values.map((value, i) => ({ periodEnd: PERIODS[i] as string, value }));

const linear = (min: number, max: number): MetricConfig['normalization'] => ({
  strategy: 'LINEAR_RANGE',
  min,
  max,
});

/** Preset GlobalSys v1 (§71) com normalizações de exemplo. */
export const GLOBALSYS_V1: MetricConfig[] = [
  {
    id: 'critical_tickets',
    key: 'critical_tickets',
    name: 'Chamados críticos',
    unit: '%',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.18,
    normalization: linear(0, 50),
  },
  {
    id: 'resolution_vs_sla',
    key: 'resolution_vs_sla',
    name: 'Tempo de resolução × SLA',
    unit: 'pts',
    direction: 'HIGHER_IS_BETTER',
    weight: 0.16,
    normalization: linear(0, 100),
  },
  {
    id: 'platform_usage',
    key: 'platform_usage',
    name: 'Uso da plataforma',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    weight: 0.14,
    normalization: linear(0, 100),
  },
  {
    id: 'sla_compliance',
    key: 'sla_compliance',
    name: 'Cumprimento de SLA',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    weight: 0.12,
    normalization: linear(0, 100),
  },
  {
    id: 'reopened_tickets',
    key: 'reopened_tickets',
    name: 'Chamados reabertos',
    unit: '%',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.1,
    normalization: linear(0, 30),
  },
  {
    id: 'formal_complaints',
    key: 'formal_complaints',
    name: 'Reclamações formais',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.09,
    normalization: {
      strategy: 'THRESHOLD_BANDS',
      bands: [
        { upTo: 0, health: 100 },
        { upTo: 1, health: 70 },
        { upTo: 3, health: 30 },
        { upTo: null, health: 0 },
      ],
    },
  },
  {
    id: 'open_tickets',
    key: 'open_tickets',
    name: 'Chamados abertos',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.07,
    normalization: { strategy: 'BASELINE_DEVIATION' },
  },
  {
    id: 'payment_delay',
    key: 'payment_delay',
    name: 'Atraso de pagamento',
    unit: 'dias',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.06,
    normalization: linear(0, 30),
  },
  {
    id: 'missed_meetings',
    key: 'missed_meetings',
    name: 'Reuniões não realizadas',
    unit: '%',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.05,
    normalization: linear(0, 100),
  },
  {
    id: 'nps_dissatisfaction',
    key: 'nps_dissatisfaction',
    name: 'Insatisfação / NPS',
    direction: 'HIGHER_IS_BETTER',
    weight: 0.03,
    normalization: linear(0, 100),
  },
];

const healthyValues: Record<string, (number | null)[]> = {
  critical_tickets: [0, 0, 0, 0],
  resolution_vs_sla: [100, 100, 100, 100],
  platform_usage: [100, 100, 100, 100],
  sla_compliance: [100, 100, 100, 100],
  reopened_tickets: [0, 0, 0, 0],
  formal_complaints: [0, 0, 0, 0],
  open_tickets: [10, 10, 10, 10],
  payment_delay: [0, 0, 0, 0],
  missed_meetings: [0, 0, 0, 0],
  nps_dissatisfaction: [100, 100, 100, 100],
};

const criticalValues: Record<string, (number | null)[]> = {
  critical_tickets: [10, 20, 40, 60],
  resolution_vs_sla: [60, 40, 20, 10],
  platform_usage: [70, 55, 40, 30],
  sla_compliance: [90, 70, 50, 35],
  reopened_tickets: [5, 10, 20, 30],
  formal_complaints: [0, 1, 2, 4],
  open_tickets: [10, 12, 18, 30],
  payment_delay: [0, 10, 20, 35],
  missed_meetings: [0, 25, 50, 100],
  nps_dissatisfaction: [80, 60, 40, 20],
};

const inputs = (
  values: Record<string, (number | null)[]>,
  overrides: Partial<Record<string, Partial<MetricConfig>>> = {},
): MetricInput[] =>
  GLOBALSYS_V1.map((metric) => ({
    metric: { ...metric, ...(overrides[metric.id] ?? {}) },
    series: series(values[metric.id] ?? []),
  }));

describe('critérios de aceite do motor (§55)', () => {
  it('GlobalSys v1 soma 100 % e tem 10 métricas', () => {
    expect(GLOBALSYS_V1).toHaveLength(10);
    expect(GLOBALSYS_V1.reduce((acc, m) => acc + m.weight, 0)).toBeCloseTo(1, 10);
  });

  it('cliente saudável e estável: health 100, risco 0, Normal, confiança 100', () => {
    const result = scoreClient({
      clientId: 'ok',
      metrics: inputs(healthyValues),
      commercialImpact: 50,
    });
    expect(result.overallHealth).toBe(100);
    expect(result.riskScore).toBe(0);
    expect(result.healthClass).toBe('NORMAL');
    expect(result.analysisConfidence).toBe(100);
    expect(result.priorityScore).toBe(15);
    expect(result.priorityClass).toBe('P3');
    expect(result.metrics).toHaveLength(10);
    expect(result.evidence.every((d) => !d.isNegative)).toBe(true);
    expect(result.periodEnd).toBe('2026-08-31');
    expect(result.triggers.hits).toHaveLength(0);
  });

  it('cliente em deterioração: health baixo, Crítico, risco = 100 − health, evidências ordenadas', () => {
    const result = scoreClient({
      clientId: 'bad',
      metrics: inputs(criticalValues),
      commercialImpact: {
        monthlyValue: 12000,
        referenceMonthlyValue: 12000,
        strategicImportance: 100,
      },
      config: { periodLabel: 'mês' },
    });
    expect(result.overallHealth).not.toBeNull();
    expect(result.overallHealth as number).toBeLessThan(40);
    expect(result.overallHealth as number).toBeGreaterThanOrEqual(0);
    expect(result.healthClass).toBe('CRITICAL');
    expect(result.riskScore).toBeCloseTo(100 - (result.overallHealth as number), 6);
    expect(result.commercialImpactScore).toBe(100);
    expect(result.priorityClass).toBe('P0');
    expect(result.evidence[0]?.isNegative).toBe(true);
    const contributions = result.evidence.map((d) => d.contribution);
    expect([...contributions].sort((a, b) => b - a)).toEqual(contributions);
    expect(result.evidence[0]?.humanExplanation).toMatch(/em 3 meses/);
    for (const m of result.metrics) {
      expect(m.metricHealth as number).toBeGreaterThanOrEqual(0);
      expect(m.metricHealth as number).toBeLessThanOrEqual(100);
    }
  });

  it('NPS sem resposta não vira zero: a métrica é N/A e só a confiança cai', () => {
    const values = {
      ...healthyValues,
      nps_dissatisfaction: [100, 100, null, npsHealth(false, null)],
    };
    const result = scoreClient({ clientId: 'nps', metrics: inputs(values) });
    const nps = result.metrics.find((m) => m.metricId === 'nps_dissatisfaction');
    expect(nps?.metricHealth).toBeNull();
    expect(result.overallHealth).toBe(100);
    expect(result.analysisConfidence).toBe(97);
  });

  it('reuniões previstas = 0 → N/A na métrica, sem penalizar nem premiar', () => {
    const values = { ...healthyValues, missed_meetings: [0, 0, 0, missedMeetingRate(0, 0)] };
    const result = scoreClient({ clientId: 'meet', metrics: inputs(values) });
    expect(result.metrics.find((m) => m.metricId === 'missed_meetings')?.metricHealth).toBeNull();
    expect(result.overallHealth).toBe(100);
    expect(result.analysisConfidence).toBe(95);
  });

  it('gatilho crítico é separado do peso: piso de prioridade sem distorcer o health', () => {
    const result = scoreClient({
      clientId: 'trig',
      metrics: inputs(healthyValues, {
        critical_tickets: {
          triggers: [
            {
              id: 'rec',
              kind: 'THRESHOLD',
              name: '3 tickets críticos reincidentes',
              field: 'extra.critical_tickets',
              operator: '>=',
              threshold: 3,
              priorityFloor: 85,
            },
          ],
        },
      }).map((m) =>
        m.metric.id === 'critical_tickets' ? { ...m, extra: { critical_tickets: 3 } } : m,
      ),
      commercialImpact: 50,
    });
    expect(result.overallHealth).toBe(100);
    expect(result.riskScore).toBe(0);
    expect(result.priorityFloor).toBe(85);
    expect(result.priorityScore).toBe(85);
    expect(result.priorityClass).toBe('P0');
    expect(result.priority.floorApplied).toBe(true);
    expect(result.triggers.hits[0]?.metricId).toBe('critical_tickets');
  });

  it('prioridade é separada de risco: impacto comercial muda a ordem, não a saúde', () => {
    const small = scoreClient({
      clientId: 'a',
      metrics: inputs(criticalValues),
      commercialImpact: 10,
    });
    const big = scoreClient({
      clientId: 'b',
      metrics: inputs(criticalValues),
      commercialImpact: 100,
    });
    expect(small.overallHealth).toBe(big.overallHealth);
    expect(small.riskScore).toBe(big.riskScore);
    expect(big.priorityScore as number).toBeGreaterThan(small.priorityScore as number);
    const unknown = scoreClient({ clientId: 'c', metrics: inputs(criticalValues) });
    expect(unknown.commercialImpactScore).toBeNull();
    expect(unknown.priorityScore).toBe(unknown.riskScore);
  });

  it('métricas inativas ficam de fora; faixas e pesos são configuráveis', () => {
    const result = scoreClient({
      clientId: 'cfg',
      metrics: inputs(healthyValues, { nps_dissatisfaction: { isActive: false } }),
      commercialImpact: 100,
      config: {
        healthBands: [
          { class: 'ATTENTION', min: 0 },
          { class: 'NORMAL', min: 101 },
        ],
        priority: { weights: { risk: 0.5, impact: 0.5 } },
      },
    });
    expect(result.metrics).toHaveLength(9);
    expect(result.analysisConfidence).toBe(100);
    expect(result.healthClass).toBe('ATTENTION');
    expect(result.priorityScore).toBe(50);
  });

  it('sem nenhum dado: tudo N/A, confiança 0, sem risco inventado', () => {
    const empty = Object.fromEntries(Object.keys(healthyValues).map((k) => [k, [null]]));
    const result = scoreClient({ clientId: 'none', metrics: inputs(empty), commercialImpact: 90 });
    expect(result.overallHealth).toBeNull();
    expect(result.riskScore).toBeNull();
    expect(result.healthClass).toBeNull();
    expect(result.analysisConfidence).toBe(0);
    expect(result.priorityScore).toBeNull();
    expect(result.evidence.every((d) => d.contribution === 0)).toBe(true);
  });
});
