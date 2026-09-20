/**
 * Rotas de planos e contratos (§37 Contracts / Plans):
 *   GET   /plans            lista da organização
 *   POST  /plans            owner/admin/analyst
 *   GET   /plans/:id
 *   PATCH /plans/:id        owner/admin/analyst
 *   GET   /contracts        lista (filtros clientId, status; paginação §61)
 *   POST  /contracts        owner/admin/analyst — ativar um encerra o ativo anterior do cliente
 *   GET   /contracts/:id
 *   PATCH /contracts/:id    owner/admin/analyst — status `ended` + endDate encerra
 */
import { Router } from 'express';

import type { OrganizationRole } from '@inovaapss/shared';

import { requireRole } from '../../middleware/rbac.js';
import { requireTenant } from '../../middleware/tenant.js';

import type { ContractsController, PlansController } from './controller.js';
import type { RequestHandler } from 'express';

/** Papéis que cadastram planos e contratos (§4: viewer só lê). */
export const CONTRACT_WRITER_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'analyst'];

interface RouterGuards {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
}

export function createPlansRouter({
  requireAuth,
  resolveTenant,
  controller,
}: RouterGuards & { controller: PlansController }): Router {
  const router = Router();
  const writer = requireRole(...CONTRACT_WRITER_ROLES);

  router.use(requireAuth, resolveTenant, requireTenant);

  router.get('/', controller.list);
  router.post('/', writer, controller.create);
  router.get('/:id', controller.get);
  router.patch('/:id', writer, controller.update);

  return router;
}

export function createContractsRouter({
  requireAuth,
  resolveTenant,
  controller,
}: RouterGuards & { controller: ContractsController }): Router {
  const router = Router();
  const writer = requireRole(...CONTRACT_WRITER_ROLES);

  router.use(requireAuth, resolveTenant, requireTenant);

  router.get('/', controller.list);
  router.post('/', writer, controller.create);
  router.get('/:id', controller.get);
  router.patch('/:id', writer, controller.update);

  return router;
}
