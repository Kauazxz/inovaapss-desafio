/**
 * Rotas de organizações (§37):
 *   POST  /organizations                 onboarding — cria a organização e vira owner
 *   GET   /organizations/current         organização atual
 *   PATCH /organizations/current         só owner/admin
 *   GET   /organizations/current/users   membros e papéis
 *   POST  /organizations/current/users   só owner/admin — convida ou cria um usuário
 *   PATCH  /organizations/current/users/:authUserId  só owner/admin — muda o papel
 *   DELETE /organizations/current/users/:authUserId  só owner/admin — remove o acesso
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
  router.patch('/current/users/:authUserId', requireTenant, manager, controller.updateMemberRole);
  router.delete('/current/users/:authUserId', requireTenant, manager, controller.removeMember);

  return router;
}
