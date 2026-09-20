/**
 * Uma execução de calibração: mede os pesos de hoje, propõe pesos melhores e mede a proposta.
 *
 * Os dois backtests usam a mesma janela e o mesmo limiar de alerta — sem isso a comparação
 * "antes × depois" seria entre réguas diferentes.
 */
import { resolveBacktestOptions, runBacktest } from './backtest.js';
import {
  DEFAULT_MINIMUM_WEIGHT,
  DEFAULT_SUGGESTION_STRENGTH,
  suggestWeights,
  weightsFromSuggestions,
} from './weights.js';
import { isFiniteNumber } from '../shared/math.js';

import type {
  CalibrationClientSeries,
  CalibrationResult,
  CalibrationWeight,
  SuggestionOptions,
} from './types.js';

export interface RunCalibrationInput {
  clients: readonly CalibrationClientSeries[];
  weights: readonly CalibrationWeight[];
  options?: SuggestionOptions;
}

export function runCalibration({
  clients,
  weights,
  options = {},
}: RunCalibrationInput): CalibrationResult {
  const resolved = resolveBacktestOptions(options);
  const suggestionStrength = isFiniteNumber(options.suggestionStrength)
    ? Math.min(1, Math.max(0, options.suggestionStrength))
    : DEFAULT_SUGGESTION_STRENGTH;
  const minimumWeight = isFiniteNumber(options.minimumWeight)
    ? Math.min(0.5, Math.max(0, options.minimumWeight))
    : DEFAULT_MINIMUM_WEIGHT;

  const baseline = runBacktest({ clients, weights, options: resolved });
  const suggestions = suggestWeights({
    clients,
    weights,
    rows: baseline.rows,
    suggestionStrength,
    minimumWeight,
  });
  const proposed = runBacktest({
    clients,
    weights: weightsFromSuggestions(suggestions),
    options: resolved,
  });

  return {
    parameters: {
      windowDays: resolved.windowDays,
      periodDays: resolved.periodDays,
      windowPeriods: resolved.windowPeriods,
      alertRiskThreshold: resolved.alertRiskThreshold,
      suggestionStrength,
      minimumWeight,
      topN: resolved.topN,
    },
    baseline,
    proposed,
    suggestions,
  };
}
