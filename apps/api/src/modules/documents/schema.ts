/**
 * Schemas Zod das rotas de documentos (§37). Os schemas de negócio moram em
 * @inovaapss/validation (documents/), os mesmos que o web usa no formulário de sugestão.
 */
import { z } from 'zod';

import {
  createMetricSuggestionSchema,
  documentIdParamsSchema,
  documentListQuerySchema,
  uuidSchema,
} from '@inovaapss/validation';

export { createMetricSuggestionSchema, documentIdParamsSchema, documentListQuerySchema };

export const suggestionIdParamsSchema = z.object({ id: uuidSchema });

export type CreateMetricSuggestionBody = z.infer<typeof createMetricSuggestionSchema>;
