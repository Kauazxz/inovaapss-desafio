/**
 * Rotas de clientes da carteira (§37 Clients):
 *   GET    /clients                 lista paginada com busca, ordenação e filtros §61
 *   GET    /clients/filter-options  valores distintos para os filtros da tela
 *   POST   /clients                 owner/admin/analyst
 *   GET    /clients/:id             cliente com contrato ativo e plano
 *   PATCH  /clients/:id             owner/admin/analyst
 *   DELETE /clients/:id             owner/admin/analyst — ARQUIVA (status archived), nunca apaga
 *
 * As rotas /clients/:id/history, /scores, /evidence e /recommendations pertencem ao módulo
 * client-health (Etapa 9), montado no mesmo prefixo.
 */
import { Router } from 'express';

import type { OrganizationRole } from '@inovaapss/shared';

import { requireRole } from '../../middleware/rbac.js';
import { requireTenant } from '../../middleware/tenant.js';

import type { PortfolioClientsController } from './controller.js';
import type { RequestHandler } from 'express';

/** Papéis que cadastram e editam a carteira (§4: viewer só lê). */
export const CLIENT_WRITER_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'analyst'];

export interface PortfolioClientsRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  controller: PortfolioClientsController;
}

export function createPortfolioClientsRouter({
  requireAuth,
  resolveTenant,
  controller,
}: PortfolioClientsRouterOptions): Router {
  const router = Router();
  const writer = requireRole(...CLIENT_WRITER_ROLES);

  router.use(requireAuth, resolveTenant, requireTenant);

  router.get('/', controller.list);
  router.get('/filter-options', controller.filterOptions);
  router.post('/', writer, controller.create);
  router.get('/:id', controller.get);
  router.patch('/:id', writer, controller.update);
  router.delete('/:id', writer, controller.archive);

  return router;
}
