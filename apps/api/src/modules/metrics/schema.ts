/**
 * Schemas Zod das rotas de métricas (§37). Todos vêm de @inovaapss/validation — os mesmos que
 * o front usa nos formulários — e são só reexportados aqui para o controller.
 */
import { uuidSchema } from '@inovaapss/validation';

export {
  activateMetricModelVersionSchema,
  createMetricDefinitionSchema,
  createMetricModelSchema,
  createMetricModelVersionSchema,
  listMetricDefinitionsQuerySchema,
  listMetricModelsQuerySchema,
  previewScoreSchema,
  rebalanceMetricModelSchema,
  updateMetricDefinitionSchema,
  updateMetricModelVersionSchema,
  versionNumberParamSchema,
} from '@inovaapss/validation';

/** `:id` das rotas. */
export const idParamSchema = uuidSchema;
