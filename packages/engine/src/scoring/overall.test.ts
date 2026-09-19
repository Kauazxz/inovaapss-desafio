import { describe, expect, it } from 'vitest';

import { computeCommercialImpact, computeOverallHealth, computePriority } from './overall.js';
import { EngineConfigError } from '../shared/errors.js';

import type { MetricContribution } from './types.js';

/** Pesos oficiais do preset GlobalSys v1 (§71). */
export const GLOBALSYS_WEIGHTS: Record<string, number> = {
  critical_tickets: 0.18,
  resolution_vs_sla: 0.16,
  platform_usage: 0.14,
  sla_compliance: 0.12,
  reopened_tickets: 0.1,
  formal_complaints: 0.09,
  open_tickets: 0.07,
  payment_delay: 0.06,
  missed_meetings: 0.05,
  nps_dissatisfaction: 0.03,
};

const contributions = (
  healths: Record<string, number | null>,
  confidences: Record<string, number> = {},
): MetricContribution[] =>
  Object.entries(GLOBALSYS_WEIGHTS).map(([metricId, weight]) => ({
    metricId,
    weight,
    metricHealth: metricId in healths ? (healths[metricId] as number | null) : 100,
    confidence: confidences[metricId] ?? 100,
  }));

describe('overall health, confiança e risco (§24–§26)', () => {
  it('GlobalSys v1 soma 100 %', () => {
    const total = Object.values(GLOBALSYS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(Object.keys(GLOBALSYS_WEIGHTS)).toHaveLength(10);
  });

  it('tudo saudável → 100, risco 0, Normal, confiança 100', () => {
    const result = computeOverallHealth(contributions({}));
    expect(result.overallHealth).toBe(100);
    expect(result.riskScore).toBe(0);
    expect(result.healthClass).toBe('NORMAL');
    expect(result.analysisConfidence).toBe(100);
    expect(result.totalWeight).toBeCloseTo(1);
    expect(Object.values(result.normalizedWeights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
  });

  it('tudo crítico → 0 e risco 100', () => {
    const zeros = Object.fromEntries(Object.keys(GLOBALSYS_WEIGHTS).map((k) => [k, 0]));
    const result = computeOverallHealth(contributions(zeros));
    expect(result.overallHealth).toBe(0);
    expect(result.riskScore).toBe(100);
    expect(result.healthClass).toBe('CRITICAL');
  });

  it('média ponderada e risco = 100 − health', () => {
    const result = computeOverallHealth([
      { metricId: 'a', weight: 0.5, metricHealth: 80, confidence: 100 },
      { metricId: 'b', weight: 0.5, metricHealth: 65, confidence: 100 },
    ]);
    expect(result.overallHealth).toBe(72.5);
    expect(result.riskScore).toBe(27.5);
    expect(result.healthClass).toBe('ATTENTION');
  });

  it('métrica ausente sai da média e reduz a confiança (nunca vira saúde nem doença)', () => {
    const result = computeOverallHealth(contributions({ critical_tickets: null }));
    expect(result.overallHealth).toBe(100);
    expect(result.availableWeight).toBeCloseTo(0.82);
    expect(result.analysisConfidence).toBe(82);
    expect(result.normalizedWeights.critical_tickets).toBeUndefined();
    expect(result.normalizedWeights.resolution_vs_sla).toBeCloseTo(0.16 / 0.82, 4);
  });

  it('pesa a confiança da métrica e o frescor na cobertura', () => {
    const half = computeOverallHealth([
      { metricId: 'a', weight: 0.5, metricHealth: 80, confidence: 100 },
      { metricId: 'b', weight: 0.5, metricHealth: 60, confidence: 50 },
    ]);
    expect(half.overallHealth).toBe(70);
    expect(half.analysisConfidence).toBe(75);

    const ignored = computeOverallHealth(
      [
        { metricId: 'a', weight: 0.5, metricHealth: 80, confidence: 100 },
        { metricId: 'b', weight: 0.5, metricHealth: 60, confidence: 50 },
      ],
      { useMetricConfidence: false },
    );
    expect(ignored.analysisConfidence).toBe(100);

    const stale = computeOverallHealth([
      { metricId: 'a', weight: 0.5, metricHealth: 80, confidence: 100, freshness: 0.5 },
      { metricId: 'b', weight: 0.5, metricHealth: 60, confidence: 100 },
    ]);
    expect(stale.analysisConfidence).toBe(75);
  });

  it('sem nenhuma métrica disponível → health/risco/classe null e confiança 0', () => {
    const result = computeOverallHealth([
      { metricId: 'a', weight: 1, metricHealth: null, confidence: 0 },
    ]);
    expect(result.overallHealth).toBeNull();
    expect(result.riskScore).toBeNull();
    expect(result.healthClass).toBeNull();
    expect(result.analysisConfidence).toBe(0);
    expect(computeOverallHealth([]).analysisConfidence).toBe(0);
  });

  it('peso zero é ignorado; peso negativo é erro', () => {
    const result = computeOverallHealth([
      { metricId: 'a', weight: 0, metricHealth: 0, confidence: 100 },
      { metricId: 'b', weight: 1, metricHealth: 90, confidence: 100 },
    ]);
    expect(result.overallHealth).toBe(90);
    expect(() =>
      computeOverallHealth([{ metricId: 'a', weight: -1, metricHealth: 1, confidence: 1 }]),
    ).toThrow(EngineConfigError);
  });

  it('faixas de classe configuráveis', () => {
    const bands = [
      { class: 'NORMAL', min: 90 },
      { class: 'ATTENTION', min: 75 },
      { class: 'RISK', min: 50 },
      { class: 'CRITICAL', min: 0 },
    ] as const;
    const result = computeOverallHealth(
      [{ metricId: 'a', weight: 1, metricHealth: 85, confidence: 100 }],
      {},
      bands,
    );
    expect(result.healthClass).toBe('ATTENTION');
  });
});

describe('impacto comercial (§28)', () => {
  it('combina valor mensal relativo e importância estratégica (60/40)', () => {
    const result = computeCommercialImpact({
      monthlyValue: 5000,
      referenceMonthlyValue: 10000,
      strategicImportance: 80,
    });
    expect(result.factors.monthlyValue?.score).toBe(50);
    expect(result.score).toBe(62);
  });

  it('fator desconhecido sai da conta; nenhum fator → null', () => {
    expect(
      computeCommercialImpact({ monthlyValue: 5000, referenceMonthlyValue: 10000 }).score,
    ).toBe(50);
    expect(computeCommercialImpact({ strategicImportance: 30 }).score).toBe(30);
    expect(computeCommercialImpact({}).score).toBeNull();
    expect(
      computeCommercialImpact({ monthlyValue: 10, referenceMonthlyValue: 0 }).score,
    ).toBeNull();
    expect(
      computeCommercialImpact({ monthlyValue: 20000, referenceMonthlyValue: 10000 }).score,
    ).toBe(100);
  });

  it('fatores extras e pesos configuráveis', () => {
    const result = computeCommercialImpact(
      {
        strategicImportance: 40,
        extraFactors: { plan: { score: 100, weight: 1 }, size: { score: null, weight: 1 } },
      },
      { weights: { strategicImportance: 1, monthlyValue: 0 } },
    );
    expect(result.score).toBe(70);
    expect(() =>
      computeCommercialImpact({ extraFactors: { x: { score: 1, weight: -1 } } }),
    ).toThrow(EngineConfigError);
  });
});

describe('prioridade (§27, §28)', () => {
  it('risco × 0,70 + impacto × 0,30 e classes P0–P3', () => {
    const result = computePriority({ riskScore: 60, commercialImpactScore: 40 });
    expect(result.priorityScore).toBe(54);
    expect(result.priorityClass).toBe('P2');
    expect(result.floorApplied).toBe(false);
    expect(result.weightsUsed).toEqual({ risk: 0.7, impact: 0.3 });
    expect(computePriority({ riskScore: 100, commercialImpactScore: 100 }).priorityClass).toBe(
      'P0',
    );
    expect(computePriority({ riskScore: 0, commercialImpactScore: 0 }).priorityClass).toBe('P3');
  });

  it('prioridade é separada de risco: mesmo risco, impacto diferente, prioridade diferente', () => {
    const small = computePriority({ riskScore: 70, commercialImpactScore: 10 });
    const big = computePriority({ riskScore: 70, commercialImpactScore: 100 });
    expect(small.priorityScore).toBe(52);
    expect(big.priorityScore).toBe(79);
    expect(small.priorityClass).toBe('P2');
    expect(big.priorityClass).toBe('P1');
  });

  it('sem impacto conhecido usa só o risco', () => {
    const result = computePriority({ riskScore: 60, commercialImpactScore: null });
    expect(result.priorityScore).toBe(60);
    expect(result.weightsUsed).toEqual({ risk: 1, impact: 0 });
  });

  it('piso dos gatilhos eleva a prioridade sem tocar no risco', () => {
    const floored = computePriority({
      riskScore: 20,
      commercialImpactScore: 10,
      priorityFloor: 85,
    });
    expect(floored.computedScore).toBe(17);
    expect(floored.priorityScore).toBe(85);
    expect(floored.priorityClass).toBe('P0');
    expect(floored.floorApplied).toBe(true);
    const below = computePriority({ riskScore: 90, commercialImpactScore: 90, priorityFloor: 50 });
    expect(below.floorApplied).toBe(false);
    expect(below.priorityScore).toBe(90);
  });

  it('sem risco: prioridade null, salvo piso de gatilho', () => {
    expect(
      computePriority({ riskScore: null, commercialImpactScore: 50 }).priorityScore,
    ).toBeNull();
    const floored = computePriority({
      riskScore: null,
      commercialImpactScore: 50,
      priorityFloor: 70,
    });
    expect(floored.priorityScore).toBe(70);
    expect(floored.priorityClass).toBe('P1');
    expect(floored.floorApplied).toBe(true);
  });

  it('pesos e faixas configuráveis; pesos inválidos são erro', () => {
    const custom = computePriority(
      { riskScore: 60, commercialImpactScore: 40 },
      {
        weights: { risk: 1, impact: 1 },
        bands: [
          { class: 'P0', min: 50 },
          { class: 'P3', min: 0 },
        ],
      },
    );
    expect(custom.priorityScore).toBe(50);
    expect(custom.priorityClass).toBe('P0');
    expect(() =>
      computePriority(
        { riskScore: 1, commercialImpactScore: 1 },
        { weights: { risk: 0, impact: 0 } },
      ),
    ).toThrow(EngineConfigError);
  });
});
