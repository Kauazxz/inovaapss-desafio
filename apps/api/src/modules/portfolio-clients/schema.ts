/**
 * Schemas Zod das rotas de clientes (§37 Clients). Os schemas vêm de @inovaapss/validation —
 * os mesmos que o web usa no formulário — e aqui só ganham o parâmetro de rota.
 */
import { z } from 'zod';

import {
  createPortfolioClientSchema,
  listPortfolioClientsQuerySchema,
  updatePortfolioClientSchema,
  uuidSchema,
} from '@inovaapss/validation';

export const clientIdParamsSchema = z.object({ id: uuidSchema });

export {
  createPortfolioClientSchema,
  listPortfolioClientsQuerySchema,
  updatePortfolioClientSchema,
};
