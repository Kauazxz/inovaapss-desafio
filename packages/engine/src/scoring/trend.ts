import { DEFAULT_TREND_WINDOW_PERIODS, type MetricDirection } from '@inovaapss/shared';

import { EngineConfigError } from '../shared/errors.js';
import { isFiniteNumber, linearSlope, mean, round, toHealth } from '../shared/math.js';

import type { TrendConfig, TrendMethod, TrendResult } from './types.js';

/**
 * Entrada da tendência (§10). As séries vão do mais antigo para o mais recente e o último
 * elemento é o período atual. `null` = período sem dado.
 */
export interface TrendInput {
  /** Valores brutos por período. */
  series: readonly (number | null)[];
  /** `current_health` de cada período (mesmo alinhamento). Obrigatório para `basis: 'HEALTH'`. */
  healthSeries?: readonly (number | null)[];
  direction: MetricDirection;
  /** `current_health` do período atual: âncora do trend_health. */
  currentHealth: number | null;
  /** Baseline vindo da normalização (BASELINE_COMPARISON) quando a série não dá para inferir. */
  baseline?: number | null;
}

const RELATIVE_METHODS: ReadonlySet<TrendMethod> = new Set([
  'DELTA_PERCENT',
  'MOVING_AVERAGE',
  'BASELINE_COMPARISON',
]);

function defaultFullChange(method: TrendMethod, basis: 'RAW' | 'HEALTH'): number | null {
  if (RELATIVE_METHODS.has(method)) return 1; // −100 % → trend_health 0
  if (basis === 'HEALTH') return method === 'SLOPE' ? 50 : 100; // pontos (por período no SLOPE)
  return null; // RAW absoluto: obrigatório na configuração
}

function emptyResult(
  method: TrendMethod,
  basis: 'RAW' | 'HEALTH',
  window: number,
  periodsUsed: number,
  reason: string,
): TrendResult {
  return {
    health: null,
    method,
    basis,
    window,
    periodsUsed,
    firstValue: null,
    lastValue: null,
    change: null,
    changePercent: null,
    slope: null,
    movingAverage: null,
    baseline: null,
    improvement: null,
    reason,
  };
}

function relativeChange(change: number, reference: number): number | null {
  if (reference === 0) return null;
  return change / Math.abs(reference);
}

/**
 * Calcula a tendência de uma métrica (§10): delta absoluto, delta percentual, média móvel,
 * slope (regressão linear simples) ou comparação com baseline, sempre orientados pela direção.
 *
 * `trend_health` é ancorado no `current_health`: estável → igual ao atual; piorando → abaixo;
 * melhorando → acima (até 100). Assim um cliente saudável e estável continua em 100 e um cliente
 * crítico e estável continua crítico. A escala é `fullDeteriorationChange`: a mudança adversa que
 * derruba 100 pontos.
 *
 * `null` quando o histórico é insuficiente (menos de 2 períodos com dado na janela).
 */
