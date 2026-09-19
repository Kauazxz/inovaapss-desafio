/**
 * Controller de organizações: valida a entrada (schema.ts), chama o service e responde.
 * Sem regra de negócio (§3).
 */
import {
  createOrganizationSchema,
  inviteMemberSchema,
  updateOrganizationSchema,
} from './schema.js';
import { getAuthUser } from '../../middleware/auth.js';
import { getTenant } from '../../middleware/tenant.js';

import type { OrganizationsService } from './service.js';
import type { RequestHandler } from 'express';

export interface OrganizationsController {
  create: RequestHandler;
  getCurrent: RequestHandler;
  updateCurrent: RequestHandler;
  listMembers: RequestHandler;
  inviteMember: RequestHandler;
}

export function createOrganizationsController(
  service: OrganizationsService,
): OrganizationsController {
  return {
    async create(req, res) {
      const body = createOrganizationSchema.parse(req.body);
      const user = getAuthUser(req);
      const organization = await service.createForUser(user.userId, body);
      res.status(201).json({ organization, role: 'owner' });
    },

    async getCurrent(req, res) {
      const tenant = getTenant(req);
      const organization = await service.getCurrent(tenant);
      res.json({ organization, role: tenant.role });
    },

    async updateCurrent(req, res) {
      const body = updateOrganizationSchema.parse(req.body);
      const tenant = getTenant(req);
      const organization = await service.updateCurrent(tenant, body);
      res.json({ organization, role: tenant.role });
    },

    async listMembers(req, res) {
      const tenant = getTenant(req);
      const members = await service.listMembers(tenant);
      res.json({ items: members, total: members.length });
    },

    async inviteMember(req, res) {
      const body = inviteMemberSchema.parse(req.body);
      const tenant = getTenant(req);
      const result = await service.inviteMember(tenant, body);
      res.status(201).json(result);
    },
  };
}
