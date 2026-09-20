/** Schemas de metric_models, metric_model_versions e metric_model_items (§31, §36, §37). */
import { z } from 'zod';

import { DEFAULT_COMPONENT_WEIGHTS, WEIGHT_MODES } from '@inovaapss/shared';

import { paginationQuerySchema, uuidSchema } from '../common.js';
import {
  formulaConfigSchema,
  normalizationConfigSchema,
  thresholdConfigSchema,
  triggerListSchema,
} from './config.js';
import { componentWeightSchema, modelWeightSchema } from './weights.js';

export const weightModeSchema = z.enum(WEIGHT_MODES);

export const metricModelNameSchema = z
  .string()
  .trim()
  .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
  .max(120, 'O nome pode ter no máximo 120 caracteres.');

export const createMetricModelSchema = z.object({
  name: metricModelNameSchema,
  /** §32 — para o hackathon, ASSISTED. */
  mode: weightModeSchema.default('ASSISTED'),
  isActive: z.boolean().default(true),
});
export type CreateMetricModelBody = z.infer<typeof createMetricModelSchema>;

export const listMetricModelsQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  is_active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type ListMetricModelsQuery = z.infer<typeof listMetricModelsQuerySchema>;

/**
 * Um item de configuração (§36 metric_model_items) como chega no corpo da requisição.
 * `normalization` carrega a estratégia; a API grava `normalization_strategy` a partir dela.
 */
export const metricModelItemInputSchema = z
  .object({
    metricDefinitionId: uuidSchema,
    weight: modelWeightSchema,
    currentWeight: componentWeightSchema.default(DEFAULT_COMPONENT_WEIGHTS.current),
    trendWeight: componentWeightSchema.default(DEFAULT_COMPONENT_WEIGHTS.trend),
    persistenceWeight: componentWeightSchema.default(DEFAULT_COMPONENT_WEIGHTS.persistence),
    normalization: normalizationConfigSchema,
    thresholds: thresholdConfigSchema.nullable().default(null),
    triggers: triggerListSchema.nullable().default(null),
    formula: formulaConfigSchema.nullable().default(null),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((item) => item.currentWeight + item.trendWeight + item.persistenceWeight > 0, {
    message: 'Os pesos dos componentes (atual, tendência, persistência) não podem somar zero.',
    path: ['currentWeight'],
  });
export type MetricModelItemInput = z.input<typeof metricModelItemInputSchema>;
export type MetricModelItemBody = z.infer<typeof metricModelItemInputSchema>;

export const metricModelItemListSchema = z
  .array(metricModelItemInputSchema)
  .max(200, 'No máximo 200 métricas por versão.')
  .refine((items) => new Set(items.map((i) => i.metricDefinitionId)).size === items.length, {
    message: 'Cada métrica só pode aparecer uma vez na versão.',
  });

const effectiveFromSchema = z.iso.datetime({ offset: true }).nullable();

/** POST /metric-models/:id/versions — rascunho a partir da versão ativa (sem `items`) ou dos itens. */
export const createMetricModelVersionSchema = z.object({
  items: metricModelItemListSchema.optional(),
  effectiveFrom: effectiveFromSchema.optional(),
});
export type CreateMetricModelVersionBody = z.infer<typeof createMetricModelVersionSchema>;

/** PATCH /metric-models/:id/versions/:version — só rascunho; `items` substitui a lista inteira. */
export const updateMetricModelVersionSchema = z
  .object({
    items: metricModelItemListSchema.optional(),
    effectiveFrom: effectiveFromSchema.optional(),
  })
  .refine((body) => body.items !== undefined || body.effectiveFrom !== undefined, {
    message: 'Informe items e/ou effectiveFrom.',
  });
export type UpdateMetricModelVersionBody = z.infer<typeof updateMetricModelVersionSchema>;

export const activateMetricModelVersionSchema = z.object({
  effectiveFrom: effectiveFromSchema.optional(),
});
export type ActivateMetricModelVersionBody = z.infer<typeof activateMetricModelVersionSchema>;

/**
 * POST /metric-models/:id/rebalance — proposta a partir dos itens do corpo ou de uma versão
 * (`version`; sem nada, usa o rascunho mais recente ou a versão ativa).
 */
export const rebalanceMetricModelSchema = z
  .object({
    version: z.number().int().min(1).optional(),
    items: z
      .array(z.object({ metricDefinitionId: uuidSchema, weight: modelWeightSchema }))
      .min(1)
      .optional(),
  })
  .refine((body) => !(body.version !== undefined && body.items !== undefined), {
    message: 'Informe version ou items, não os dois.',
  });
export type RebalanceMetricModelBody = z.infer<typeof rebalanceMetricModelSchema>;

export const versionNumberParamSchema = z.coerce.number().int().min(1, 'Versão inválida.');

// ---------------------------------------------------------------------------
// POST /metrics/:id/preview-score (§37, §41 "Simular")
// ---------------------------------------------------------------------------

export const periodValueInputSchema = z.object({
  /** ISO 8601 (data ou data-hora). */
  periodEnd: z.string().trim().min(4).max(40),
  value: z.number().finite().nullable(),
  text: z.string().trim().max(120).nullable().optional(),
});

/**
 * Configuração de um item sem o vínculo com a definição (a rota já diz qual é), mais a série
 * de exemplo e os campos extras dos gatilhos.
 */
export const previewScoreSchema = z.object({
  item: z.object({
    weight: modelWeightSchema.default(1),
    currentWeight: componentWeightSchema.default(DEFAULT_COMPONENT_WEIGHTS.current),
    trendWeight: componentWeightSchema.default(DEFAULT_COMPONENT_WEIGHTS.trend),
    persistenceWeight: componentWeightSchema.default(DEFAULT_COMPONENT_WEIGHTS.persistence),
    normalization: normalizationConfigSchema,
    thresholds: thresholdConfigSchema.nullable().default(null),
    triggers: triggerListSchema.nullable().default(null),
    formula: formulaConfigSchema.nullable().default(null),
  }),
  series: z
    .array(periodValueInputSchema)
    .min(1, 'Informe ao menos um período.')
    .max(120, 'No máximo 120 períodos.'),
  extra: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
  /** Nome do período nos textos ("mês", "semana"). */
  periodLabel: z.string().trim().min(1).max(20).optional(),
});
export type PreviewScoreInput = z.input<typeof previewScoreSchema>;
export type PreviewScoreBody = z.infer<typeof previewScoreSchema>;