export function computeTrend(input: TrendInput, config: TrendConfig = {}): TrendResult {
  const window = config.window ?? DEFAULT_TREND_WINDOW_PERIODS;
  if (!Number.isInteger(window) || window < 2) {
    throw new EngineConfigError('Tendência: a janela precisa ser um inteiro ≥ 2.');
  }
  const method: TrendMethod = config.method ?? 'DELTA_PERCENT';
  let basis: 'RAW' | 'HEALTH' = config.basis ?? 'RAW';
  if (input.direction === 'CUSTOM') basis = 'HEALTH';
  if (input.direction === 'TARGET_RANGE' && basis === 'RAW') {
    const target = config.target ?? input.baseline ?? null;
    if (target === null) basis = 'HEALTH';
  }

  const source = basis === 'HEALTH' ? (input.healthSeries ?? []) : input.series;
  const windowed = source.slice(-window);
  const values = windowed.filter(isFiniteNumber);
  const periodsUsed = values.length;

  if (periodsUsed < 2) {
    return emptyResult(
      method,
      basis,
      window,
      periodsUsed,
      `Histórico insuficiente para tendência (${periodsUsed} de ${window} períodos com dado).`,
    );
  }
  if (input.currentHealth === null) {
    return emptyResult(
      method,
      basis,
      window,
      periodsUsed,
      'Sem current_health no período atual: tendência não ancorável.',
    );
  }

  const fullChange = config.fullDeteriorationChange ?? defaultFullChange(method, basis);
  if (!isFiniteNumber(fullChange) || fullChange <= 0) {
    throw new EngineConfigError(
      `Tendência: o método ${method} sobre valores brutos exige fullDeteriorationChange > 0.`,
    );
  }

  const first = values[0] as number;
  const last = values[values.length - 1] as number;
  const slope = linearSlope(values);
  const movingAverage = mean(values) as number;

  // Baseline para BASELINE_COMPARISON: períodos anteriores à janela (até baselineWindow) ou o
  // baseline informado pela normalização.
  let baseline: number | null = null;
  if (method === 'BASELINE_COMPARISON') {
    const before = source.slice(0, Math.max(0, source.length - window)).filter(isFiniteNumber);
    const baselineWindow = config.baselineWindow ?? 6;
    const tail = before.slice(-baselineWindow);
    baseline = tail.length > 0 ? (mean(tail) as number) : (input.baseline ?? null);
    if (baseline === null) {
      return {
        ...emptyResult(method, basis, window, periodsUsed, 'Sem baseline para comparar.'),
        firstValue: first,
        lastValue: last,
        slope,
        movingAverage: round(movingAverage, 4),
      };
    }
  }

  // Mudança bruta e referência, conforme o método (positivo = valor subiu).
  let change: number;
  let reference: number;
  switch (method) {
    case 'DELTA_ABSOLUTE':
    case 'DELTA_PERCENT':
      change = last - first;
      reference = first;
      break;
    case 'MOVING_AVERAGE':
      change = last - movingAverage;
      reference = movingAverage;
      break;
    case 'SLOPE':
      change = slope as number;
      reference = first;
      break;
    case 'BASELINE_COMPARISON':
      change = last - (baseline as number);
      reference = baseline as number;
      break;
    default:
      throw new EngineConfigError(`Tendência: método desconhecido ${String(method)}.`);
  }

  const changePercent = relativeChange(change, reference);
  const target = config.target ?? input.baseline ?? null;

  // Mudança orientada: > 0 melhorou, < 0 piorou, na unidade do método.
  let orientedChange: number | null;
  const isRelative = RELATIVE_METHODS.has(method);
  if (basis === 'HEALTH' || input.direction === 'HIGHER_IS_BETTER') {
    orientedChange = isRelative ? changePercent : change;
  } else if (input.direction === 'HIGHER_IS_WORSE') {
    orientedChange = isRelative ? (changePercent === null ? null : -changePercent) : -change;
  } else {
    // TARGET_RANGE sobre valores brutos: melhorou se chegou mais perto da meta.
    const t = target as number;
    const distanceChange = Math.abs(first - t) - Math.abs(last - t);
    orientedChange = isRelative ? relativeChange(distanceChange, t) : distanceChange;
  }

  let improvement: number;
  if (orientedChange === null) {
    // Referência zero: qualquer mudança é "total" na direção em que aconteceu.
    const wentUp = change > 0;
    const isBetter =
      basis === 'HEALTH' || input.direction === 'HIGHER_IS_BETTER' ? wentUp : !wentUp;
    improvement = change === 0 ? 0 : isBetter ? fullChange : -fullChange;
  } else {
    improvement = orientedChange;
  }

  const health = toHealth(input.currentHealth + (100 * improvement) / fullChange);

  return {
    health,
    method,
    basis,
    window,
    periodsUsed,
    firstValue: first,
    lastValue: last,
    change: round(change, 4),
    changePercent: changePercent === null ? null : round(changePercent * 100, 2),
    slope: slope === null ? null : round(slope, 4),
    movingAverage: round(movingAverage, 4),
    baseline: baseline === null ? null : round(baseline, 4),
    improvement: round(improvement, 4),
    reason: orientedChange === null ? 'Referência zero: mudança relativa indefinida.' : null,
  };
}
