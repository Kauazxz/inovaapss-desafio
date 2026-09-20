/**
 * Controller de clientes: valida entrada (schema.ts), chama o service e responde. Sem regra de
 * negócio (§3).
 */
import {
  clientIdParamsSchema,
  createPortfolioClientSchema,
  listPortfolioClientsQuerySchema,
  updatePortfolioClientSchema,
} from './schema.js';
import { getTenant } from '../../middleware/tenant.js';

import type { PortfolioClientsService } from './service.js';
import type { RequestHandler } from 'express';

export interface PortfolioClientsController {
  list: RequestHandler;
  filterOptions: RequestHandler;
  create: RequestHandler;
  get: RequestHandler;
  update: RequestHandler;
  archive: RequestHandler;
}

export function createPortfolioClientsController(
  service: PortfolioClientsService,
): PortfolioClientsController {
  return {
    async list(req, res) {
      const query = listPortfolioClientsQuerySchema.parse(req.query);
      const result = await service.list(getTenant(req), query);
      res.json(result);
    },

    async filterOptions(req, res) {
      const options = await service.filterOptions(getTenant(req));
      res.json(options);
    },

    async create(req, res) {
      const body = createPortfolioClientSchema.parse(req.body);
      const client = await service.create(getTenant(req), body);
      res.status(201).json({ client });
    },

    async get(req, res) {
      const { id } = clientIdParamsSchema.parse(req.params);
      const client = await service.get(getTenant(req), id);
      res.json({ client });
    },

    async update(req, res) {
      const { id } = clientIdParamsSchema.parse(req.params);
      const body = updatePortfolioClientSchema.parse(req.body);
      const client = await service.update(getTenant(req), id, body);
      res.json({ client });
    },

    async archive(req, res) {
      const { id } = clientIdParamsSchema.parse(req.params);
      const client = await service.archive(getTenant(req), id);
      res.json({ client });
    },
  };
}
