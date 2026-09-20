/**
 * Schemas Zod das rotas de planos e contratos (§37 Contracts / Plans). Vêm de
 * @inovaapss/validation (os mesmos do web); aqui só ganham os parâmetros de rota.
 */
import { z } from 'zod';

import {
  createContractSchema,
  createPlanSchema,
  listContractsQuerySchema,
  updateContractSchema,
  updatePlanSchema,
  uuidSchema,
} from '@inovaapss/validation';

export const idParamsSchema = z.object({ id: uuidSchema });

export {
  createContractSchema,
  createPlanSchema,
  listContractsQuerySchema,
  updateContractSchema,
  updatePlanSchema,
};
