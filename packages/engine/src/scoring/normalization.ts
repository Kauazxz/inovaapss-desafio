import type { MetricDirection } from '@inovaapss/shared';

import { evaluateSafeRuleAsNumber } from './safe-rule.js';
import { EngineConfigError } from '../shared/errors.js';
import {
  detectOutliers,
  interpolate,
  isFiniteNumber,
  mean,
  median,
  round,
  toHealth,
} from '../shared/math.js';

import type {
  BaselineDeviationConfig,
  BooleanMapConfig,
  CustomSafeRuleConfig,
  LinearRangeConfig,
  NormalizationConfig,
  NormalizationResult,
  RatioToTargetConfig,
  RuleContext,
  ScoreMapConfig,
  ThresholdBandsConfig,
} from './types.js';

/**
 * Entrada da normalização (§9): o valor do período atual, o histórico anterior do próprio
 * cliente e a direção da métrica. Nada aqui depende de banco.
 */
export interface NormalizationInput {
  /** Valor bruto do período. `null` = não medido (vira N/A, nunca zero). */
  value: number | null;
  /** Valor textual (BOOLEAN_MAP, SCORE_MAP). */
  text?: string | null;
  /** Períodos anteriores ao atual, do mais antigo para o mais recente. `null` = período sem dado. */
  history?: readonly (number | null)[];
  direction: MetricDirection;
}

const NO_DATA_REASON = 'Sem dado no período: métrica não avaliada (N/A).';

function base(strategy: NormalizationConfig['strategy']): NormalizationResult {
  return { health: null, strategy, baseline: null, deviationPct: null, reason: null };
}

function notAvailable(strategy: NormalizationConfig['strategy'], reason: string) {
  return { ...base(strategy), reason };
}

// ---------------------------------------------------------------------------
// THRESHOLD_BANDS
// ---------------------------------------------------------------------------

/**
 * Faixas absolutas: a primeira faixa (em ordem crescente de `upTo`) que o valor não ultrapassa.
 * As faixas já carregam a direção (a organização escreve os healths na ordem certa); a última
 * (`upTo: null`) recebe tudo o que sobrar.
 */
export function normalizeThresholdBands(
  value: number,
  config: ThresholdBandsConfig,
): number | null {
  if (!Array.isArray(config.bands) || config.bands.length === 0) {
    throw new EngineConfigError('THRESHOLD_BANDS exige ao menos uma faixa.');
  }
  const ordered = [...config.bands].sort((a, b) => {
    if (a.upTo === null) return 1;
    if (b.upTo === null) return -1;
    return a.upTo - b.upTo;
  });
  const band = ordered.find((b) => b.upTo === null || value <= b.upTo);
  return band ? toHealth(band.health) : null;
}

// ---------------------------------------------------------------------------
// LINEAR_RANGE
// ---------------------------------------------------------------------------

/**
 * Interpolação linear entre `min` e `max`. HIGHER_IS_BETTER: min → 0, max → 100.
 * HIGHER_IS_WORSE: min → 100, max → 0. TARGET_RANGE: 100 dentro de `target`, caindo linearmente
 * até 0 nos extremos. CUSTOM: usa a configuração ao pé da letra (min → 0, max → 100).
 */
export function normalizeLinearRange(
  value: number,
  config: LinearRangeConfig,
  direction: MetricDirection,
): number | null {
  if (!isFiniteNumber(config.min) || !isFiniteNumber(config.max) || config.max <= config.min) {
    throw new EngineConfigError('LINEAR_RANGE exige min < max.');
  }
  switch (direction) {
    case 'HIGHER_IS_WORSE':
      return toHealth(interpolate(value, config.min, 100, config.max, 0));
    case 'TARGET_RANGE': {
      const target = config.target;
      if (!target || !isFiniteNumber(target.min) || !isFiniteNumber(target.max)) {
        throw new EngineConfigError('LINEAR_RANGE com TARGET_RANGE exige `target` {min, max}.');
      }
      if (value >= target.min && value <= target.max) return 100;
      if (value < target.min) return toHealth(interpolate(value, config.min, 0, target.min, 100));
      return toHealth(interpolate(value, target.max, 100, config.max, 0));
    }
    case 'HIGHER_IS_BETTER':
    case 'CUSTOM':
    default:
      return toHealth(interpolate(value, config.min, 0, config.max, 100));
  }
}

// ---------------------------------------------------------------------------
// RATIO_TO_TARGET
// ---------------------------------------------------------------------------

