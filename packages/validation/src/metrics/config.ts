/**
 * Schemas Zod dos JSONs de configuração de um item do modelo (§36 metric_model_items),
 * espelhando os tipos de `@inovaapss/engine` (`packages/engine/src/scoring/types.ts`):
 *
 *   normalization_config_json     → NormalizationConfig (uma variante por estratégia, §9)
 *   threshold_config_json         → { trend?: TrendConfig, persistence?: PersistenceConfig } (§10, §11)
 *   critical_trigger_config_json  → TriggerConfig[] (§27)
 *   formula_config_json           → { explanationTemplate?, params?, rule? } (§29; regra JSON Logic)
 *
 * Toda regra JSON Logic passa por `isSafeRule` do motor: operador fora da allowlist é recusado
 * aqui, antes de chegar ao banco (§2, §9, §45 — nunca `eval`). `.exactOptional()` mantém os
 * tipos inferidos idênticos aos do motor (o monorepo usa `exactOptionalPropertyTypes`).
 */
import { z } from 'zod';

import { isSafeRule } from '@inovaapss/engine';
import type {
  BaselineDeviationConfig,
  BooleanMapConfig,
  CustomSafeRuleConfig,
  JsonLogicRule,
  JsonLogicTrigger,
  LinearRangeConfig,
  NormalizationConfig,
  PersistenceConfig,
  RatioToTargetConfig,
  ScoreMapConfig,
  StreakTrigger,
  ThresholdBandsConfig,
  ThresholdTrigger,
  TrendConfig,
  TriggerConfig,
} from '@inovaapss/engine';

import { scoreSchema } from '../domain.js';

// ---------------------------------------------------------------------------
// JSON Logic seguro
// ---------------------------------------------------------------------------

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/** Regra JSON Logic serializável e aceita por `isSafeRule` (allowlist de operadores do motor). */
export const safeRuleSchema: z.ZodType<JsonLogicRule> = jsonValueSchema.refine(
  (rule) => isSafeRule(rule as JsonLogicRule),
  {
    message:
      'Regra recusada: use apenas operadores JSON Logic permitidos (var, if, comparações, aritmética, min/max, map/filter/reduce, in, cat, substr) e no máximo 500 nós.',
  },
);

/** Parâmetros livres disponíveis em `params.*` dentro de uma regra. */
export const ruleParamsSchema = z.record(
  z.string().min(1),
  z.union([z.number(), z.string(), z.boolean(), z.null()]),
);

// ---------------------------------------------------------------------------
// Normalização (§9)
// ---------------------------------------------------------------------------

const finite = z.number().finite();
const positive = z.number().finite().positive();

export const thresholdBandSchema = z.object({
  upTo: z.union([finite, z.null()]),
  health: scoreSchema,
});

export const thresholdBandsConfigSchema = z
  .object({
    strategy: z.literal('THRESHOLD_BANDS'),
    bands: z
      .array(thresholdBandSchema)
      .min(1, 'Informe ao menos uma faixa.')
      .refine((bands) => bands[bands.length - 1]?.upTo === null, {
        message: 'A última faixa precisa ter upTo = null (recebe tudo o que sobrar).',
      })
      .refine(
        (bands) => {
          const limits = bands.filter((b) => b.upTo !== null).map((b) => b.upTo as number);
          return limits.every((limit, index) => index === 0 || limit > (limits[index - 1] ?? 0));
        },
        { message: 'As faixas precisam estar em ordem crescente de upTo.' },
      ),
  })
  .strict() satisfies z.ZodType<ThresholdBandsConfig>;

export const linearRangeConfigSchema = z
  .object({
    strategy: z.literal('LINEAR_RANGE'),
    min: finite,
    max: finite,
    target: z.object({ min: finite, max: finite }).strict().exactOptional(),
  })
  .strict()
  .refine((config) => config.min < config.max, {
    message: 'Em LINEAR_RANGE, min precisa ser menor que max.',
    path: ['max'],
  })
  .refine((config) => config.target === undefined || config.target.min <= config.target.max, {
    message: 'Na faixa-alvo, min precisa ser menor ou igual a max.',
    path: ['target'],
  }) satisfies z.ZodType<LinearRangeConfig>;

