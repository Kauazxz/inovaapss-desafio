/**
 * Sugestão assistida de pesos (§25, §26, §33).
 *
 * O que está travado aqui: a métrica que separou quem saiu de quem ficou ganha peso, a que não
 * separou perde, a proposta soma exatamente 1,0000 e nenhuma métrica é zerada.
 */
import { describe, expect, it } from 'vitest';

import { runBacktest } from './backtest.js';
import { normalizeWeights, suggestWeights, weightsFromSuggestions } from './weights.js';

import type { CalibrationClientSeries, CalibrationWeight } from './types.js';

const MESES = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'];

const PESOS: CalibrationWeight[] = [
  { metricId: 'sinal', metricName: 'Métrica que avisa', weight: 0.5 },
  { metricId: 'ruido', metricName: 'Métrica que não avisa', weight: 0.5 },
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

/** Quem saiu teve a métrica "sinal" desabando; "ruido" oscila igual para todo mundo. */
function carteira(): CalibrationClientSeries[] {
  return [
    cliente('saiu-1', [80, 60, 30, 20], [70, 72, 69, 71], '2026-05-31'),
    cliente('saiu-2', [82, 58, 28, 18], [68, 74, 70, 69], '2026-05-31'),
    cliente('ficou-1', [88, 90, 87, 89], [71, 69, 73, 70]),
    cliente('ficou-2', [91, 89, 92, 90], [69, 73, 68, 72]),
    cliente('ficou-3', [86, 88, 90, 87], [72, 70, 71, 69]),
  ];
}

function sugerir(clientes = carteira(), pesos = PESOS, strength?: number) {
  const baseline = runBacktest({ clients: clientes, weights: pesos, options: { windowDays: 60 } });
  return suggestWeights({
    clients: clientes,
    weights: pesos,
    rows: baseline.rows,
    suggestionStrength: strength,
  });
}

describe('normalizeWeights', () => {
  it('soma exatamente 1,0000 mesmo com dízima', () => {
    const pesos = normalizeWeights([1, 1, 1]);
    expect(pesos.reduce((a, b) => a + b, 0)).toBe(1);
    expect(pesos).toEqual([0.3334, 0.3333, 0.3333]);
  });

  it('distribui igualmente quando não há base nenhuma', () => {
    const pesos = normalizeWeights([0, 0, 0, 0]);
    expect(pesos).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(normalizeWeights([])).toEqual([]);
  });

  it('sem base e sem divisão exata, o resto sobra para os primeiros e a soma fecha', () => {
    const pesos = normalizeWeights([0, 0, 0]);
    expect(pesos.reduce((a, b) => a + b, 0)).toBe(1);
    expect(pesos[0]).toBeGreaterThanOrEqual(pesos[2] as number);
  });

  it('ignora valores negativos ou inválidos', () => {
    const pesos = normalizeWeights([2, -1, Number.NaN, 2]);
    expect(pesos.reduce((a, b) => a + b, 0)).toBe(1);
    expect(pesos[1]).toBe(0);
    expect(pesos[2]).toBe(0);
  });
});

describe('suggestWeights', () => {
  it('dá mais peso à métrica que separou quem saiu de quem ficou', () => {
    const [sinal, ruido] = sugerir();
    expect(sinal?.metricId).toBe('sinal');
    expect(sinal?.separation ?? 0).toBeGreaterThan(ruido?.separation ?? 0);
    expect(sinal?.historicalImportance ?? 0).toBeGreaterThan(ruido?.historicalImportance ?? 0);
    expect(sinal?.suggestedWeight ?? 0).toBeGreaterThan(sinal?.currentWeight ?? 0);
    expect(ruido?.suggestedWeight ?? 1).toBeLessThan(ruido?.currentWeight ?? 0);
    expect(sinal?.delta).toBeCloseTo((sinal?.suggestedWeight ?? 0) - 0.5, 6);
  });

  it('a proposta soma exatamente 1,0000', () => {
    const soma = sugerir().reduce((acc, s) => acc + s.suggestedWeight, 0);
    expect(soma).toBe(1);
    const importancia = sugerir().reduce((acc, s) => acc + s.historicalImportance, 0);
    expect(importancia).toBe(1);
  });

  it('mostra a saúde média dos dois grupos e o tamanho da amostra', () => {
    const [sinal] = sugerir();
    expect(sinal?.sampleSizeChurned ?? 0).toBeGreaterThan(0);
    expect(sinal?.sampleSizeRetained ?? 0).toBeGreaterThan(0);
    expect(sinal?.meanHealthChurned ?? 100).toBeLessThan(sinal?.meanHealthRetained ?? 0);
  });

  it('com força 0 mantém os pesos atuais; com força 1 vai até a importância histórica', () => {
    const mantido = sugerir(carteira(), PESOS, 0);
    expect(mantido.map((s) => s.suggestedWeight)).toEqual([0.5, 0.5]);

    const inteiro = sugerir(carteira(), PESOS, 1);
    const sinal = inteiro[0];
    expect(sinal?.suggestedWeight).toBeCloseTo(sinal?.historicalImportance ?? 0, 3);
  });

  it('sem cancelamento algum, o passado não opina e a proposta repete os pesos atuais', () => {
    const clientes = [
      cliente('a', [90, 88, 91], [70, 71, 69]),
      cliente('b', [85, 87, 86], [72, 70, 71]),
    ];
    const sugestoes = sugerir(clientes, PESOS, 1);
    expect(sugestoes.map((s) => s.suggestedWeight)).toEqual([0.5, 0.5]);
    expect(sugestoes.every((s) => s.separation === 0)).toBe(true);
  });

  it('métrica sem separação nenhuma não é zerada: o piso de 1 % é respeitado', () => {
    const pesos: CalibrationWeight[] = [
      { metricId: 'sinal', metricName: 'Sinal', weight: 0.5 },
      { metricId: 'ruido', metricName: 'Ruído', weight: 0.5 },
    ];
    const sugestoes = sugerir(carteira(), pesos, 1);
    expect(sugestoes.every((s) => s.suggestedWeight >= 0.01)).toBe(true);
  });

  it('separação invertida (quem saiu estava melhor) não vira importância', () => {
    const clientes = [
      cliente('saiu-1', [95, 96, 94, 95], [70, 71, 69, 70], '2026-05-31'),
      cliente('ficou-1', [40, 41, 39, 42], [70, 69, 71, 70]),
      cliente('ficou-2', [38, 42, 40, 39], [71, 70, 69, 72]),
    ];
    const [sinal] = sugerir(clientes, PESOS, 1);
    expect(sinal?.separation).toBe(0);
  });

  it('converte a proposta em pesos prontos para um novo backtest', () => {
    const sugestoes = sugerir();
    const pesos = weightsFromSuggestions(sugestoes);
    expect(pesos).toHaveLength(2);
    expect(pesos[0]).toMatchObject({ metricId: 'sinal', weight: sugestoes[0]?.suggestedWeight });
  });

  it('é determinístico', () => {
    expect(sugerir()).toEqual(sugerir());
  });
});