/**
 * Razão valor/meta. HIGHER_IS_BETTER: `ratio × 100` (meta batida = 100). HIGHER_IS_WORSE: 100 até a
 * meta, caindo a 0 em `zeroAtRatio × meta` (padrão o dobro). TARGET_RANGE (e CUSTOM): 100 dentro da
 * tolerância relativa, caindo a 0 em `zeroAtDeviation` (padrão 100 % de desvio).
 */
export function normalizeRatioToTarget(
  value: number,
  config: RatioToTargetConfig,
  direction: MetricDirection,
): { health: number | null; deviationPct: number | null } {
  if (!isFiniteNumber(config.target) || config.target === 0) {
    throw new EngineConfigError('RATIO_TO_TARGET exige uma meta diferente de zero.');
  }
  const ratio = value / config.target;
  const deviationPct = round((ratio - 1) * 100, 2);
  switch (direction) {
    case 'HIGHER_IS_BETTER':
      return { health: toHealth(ratio * 100), deviationPct };
    case 'HIGHER_IS_WORSE': {
      const zeroAt = config.zeroAtRatio ?? 2;
      if (zeroAt <= 1) throw new EngineConfigError('RATIO_TO_TARGET: zeroAtRatio deve ser > 1.');
      return { health: toHealth(interpolate(ratio, 1, 100, zeroAt, 0)), deviationPct };
    }
    case 'TARGET_RANGE':
    case 'CUSTOM':
    default: {
      const tolerance = config.tolerance ?? 0;
      const zeroAt = config.zeroAtDeviation ?? 1;
      if (zeroAt <= tolerance) {
        throw new EngineConfigError('RATIO_TO_TARGET: zeroAtDeviation deve ser > tolerance.');
      }
      const deviation = Math.abs(ratio - 1);
      return { health: toHealth(interpolate(deviation, tolerance, 100, zeroAt, 0)), deviationPct };
    }
  }
}

// ---------------------------------------------------------------------------
// BASELINE_DEVIATION
// ---------------------------------------------------------------------------

export interface BaselineInfo {
  baseline: number | null;
  method: 'mean' | 'median';
  hasOutliers: boolean;
  periodsUsed: number;
}

/**
 * Baseline do próprio cliente (§9, §13, §15, §19): média dos últimos `window` períodos, ou
 * mediana quando há outliers (método `auto`). `null` se o histórico não chega a `minHistory`.
 */
export function computeBaseline(
  history: readonly (number | null)[] | undefined,
  config: Pick<BaselineDeviationConfig, 'window' | 'minHistory' | 'method' | 'outlierFactor'> = {},
): BaselineInfo {
  const window = config.window ?? 6;
  const minHistory = config.minHistory ?? 2;
  const values = (history ?? []).filter(isFiniteNumber).slice(-window);
  if (values.length < minHistory || values.length === 0) {
    return { baseline: null, method: 'mean', hasOutliers: false, periodsUsed: values.length };
  }
  const outliers = detectOutliers(values, config.outlierFactor ?? 3);
  const hasOutliers = outliers.some(Boolean);
  const requested = config.method ?? 'auto';
  const method: 'mean' | 'median' =
    requested === 'auto' ? (hasOutliers ? 'median' : 'mean') : requested;
  const baseline = method === 'median' ? median(values) : mean(values);
  return { baseline, method, hasOutliers, periodsUsed: values.length };
}

/**
 * Desvio relativo (%) do valor em relação ao baseline. Baseline zero não tem desvio relativo:
 * devolve `null` e o chamador decide pelo sinal da diferença.
 */
export function deviationFromBaseline(value: number, baseline: number): number | null {
  if (baseline === 0) return null;
  return round(((value - baseline) / Math.abs(baseline)) * 100, 2);
}

function adverseDeviation(
  value: number,
  baseline: number,
  deviationPct: number | null,
  direction: MetricDirection,
): number {
  if (deviationPct === null) {
    // Baseline zero: qualquer diferença é "infinita" em termos relativos.
    if (value === baseline) return 0;
    const wentUp = value > baseline;
    if (direction === 'HIGHER_IS_BETTER') return wentUp ? 0 : Number.POSITIVE_INFINITY;
    if (direction === 'HIGHER_IS_WORSE') return wentUp ? Number.POSITIVE_INFINITY : 0;
    return Number.POSITIVE_INFINITY;
  }
  switch (direction) {
    case 'HIGHER_IS_BETTER':
      return Math.max(0, -deviationPct);
    case 'HIGHER_IS_WORSE':
      return Math.max(0, deviationPct);
    case 'TARGET_RANGE':
    case 'CUSTOM':
    default:
      return Math.abs(deviationPct);
  }
}