export const ratioToTargetConfigSchema = z
  .object({
    strategy: z.literal('RATIO_TO_TARGET'),
    target: finite.refine((value) => value !== 0, 'A meta não pode ser zero.'),
    zeroAtRatio: positive.exactOptional(),
    tolerance: z.number().finite().min(0).exactOptional(),
    zeroAtDeviation: positive.exactOptional(),
  })
  .strict() satisfies z.ZodType<RatioToTargetConfig>;

export const baselineDeviationConfigSchema = z
  .object({
    strategy: z.literal('BASELINE_DEVIATION'),
    window: z.number().int().min(1).exactOptional(),
    minHistory: z.number().int().min(1).exactOptional(),
    method: z.enum(['auto', 'mean', 'median']).exactOptional(),
    outlierFactor: positive.exactOptional(),
    tolerancePct: z.number().finite().min(0).exactOptional(),
    maxDeviationPct: positive.exactOptional(),
    absolute: thresholdBandsConfigSchema.exactOptional(),
    combine: z.enum(['worst', 'average']).exactOptional(),
  })
  .strict() satisfies z.ZodType<BaselineDeviationConfig>;

export const booleanMapConfigSchema = z
  .object({
    strategy: z.literal('BOOLEAN_MAP'),
    trueHealth: scoreSchema.exactOptional(),
    falseHealth: scoreSchema.exactOptional(),
  })
  .strict() satisfies z.ZodType<BooleanMapConfig>;

export const scoreMapConfigSchema = z
  .object({
    strategy: z.literal('SCORE_MAP'),
    map: z
      .record(z.string().min(1), scoreSchema)
      .refine((map) => Object.keys(map).length > 0, 'Informe ao menos uma categoria no mapa.'),
    defaultHealth: scoreSchema.exactOptional(),
  })
  .strict() satisfies z.ZodType<ScoreMapConfig>;

/** Estratégias "diretas" — as que podem aparecer em `then` de uma regra segura. */
export const basicNormalizationConfigSchema = z.discriminatedUnion('strategy', [
  thresholdBandsConfigSchema,
  linearRangeConfigSchema,
  ratioToTargetConfigSchema,
  baselineDeviationConfigSchema,
  booleanMapConfigSchema,
  scoreMapConfigSchema,
]) satisfies z.ZodType<Exclude<NormalizationConfig, CustomSafeRuleConfig>>;

export const customSafeRuleConfigSchema = z
  .object({
    strategy: z.literal('CUSTOM_SAFE_RULE'),
    rule: safeRuleSchema,
    output: z.enum(['health', 'value']).exactOptional(),
    then: basicNormalizationConfigSchema.exactOptional(),
    params: ruleParamsSchema.exactOptional(),
  })
  .strict()
  .refine((config) => config.output !== 'value' || config.then !== undefined, {
    message: 'Com output = "value" é preciso informar a normalização seguinte em "then".',
    path: ['then'],
  }) satisfies z.ZodType<CustomSafeRuleConfig>;

/** `normalization_config_json` — uma variante por estratégia (§9). */
export const normalizationConfigSchema = z.discriminatedUnion('strategy', [
  thresholdBandsConfigSchema,
  linearRangeConfigSchema,
  ratioToTargetConfigSchema,
  baselineDeviationConfigSchema,
  booleanMapConfigSchema,
  scoreMapConfigSchema,
  customSafeRuleConfigSchema,
]) satisfies z.ZodType<NormalizationConfig>;
export type NormalizationConfigInput = z.infer<typeof normalizationConfigSchema>;

// ---------------------------------------------------------------------------
// Tendência (§10) e persistência (§11) — threshold_config_json
// ---------------------------------------------------------------------------

export const trendConfigSchema = z
  .object({
    window: z.number().int().min(2, 'A janela de tendência precisa ser ≥ 2.').exactOptional(),
    method: z
      .enum(['DELTA_ABSOLUTE', 'DELTA_PERCENT', 'MOVING_AVERAGE', 'SLOPE', 'BASELINE_COMPARISON'])
      .exactOptional(),
    fullDeteriorationChange: positive.exactOptional(),
    basis: z.enum(['RAW', 'HEALTH']).exactOptional(),
    baselineWindow: z.number().int().min(1).exactOptional(),
    target: finite.exactOptional(),
  })
  .strict() satisfies z.ZodType<TrendConfig>;

