/**
 * Uma execução completa: medir os pesos de hoje, propor outros e medir a proposta.
 */
import { describe, expect, it } from 'vitest';

import { runCalibration } from './calibrate.js';

import type { CalibrationClientSeries, CalibrationWeight } from './types.js';

const MESES = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'];

const PESOS: CalibrationWeight[] = [
  { metricId: 'sinal', metricName: 'Sinal', weight: 0.2 },
  { metricId: 'ruido', metricName: 'Ruído', weight: 0.8 },
];

function cliente(
  clientId: string,
  sinal: readonly number[],
  ruido: readonly number[],
  churnPeriodEnd: string | null = null,
): CalibrationClientSeries {
  return {
    clientId,
    clientName: clientId,
    churnPeriodEnd,
    periods: sinal.map((valor, index) => ({
      periodEnd: MESES[index] as string,
      metricHealth: { sinal: valor, ruido: ruido[index] ?? null },
      commercialImpactScore: 50,
    })),
  };
}

/** Quem saiu tinha "sinal" no chão; "ruido" é alto para todo mundo e esconde o problema. */
const CARTEIRA: CalibrationClientSeries[] = [
  cliente('saiu-1', [40, 20, 10, 5], [90, 92, 91, 90], '2026-05-31'),
  cliente('saiu-2', [38, 22, 12, 6], [91, 90, 92, 91], '2026-05-31'),
  cliente('ficou-1', [88, 90, 87, 89], [90, 91, 89, 92]),
  cliente('ficou-2', [91, 89, 92, 90], [92, 90, 91, 89]),
  cliente('ficou-3', [86, 88, 90, 87], [89, 92, 90, 91]),
];

describe('runCalibration', () => {
  it('devolve os parâmetros usados, o desempenho de hoje, a proposta e o desempenho dela', () => {
    const resultado = runCalibration({
      clients: CARTEIRA,
      weights: PESOS,
      options: { windowDays: 60 },
    });

    expect(resultado.parameters).toMatchObject({
      windowDays: 60,
      windowPeriods: 2,
      suggestionStrength: 0.5,
      minimumWeight: 0.01,
    });
    expect(resultado.baseline.churnsAnalyzed).toBe(2);
    expect(resultado.suggestions).toHaveLength(2);
    expect(resultado.proposed.windowDays).toBe(60);
    expect(resultado.proposed.churnsAnalyzed).toBe(resultado.baseline.churnsAnalyzed);
  });

  it('a proposta pesa mais a métrica que antecipou as saídas', () => {
    const { suggestions } = runCalibration({
      clients: CARTEIRA,
      weights: PESOS,
      options: { windowDays: 60 },
    });
    const sinal = suggestions.find((s) => s.metricId === 'sinal');
    expect(sinal?.suggestedWeight ?? 0).toBeGreaterThan(sinal?.currentWeight ?? 1);
  });

  it('os dois backtests usam a mesma grade e o mesmo limiar — a comparação é entre iguais', () => {
    const resultado = runCalibration({
      clients: CARTEIRA,
      weights: PESOS,
      options: { windowDays: 90, alertRiskThreshold: 35 },
    });
    expect(resultado.proposed.alertRiskThreshold).toBe(35);
    expect(resultado.baseline.alertRiskThreshold).toBe(35);
    expect(resultado.proposed.periodsAnalyzed).toBe(resultado.baseline.periodsAnalyzed);
    expect(resultado.proposed.pairsAnalyzed).toBe(resultado.baseline.pairsAnalyzed);
  });

  it('respeita força e piso informados', () => {
    const resultado = runCalibration({
      clients: CARTEIRA,
      weights: PESOS,
      options: { suggestionStrength: 0, minimumWeight: 0.05 },
    });
    expect(resultado.parameters).toMatchObject({ suggestionStrength: 0, minimumWeight: 0.05 });
    expect(resultado.suggestions.map((s) => s.suggestedWeight)).toEqual([0.2, 0.8]);
  });

  it('é determinístico: duas execuções iguais devolvem o mesmo objeto', () => {
    const entrada = { clients: CARTEIRA, weights: PESOS, options: { windowDays: 30 } };
    expect(runCalibration(entrada)).toEqual(runCalibration(entrada));
  });
});
