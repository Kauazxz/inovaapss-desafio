/**
 * Rotas do motor de métricas (§37):
 *
 *   GET    /metrics                                   lista (§61: page, pageSize, search, sort, order, type, direction, source, is_active)
 *   POST   /metrics                                   owner/admin
 *   GET    /metrics/:id                               definição + item da versão ativa
 *   PATCH  /metrics/:id                               owner/admin
 *   DELETE /metrics/:id                               owner/admin — apaga se nunca usada, senão desativa
 *   POST   /metrics/:id/preview-score                 simula com o motor (qualquer membro)
 *
 *   GET    /metric-models                             lista
 *   POST   /metric-models                             owner/admin
 *   GET    /metric-models/:id                         modelo + versões (com itens)
 *   POST   /metric-models/:id/versions                owner/admin — novo rascunho
 *   PATCH  /metric-models/:id/versions/:version       owner/admin — só rascunho
 *   POST   /metric-models/:id/versions/:version/activate  owner/admin — soma 100 %, arquiva a anterior
 *   POST   /metric-models/:id/rebalance               proposta de pesos (não salva; qualquer membro)
 */
import { Router } from 'express';

import { MANAGER_ROLES, requireRole } from '../../middleware/rbac.js';
import { requireTenant } from '../../middleware/tenant.js';

import type { MetricsController } from './controller.js';
import type { RequestHandler } from 'express';

export interface MetricsRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  controller: MetricsController;
}

export function createMetricDefinitionsRouter({
  requireAuth,
  resolveTenant,
  controller,
}: MetricsRouterOptions): Router {
  const router = Router();
  const manager = requireRole(...MANAGER_ROLES);

  router.use(requireAuth, resolveTenant, requireTenant);

  router.get('/', controller.listDefinitions);
  router.post('/', manager, controller.createDefinition);
  router.get('/:id', controller.getDefinition);
  router.patch('/:id', manager, controller.updateDefinition);
  router.delete('/:id', manager, controller.deleteDefinition);
  router.post('/:id/preview-score', controller.previewScore);

  return router;
}

export function createMetricModelsRouter({
  requireAuth,
  resolveTenant,
  controller,
}: MetricsRouterOptions): Router {
  const router = Router();
  const manager = requireRole(...MANAGER_ROLES);

  router.use(requireAuth, resolveTenant, requireTenant);

  router.get('/', controller.listModels);
  router.post('/', manager, controller.createModel);
  router.get('/:id', controller.getModel);
  router.post('/:id/versions', manager, controller.createVersion);
  router.patch('/:id/versions/:version', manager, controller.updateVersion);
  router.post('/:id/versions/:version/activate', manager, controller.activateVersion);
  router.post('/:id/rebalance', controller.rebalance);

  return router;
}
