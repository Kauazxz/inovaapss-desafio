import { z } from 'zod';

import {
  HEALTH_CLASSES,
  METRIC_DIRECTIONS,
  METRIC_SOURCES,
  METRIC_TYPES,
  NORMALIZATION_STRATEGIES,
  ORGANIZATION_ROLES,
  PRIORITY_CLASSES,
  TICKET_STATUSES,
} from '@inovaapss/shared';

// Enums de domínio (docs/SPEC.md) como schemas Zod, para validar entrada da API e filtros.
export const healthClassSchema = z.enum(HEALTH_CLASSES);
export const priorityClassSchema = z.enum(PRIORITY_CLASSES);
export const metricTypeSchema = z.enum(METRIC_TYPES);
export const metricDirectionSchema = z.enum(METRIC_DIRECTIONS);
export const metricSourceSchema = z.enum(METRIC_SOURCES);
export const normalizationStrategySchema = z.enum(NORMALIZATION_STRATEGIES);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const organizationRoleSchema = z.enum(ORGANIZATION_ROLES);

/** Score na escala oficial 0–100 (§7). */
export const scoreSchema = z.number().min(0).max(100);

/** Peso como fração 0–1 (§12: os pesos ativos de um modelo somam 1). */
export const weightSchema = z.number().min(0).max(1);
