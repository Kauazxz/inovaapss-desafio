/** Schemas de metric_definitions (§36) para POST/PATCH/GET /metrics (§37). */
import { z } from 'zod';

import { METRIC_PERIODICITIES } from '@inovaapss/shared';

import { paginationQuerySchema } from '../common.js';
import { metricDirectionSchema, metricSourceSchema, metricTypeSchema } from '../domain.js';

export const metricPeriodicitySchema = z.enum(METRIC_PERIODICITIES);

export const metricNameSchema = z
  .string()
  .trim()
  .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
  .max(120, 'O nome pode ter no máximo 120 caracteres.');

/** Slug de métrica: como o da organização, mas aceita `_` (chaves do preset, ex.: `sla_compliance`). */
export const metricSlugSchema = z
  .string()
  .trim()
  .min(2, 'A chave precisa ter pelo menos 2 caracteres.')
  .max(64, 'A chave pode ter no máximo 64 caracteres.')
  .regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
    'Use apenas letras minúsculas, números, hífens e sublinhados.',
  );

const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const createMetricDefinitionSchema = z.object({
  name: metricNameSchema,
  slug: metricSlugSchema,
  description: nullableText(1000).default(null),
  category: nullableText(80).default(null),
  metricType: metricTypeSchema,
  unit: nullableText(20).default(null),
  direction: metricDirectionSchema,
  periodicity: metricPeriodicitySchema.default('MONTHLY'),
  sourceType: metricSourceSchema.default('MANUAL'),
  isActive: z.boolean().default(true),
});
export type CreateMetricDefinitionInput = z.input<typeof createMetricDefinitionSchema>;
export type CreateMetricDefinitionBody = z.infer<typeof createMetricDefinitionSchema>;

export const updateMetricDefinitionSchema = z
  .object({
    name: metricNameSchema.optional(),
    slug: metricSlugSchema.optional(),
    description: nullableText(1000).optional(),
    category: nullableText(80).optional(),
    metricType: metricTypeSchema.optional(),
    unit: nullableText(20).optional(),
    direction: metricDirectionSchema.optional(),
    periodicity: metricPeriodicitySchema.optional(),
    sourceType: metricSourceSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateMetricDefinitionBody = z.infer<typeof updateMetricDefinitionSchema>;

const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const METRIC_DEFINITION_SORT_FIELDS = [
  'name',
  'slug',
  'metricType',
  'direction',
  'createdAt',
  'updatedAt',
] as const;
export type MetricDefinitionSortField = (typeof METRIC_DEFINITION_SORT_FIELDS)[number];

/** §61 — GET /metrics: paginação, busca (nome/slug) e filtros type/direction/source/is_active. */
export const listMetricDefinitionsQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(METRIC_DEFINITION_SORT_FIELDS).default('name'),
  type: metricTypeSchema.optional(),
  direction: metricDirectionSchema.optional(),
  source: metricSourceSchema.optional(),
  is_active: booleanQuery,
});
export type ListMetricDefinitionsQuery = z.infer<typeof listMetricDefinitionsQuerySchema>;