export function normalizeBaselineDeviation(
  input: NormalizationInput & { value: number },
  config: BaselineDeviationConfig,
): NormalizationResult {
  const tolerance = config.tolerancePct ?? 0;
  const maxDeviation = config.maxDeviationPct ?? 50;
  if (maxDeviation <= tolerance) {
    throw new EngineConfigError('BASELINE_DEVIATION: maxDeviationPct deve ser > tolerancePct.');
  }
  const info = computeBaseline(input.history, config);
  const absoluteHealth = config.absolute
    ? normalizeThresholdBands(input.value, config.absolute)
    : null;

  if (info.baseline === null) {
    const reason =
      info.periodsUsed === 0
        ? 'Sem histórico anterior para formar o baseline.'
        : `Histórico insuficiente para o baseline (${info.periodsUsed} de ${config.minHistory ?? 2} períodos).`;
    return {
      ...base('BASELINE_DEVIATION'),
      health: absoluteHealth,
      reason: absoluteHealth === null ? reason : `${reason} Avaliado só pelas faixas absolutas.`,
    };
  }

  const deviationPct = deviationFromBaseline(input.value, info.baseline);
  const adverse = adverseDeviation(input.value, info.baseline, deviationPct, input.direction);
  const deviationHealth = toHealth(interpolate(adverse, tolerance, 100, maxDeviation, 0));

  let health = deviationHealth;
  if (absoluteHealth !== null && deviationHealth !== null) {
    health =
      (config.combine ?? 'worst') === 'average'
        ? round((absoluteHealth + deviationHealth) / 2, 2)
        : Math.min(absoluteHealth, deviationHealth);
  }

  return {
    health,
    strategy: 'BASELINE_DEVIATION',
    baseline: round(info.baseline, 4),
    deviationPct,
    baselineMethod: info.method,
    hasOutliers: info.hasOutliers,
    reason:
      deviationPct === null
        ? 'Baseline zero: desvio relativo indefinido; avaliado pela direção da mudança.'
        : null,
  };
}

// ---------------------------------------------------------------------------
// BOOLEAN_MAP e SCORE_MAP
// ---------------------------------------------------------------------------

const TRUE_TEXTS = new Set(['true', '1', 'sim', 's', 'yes', 'y', 'verdadeiro']);
const FALSE_TEXTS = new Set(['false', '0', 'não', 'nao', 'n', 'no', 'falso']);

/** Interpreta número ou texto como booleano. `null` quando não dá para saber. */
export function parseBoolean(value: number | null, text?: string | null): boolean | null {
  if (typeof text === 'string' && text.trim() !== '') {
    const normalized = text.trim().toLowerCase();
    if (TRUE_TEXTS.has(normalized)) return true;
    if (FALSE_TEXTS.has(normalized)) return false;
    return null;
  }
  if (value === null) return null;
  return value !== 0;
}

export function normalizeBooleanMap(
  flag: boolean,
  config: BooleanMapConfig,
  direction: MetricDirection,
): number | null {
  let trueHealth = config.trueHealth;
  let falseHealth = config.falseHealth;
  if (trueHealth === undefined || falseHealth === undefined) {
    if (direction === 'HIGHER_IS_BETTER') {
      trueHealth ??= 100;
      falseHealth ??= 0;
    } else if (direction === 'HIGHER_IS_WORSE') {
      trueHealth ??= 0;
      falseHealth ??= 100;
    } else {
      throw new EngineConfigError(
        'BOOLEAN_MAP com direção TARGET_RANGE/CUSTOM exige trueHealth e falseHealth.',
      );
    }
  }
  return toHealth(flag ? trueHealth : falseHealth);
}

export function normalizeScoreMap(
  value: number | null,
  text: string | null | undefined,
  config: ScoreMapConfig,
): number | null {
  if (!config.map || Object.keys(config.map).length === 0) {
    throw new EngineConfigError('SCORE_MAP exige ao menos uma chave.');
  }
  const key = typeof text === 'string' && text.trim() !== '' ? text.trim() : String(value);
  const direct = config.map[key];
  if (direct !== undefined) return toHealth(direct);
  const lowered = Object.entries(config.map).find(([k]) => k.toLowerCase() === key.toLowerCase());
  if (lowered) return toHealth(lowered[1]);
  return config.defaultHealth === undefined ? null : toHealth(config.defaultHealth);
}