export const persistenceConfigSchema = z
  .object({
    window: z.number().int().min(1, 'A janela de persistência precisa ser ≥ 1.').exactOptional(),
    unhealthyBelow: scoreSchema.exactOptional(),
    minEvaluatedPeriods: z.number().int().min(1).exactOptional(),
  })
  .strict() satisfies z.ZodType<PersistenceConfig>;

/** `threshold_config_json`: janelas e métodos de tendência/persistência (METRICS_ENGINE.md §7). */
export const thresholdConfigSchema = z
  .object({
    trend: trendConfigSchema.exactOptional(),
    persistence: persistenceConfigSchema.exactOptional(),
  })
  .strict();
export type ThresholdConfigInput = z.infer<typeof thresholdConfigSchema>;

// ---------------------------------------------------------------------------
// Gatilhos críticos (§27) — critical_trigger_config_json
// ---------------------------------------------------------------------------

const comparisonOperatorSchema = z.enum(['>', '>=', '<', '<=', '==', '!=']);

const triggerBase = {
  id: z.string().trim().min(1, 'Informe o id do gatilho.').max(64),
  name: z.string().trim().min(1, 'Informe o nome do gatilho.').max(120),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).exactOptional(),
  priorityFloor: scoreSchema.exactOptional(),
  message: z.string().trim().max(500).exactOptional(),
  isActive: z.boolean().exactOptional(),
};

const thresholdFieldSchema = z
  .string()
  .refine(
    (field): field is ThresholdTrigger['field'] =>
      field === 'value' || field === 'health' || /^extra\.[A-Za-z0-9_]+$/.test(field),
    'O campo precisa ser "value", "health" ou "extra.<campo>".',
  );

export const thresholdTriggerSchema = z
  .object({
    ...triggerBase,
    kind: z.literal('THRESHOLD'),
    field: thresholdFieldSchema,
    operator: comparisonOperatorSchema,
    threshold: finite,
  })
  .strict() satisfies z.ZodType<ThresholdTrigger>;

export const streakTriggerSchema = z
  .object({
    ...triggerBase,
    kind: z.literal('STREAK'),
    operator: comparisonOperatorSchema,
    threshold: finite,
    consecutivePeriods: z.number().int().min(1),
  })
  .strict() satisfies z.ZodType<StreakTrigger>;

export const jsonLogicTriggerSchema = z
  .object({
    ...triggerBase,
    kind: z.literal('JSON_LOGIC'),
    rule: safeRuleSchema,
  })
  .strict() satisfies z.ZodType<JsonLogicTrigger>;

export const triggerConfigSchema = z.discriminatedUnion('kind', [
  thresholdTriggerSchema,
  streakTriggerSchema,
  jsonLogicTriggerSchema,
]) satisfies z.ZodType<TriggerConfig>;

/** `critical_trigger_config_json`: lista de gatilhos com ids únicos. */
export const triggerListSchema = z
  .array(triggerConfigSchema)
  .max(50, 'No máximo 50 gatilhos por métrica.')
  .refine((list) => new Set(list.map((t) => t.id)).size === list.length, {
    message: 'Os ids dos gatilhos precisam ser únicos.',
  });
export type TriggerListInput = z.infer<typeof triggerListSchema>;

// ---------------------------------------------------------------------------
// Fórmula e explicação — formula_config_json
// ---------------------------------------------------------------------------

/**
 * `formula_config_json`: modelo da explicação humana (§29), parâmetros de regra e, quando a
 * métrica é DERIVED, a regra JSON Logic segura que produz o valor bruto (§9 — nunca `eval`).
 */
export const formulaConfigSchema = z
  .object({
    explanationTemplate: z.string().trim().min(1).max(500).exactOptional(),
    params: ruleParamsSchema.exactOptional(),
    rule: safeRuleSchema.exactOptional(),
  })
  .strict();
export type FormulaConfigInput = z.infer<typeof formulaConfigSchema>;
