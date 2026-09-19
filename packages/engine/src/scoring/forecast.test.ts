import { describe, expect, it } from 'vitest';

import {
  buildForecastChart,
  buildForecastRow,
  projectHealth,
  thresholdsFromBands,
  type ForecastClientInput,
} from './forecast.js';
import { EngineConfigError } from '../shared/errors.js';

const client = (overrides: Partial<ForecastClientInput> = {}): ForecastClientInput => ({
  clientId: 'c1',
  clientName: 'Beta S.A.',
  mrr: 8500,
  currency: 'BRL',
  priorityScore: 72,
  healthHistory: [80, 70, 60],
  analysisConfidence: 91,
  topEvidence: 'SLA caiu 24 p.p. em 3 meses.',
  periodEnd: '2026-08-31',
  ...overrides,
});

describe('projeção por tendência (DATAVIZ.md §5.2)', () => {
  it('projetado = clamp(atual + slope)', () => {
    const result = projectHealth([80, 70, 60], 91);
    expect(result.slope).toBe(-10);
    expect(result.projected).toBe(50);
    expect(result.periodsAvailable).toBe(3);
    expect(result.confidence).toBe('high');
  });

  it('com 2 pontos é o delta simples e a confiança é baixa', () => {
    const result = projectHealth([70, 60], 91);
    expect(result.projected).toBe(50);
    expect(result.confidence).toBe('low');
  });

  it('sem histórico suficiente → sem projeção, confiança baixa', () => {
    const result = projectHealth([60], 91);
    expect(result.projected).toBeNull();
    expect(result.slope).toBeNull();
    expect(result.confidence).toBe('low');
    expect(projectHealth([], 91).periodsAvailable).toBe(0);
    expect(projectHealth([null, 60], 91).projected).toBeNull();
  });

  it('confiança média quando a análise está abaixo de 70', () => {
    expect(projectHealth([80, 70, 60], 65).confidence).toBe('medium');
    expect(projectHealth([80, 70, 60], 65, { highConfidenceAt: 60 }).confidence).toBe('high');
  });

  it('limita a 0–100 e respeita a janela', () => {
    expect(projectHealth([10, 5, 0], 90).projected).toBe(0);
    expect(projectHealth([90, 95, 100], 90).projected).toBe(100);
    expect(projectHealth([0, 0, 80, 70, 60], 90, { trendWindow: 5 }).slope).toBe(19);
    expect(() => projectHealth([1, 2], 90, { trendWindow: 1 })).toThrow(EngineConfigError);
  });
});

describe('linha do gráfico de forecast priorizado', () => {
  it('marca quem cruza para Risco ou Crítico vindo de classe melhor', () => {
    const row = buildForecastRow(client());
    expect(row.healthCurrent).toBe(60);
    expect(row.currentClass).toBe('ATTENTION');
    expect(row.healthProjected).toBe(50);
    expect(row.projectedClass).toBe('RISK');
    expect(row.crossesDown).toBe(true);
    expect(row.priorityClass).toBe('P1');
    expect(row.trendWindow).toBe(3);
    expect(row.periodsAvailable).toBe(3);
    expect(row.projectionConfidence).toBe('high');
    expect(row.topEvidence).toBe('SLA caiu 24 p.p. em 3 meses.');
  });

  it('já em Crítico e caindo não recebe destaque; melhorando também não', () => {
    expect(buildForecastRow(client({ healthHistory: [30, 20, 10] })).crossesDown).toBe(false);
    const improving = buildForecastRow(client({ healthHistory: [40, 50, 60] }));
    expect(improving.healthProjected).toBe(70);
    expect(improving.projectedClass).toBe('ATTENTION');
    expect(improving.crossesDown).toBe(false);
    expect(buildForecastRow(client({ healthHistory: [90, 85, 80] })).crossesDown).toBe(false);
  });

  it('sem histórico: só o ponto atual', () => {
    const row = buildForecastRow(client({ healthHistory: [60] }));
    expect(row.healthProjected).toBeNull();
    expect(row.projectedClass).toBeNull();
    expect(row.slopePerPeriod).toBeNull();
    expect(row.crossesDown).toBe(false);
    expect(row.projectionConfidence).toBe('low');
    expect(() => buildForecastRow(client({ healthHistory: [] }))).toThrow(EngineConfigError);
  });

  it('classe de prioridade informada tem precedência; faixas configuráveis', () => {
    const row = buildForecastRow(client({ priorityClass: 'P0' }));
    expect(row.priorityClass).toBe('P0');
    const custom = buildForecastRow(client({ healthHistory: [80, 70, 60] }), {
      healthBands: [
        { class: 'NORMAL', min: 90 },
        { class: 'ATTENTION', min: 70 },
        { class: 'RISK', min: 55 },
        { class: 'CRITICAL', min: 0 },
      ],
    });
    expect(custom.currentClass).toBe('RISK');
    expect(custom.projectedClass).toBe('CRITICAL');
    expect(custom.crossesDown).toBe(true);
  });

  it('thresholds vêm das faixas vigentes', () => {
    expect(
      thresholdsFromBands([
        { class: 'NORMAL', min: 80 },
        { class: 'ATTENTION', min: 60 },
        { class: 'RISK', min: 40 },
        { class: 'CRITICAL', min: 0 },
      ]),
    ).toEqual({
      attention: 80,
      risk: 60,
      critical: 40,
    });
    expect(thresholdsFromBands([])).toEqual({ attention: 80, risk: 60, critical: 40 });
  });
});

describe('payload do gráfico', () => {
  const clients: ForecastClientInput[] = [
    client({ clientId: 'omega', clientName: 'Ômega', priorityScore: 20, healthHistory: [85] }),
    client({
      clientId: 'alfa',
      clientName: 'Alfa Ltda',
      priorityScore: 95,
      healthHistory: [30, 20, 10],
    }),
    client({ clientId: 'beta', clientName: 'Beta S.A.', priorityScore: 72 }),
    client({
      clientId: 'gama',
      clientName: 'Gama ME',
      priorityScore: 72,
      healthHistory: [55, 50, 45],
    }),
  ];

  it('ordena por prioridade (desempate pelo menor health) e conta os cruzamentos', () => {
    const chart = buildForecastChart(clients, { periodLabel: 'mês' });
    expect(chart.rows.map((r) => r.clientId)).toEqual(['alfa', 'gama', 'beta', 'omega']);
    expect(chart.crossingCount).toBe(1);
    expect(chart.thresholds).toEqual({ attention: 80, risk: 60, critical: 40 });
    expect(chart.trendWindow).toBe(3);
    expect(chart.periodLabel).toBe('mês');
  });

  it('limite de linhas', () => {
    const chart = buildForecastChart(clients, { limit: 2 });
    expect(chart.rows).toHaveLength(2);
    expect(chart.periodLabel).toBe('período');
    expect(buildForecastChart([]).crossingCount).toBe(0);
  });
});
