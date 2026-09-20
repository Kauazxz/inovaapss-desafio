/**
 * Sugestão de pesos no modo Assistido (§25 e §26): o sistema propõe, a empresa aprova.
 *
 * A ideia: uma métrica vale mais quanto melhor ela tiver separado, no passado, quem cancelou de
 * quem ficou. A separação é medida em desvios-padrão (d de Cohen) entre a saúde da métrica nos
 * períodos que antecederam uma saída e a saúde nos demais períodos. Nada de "a métrica que mais
 * caiu": queda grande numa métrica que todo mundo tem não distingue ninguém.
 *
 * Duas salvaguardas, porque 22 cancelamentos é pouco:
 * 1. a proposta anda só metade do caminho entre o peso de hoje e a importância histórica;
 * 2. nenhuma métrica é zerada — o piso preserva a leitura do negócio que definiu o modelo.
 */
import { isFiniteNumber, mean, round } from '../shared/math.js';

import type {
  BacktestPeriodRow,
  CalibrationClientSeries,
  CalibrationWeight,
  WeightSuggestion,
} from './types.js';

export const DEFAULT_SUGGESTION_STRENGTH = 0.5;
export const DEFAULT_MINIMUM_WEIGHT = 0.01;

function stdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Normaliza para somar exatamente 1 com `decimals` casas (maior resto).
 * Arredondar cada peso isoladamente deixaria a soma em 0,9999 — e a ativação de versão exige
 * 100 % cravados (§32).
 */
export function normalizeWeights(values: readonly number[], decimals = 4): number[] {
  const scale = 10 ** decimals;
  const total = values.reduce((acc, v) => acc + (isFiniteNumber(v) && v > 0 ? v : 0), 0);
  if (values.length === 0) return [];
  if (total <= 0) {
    // Sem base alguma, distribuição igual — e o resto vai para os primeiros, de forma estável.
    const base = Math.floor(scale / values.length);
    const units = values.map(() => base);
    let left = scale - base * values.length;
    for (let i = 0; left > 0; i = (i + 1) % values.length) {
      units[i] = (units[i] ?? 0) + 1;
      left -= 1;
    }
    return units.map((u) => u / scale);
  }
  const exact = values.map((v) => ((isFiniteNumber(v) && v > 0 ? v : 0) / total) * scale);
  const units = exact.map((v) => Math.floor(v));
  let remainder = scale - units.reduce((acc, v) => acc + v, 0);
  const order = exact
    .map((v, index) => ({ index, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : a.index - b.index));
  for (let k = 0; remainder > 0; k = (k + 1) % order.length) {
    const target = order[k];
    if (target === undefined) break;
    units[target.index] = (units[target.index] ?? 0) + 1;
    remainder -= 1;
  }
  return units.map((u) => u / scale);
}

export interface SuggestWeightsInput {
  clients: readonly CalibrationClientSeries[];
  weights: readonly CalibrationWeight[];
  /** Linhas do backtest com os pesos atuais — dizem quais pares antecederam um cancelamento. */
  rows: readonly BacktestPeriodRow[];
  suggestionStrength?: number | undefined;
  minimumWeight?: number | undefined;
}

export function suggestWeights({
  clients,
  weights,
  rows,
  suggestionStrength,
  minimumWeight,
}: SuggestWeightsInput): WeightSuggestion[] {
  const strength = isFiniteNumber(suggestionStrength)
    ? Math.min(1, Math.max(0, suggestionStrength))
    : DEFAULT_SUGGESTION_STRENGTH;
  const floor = isFiniteNumber(minimumWeight)
    ? Math.min(0.5, Math.max(0, minimumWeight))
    : DEFAULT_MINIMUM_WEIGHT;

  const healthByPair = new Map<string, Readonly<Record<string, number | null>>>();
  for (const client of clients) {
    for (const point of client.periods) {
      healthByPair.set(`${client.clientId}|${point.periodEnd}`, point.metricHealth);
    }
  }

  const churned = new Map<string, number[]>();
  const retained = new Map<string, number[]>();
  for (const weight of weights) {
    churned.set(weight.metricId, []);
    retained.set(weight.metricId, []);
  }
  for (const row of rows) {
    const metricHealth = healthByPair.get(`${row.clientId}|${row.periodEnd}`);
    if (metricHealth === undefined) continue;
    const bucket = row.churnedWithinWindow ? churned : retained;
    for (const weight of weights) {
      const value = metricHealth[weight.metricId];
      if (isFiniteNumber(value)) bucket.get(weight.metricId)?.push(value);
    }
  }

  const separations = weights.map((weight) => {
    const a = churned.get(weight.metricId) ?? [];
    const b = retained.get(weight.metricId) ?? [];
    const meanA = mean(a);
    const meanB = mean(b);
    if (meanA === null || meanB === null) return 0;
    const sdA = stdDev(a);
    const sdB = stdDev(b);
    const pooled =
      sdA === null && sdB === null
        ? null
        : Math.sqrt(
            ((sdA ?? 0) ** 2 * (a.length - 1) + (sdB ?? 0) ** 2 * (b.length - 1)) /
              Math.max(1, a.length + b.length - 2),
          );
    if (pooled === null || pooled <= 0) return 0;
    // Esperamos saúde MENOR em quem cancelou. Separação ao contrário não é sinal de saída.
    return Math.max(0, (meanB - meanA) / pooled);
  });

  const separationTotal = separations.reduce((acc, v) => acc + v, 0);
  // Sem separação nenhuma, a importância histórica repete os pesos atuais: o passado não opinou.
  const importance = normalizeWeights(
    separationTotal > 0 ? separations : weights.map((w) => w.weight),
  );
  const blended = weights.map((weight, index) => {
    const value = (1 - strength) * weight.weight + strength * (importance[index] ?? 0);
    return Math.max(floor, value);
  });
  const suggested = normalizeWeights(blended);

  return weights.map((weight, index) => {
    const a = churned.get(weight.metricId) ?? [];
    const b = retained.get(weight.metricId) ?? [];
    const meanA = mean(a);
    const meanB = mean(b);
    const suggestedWeight = suggested[index] ?? 0;
    return {
      metricId: weight.metricId,
      metricName: weight.metricName,
      currentWeight: round(weight.weight, 4),
      suggestedWeight,
      delta: round(suggestedWeight - weight.weight, 4),
      historicalImportance: importance[index] ?? 0,
      meanHealthChurned: meanA === null ? null : round(meanA, 2),
      meanHealthRetained: meanB === null ? null : round(meanB, 2),
      separation: round(separations[index] ?? 0, 4),
      sampleSizeChurned: a.length,
      sampleSizeRetained: b.length,
    };
  });
}

/** Reexecuta o backtest com os pesos propostos, para medir o impacto antes de aceitar (§33). */
export function weightsFromSuggestions(
  suggestions: readonly WeightSuggestion[],
): CalibrationWeight[] {
  return suggestions.map((s) => ({
    metricId: s.metricId,
    metricName: s.metricName,
    weight: s.suggestedWeight,
  }));
}