// ---------------------------------------------------------------------------
// CUSTOM_SAFE_RULE
// ---------------------------------------------------------------------------

/** Monta o contexto (só dados) que uma regra segura enxerga. */
export function buildRuleContext(
  input: NormalizationInput,
  params: Record<string, number | string | boolean | null> = {},
  extra?: Record<string, number | string | boolean | null>,
): RuleContext {
  const history = (input.history ?? []).filter(isFiniteNumber);
  const previous = history.length > 0 ? (history[history.length - 1] as number) : null;
  const ctx: RuleContext = {
    value: input.value,
    text: input.text ?? null,
    previous,
    baseline: computeBaseline(input.history).baseline,
    history,
    series: [...(input.history ?? []).map((v) => (isFiniteNumber(v) ? v : null)), input.value],
    params,
  };
  if (extra) ctx.extra = extra;
  return ctx;
}

export function normalizeCustomSafeRule(
  input: NormalizationInput,
  config: CustomSafeRuleConfig,
): NormalizationResult {
  const ctx = buildRuleContext(input, config.params ?? {});
  const result = evaluateSafeRuleAsNumber(config.rule, ctx);
  if (result === null) {
    return notAvailable('CUSTOM_SAFE_RULE', 'A regra não devolveu um número: N/A.');
  }
  if ((config.output ?? 'health') === 'health') {
    return { ...base('CUSTOM_SAFE_RULE'), health: toHealth(result), baseline: ctx.baseline };
  }
  if (!config.then) {
    throw new EngineConfigError('CUSTOM_SAFE_RULE com output "value" exige `then`.');
  }
  const inner = normalize({ ...input, value: result, text: null }, config.then);
  return { ...inner, strategy: 'CUSTOM_SAFE_RULE', reason: inner.reason };
}

// ---------------------------------------------------------------------------
// Ponto de entrada
// ---------------------------------------------------------------------------

/**
 * Converte o valor bruto em `current_health` 0–100 (100 = saudável) ou `null` (N/A).
 * Dado ausente nunca vira zero (§25, §66). Configuração inválida lança `EngineConfigError`;
 * a Etapa 3 valida a configuração ao salvar com esta mesma função.
 */
export function normalize(
  input: NormalizationInput,
  config: NormalizationConfig,
): NormalizationResult {
  const value = isFiniteNumber(input.value) ? input.value : null;
  const text = input.text ?? null;

  switch (config.strategy) {
    case 'BOOLEAN_MAP': {
      const flag = parseBoolean(value, text);
      if (flag === null) return notAvailable(config.strategy, NO_DATA_REASON);
      return {
        ...base(config.strategy),
        health: normalizeBooleanMap(flag, config, input.direction),
      };
    }
    case 'SCORE_MAP': {
      if (value === null && (text === null || text.trim() === '')) {
        return notAvailable(config.strategy, NO_DATA_REASON);
      }
      const health = normalizeScoreMap(value, text, config);
      return {
        ...base(config.strategy),
        health,
        reason: health === null ? 'Valor não mapeado no SCORE_MAP: N/A.' : null,
      };
    }
    case 'CUSTOM_SAFE_RULE':
      if (value === null && (text === null || text.trim() === '')) {
        return notAvailable(config.strategy, NO_DATA_REASON);
      }
      return normalizeCustomSafeRule({ ...input, value, text }, config);
    default:
      break;
  }

  if (value === null) return notAvailable(config.strategy, NO_DATA_REASON);

  switch (config.strategy) {
    case 'THRESHOLD_BANDS': {
      const health = normalizeThresholdBands(value, config);
      return {
        ...base(config.strategy),
        health,
        reason: health === null ? 'Valor fora de todas as faixas configuradas: N/A.' : null,
      };
    }
    case 'LINEAR_RANGE':
      return {
        ...base(config.strategy),
        health: normalizeLinearRange(value, config, input.direction),
      };
    case 'RATIO_TO_TARGET': {
      const { health, deviationPct } = normalizeRatioToTarget(value, config, input.direction);
      return { ...base(config.strategy), health, baseline: config.target, deviationPct };
    }
    case 'BASELINE_DEVIATION':
      return normalizeBaselineDeviation({ ...input, value }, config);
    default: {
      const unknown = (config as { strategy: string }).strategy;
      throw new EngineConfigError(`Estratégia de normalização desconhecida: ${unknown}.`);
    }
  }
}
