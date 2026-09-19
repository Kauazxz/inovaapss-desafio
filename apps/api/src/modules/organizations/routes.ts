/**
 * Rotas de organizações (§37):
 *   POST  /organizations                 onboarding — cria a organização e vira owner
 *   GET   /organizations/current         organização atual
 *   PATCH /organizations/current         só owner/admin
 *   GET   /organizations/current/users   membros e papéis
 *   POST  /organizations/current/users   só owner/admin — convida ou cria um usuário
 */
import { Router } from 'express';

import { MANAGER_ROLES, requireRole } from '../../middleware/rbac.js';
import { requireTenant } from '../../middleware/tenant.js';

import type { OrganizationsController } from './controller.js';
import type { RequestHandler } from 'express';

export interface OrganizationsRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  controller: OrganizationsController;
}

export function createOrganizationsRouter({
  requireAuth,
  resolveTenant,
  controller,
}: OrganizationsRouterOptions): Router {
  const router = Router();
  const manager = requireRole(...MANAGER_ROLES);

  router.use(requireAuth, resolveTenant);

  router.post('/', controller.create);
  router.get('/current', requireTenant, controller.getCurrent);
  router.patch('/current', requireTenant, manager, controller.updateCurrent);
  router.get('/current/users', requireTenant, controller.listMembers);
  router.post('/current/users', requireTenant, manager, controller.inviteMember);

  return router;
}
