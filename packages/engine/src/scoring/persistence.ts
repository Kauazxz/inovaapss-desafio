import { DEFAULT_PERSISTENCE_WINDOW_PERIODS } from '@inovaapss/shared';

import { EngineConfigError } from '../shared/errors.js';
import { isFiniteNumber, round } from '../shared/math.js';

import type { PersistenceConfig, PersistenceResult } from './types.js';

/**
 * Persistência (§11): quantos dos últimos `window` períodos estiveram "não saudáveis".
 *
 *   persistence_health = 100 × (1 − unhealthy_periods / evaluated_periods)
 *
 * "Não saudável" = `current_health` do período abaixo de `unhealthyBelow` (padrão 60, ou seja,
 * Risco ou Crítico nas faixas padrão). Períodos sem health não contam como avaliados — dado
 * ausente não é nem saudável nem doente. `null` com menos de `minEvaluatedPeriods` avaliados.
 */
export function computePersistence(
  healthSeries: readonly (number | null)[],
  config: PersistenceConfig = {},
): PersistenceResult {
  const window = config.window ?? DEFAULT_PERSISTENCE_WINDOW_PERIODS;
  const unhealthyBelow = config.unhealthyBelow ?? 60;
  const minEvaluated = config.minEvaluatedPeriods ?? 2;
  if (!Number.isInteger(window) || window < 1) {
    throw new EngineConfigError('Persistência: a janela precisa ser um inteiro ≥ 1.');
  }
  if (!isFiniteNumber(unhealthyBelow) || unhealthyBelow < 0 || unhealthyBelow > 100) {
    throw new EngineConfigError('Persistência: unhealthyBelow deve estar entre 0 e 100.');
  }

  const windowed = healthSeries.slice(-window);
  const evaluated = windowed.filter(isFiniteNumber);
  const unhealthy = evaluated.filter((h) => h < unhealthyBelow);

  let streak = 0;
  for (let i = windowed.length - 1; i >= 0; i -= 1) {
    const h = windowed[i];
    if (!isFiniteNumber(h) || h >= unhealthyBelow) break;
    streak += 1;
  }

  if (evaluated.length < minEvaluated) {
    return {
      health: null,
      window,
      evaluatedPeriods: evaluated.length,
      unhealthyPeriods: unhealthy.length,
      currentUnhealthyStreak: streak,
      reason: `Histórico insuficiente para persistência (${evaluated.length} de ${window} períodos avaliáveis).`,
    };
  }

  return {
    health: round(100 * (1 - unhealthy.length / evaluated.length), 2),
    window,
    evaluatedPeriods: evaluated.length,
    unhealthyPeriods: unhealthy.length,
    currentUnhealthyStreak: streak,
    reason: null,
  };
}
