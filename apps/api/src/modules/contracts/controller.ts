/**
 * Controllers de planos e contratos: validam (schema.ts), chamam o service e respondem.
 * Sem regra de negócio (§3).
 */
import {
  createContractSchema,
  createPlanSchema,
  idParamsSchema,
  listContractsQuerySchema,
  updateContractSchema,
  updatePlanSchema,
} from './schema.js';
import { getTenant } from '../../middleware/tenant.js';

import type { ContractsService, PlansService } from './service.js';
import type { RequestHandler } from 'express';

export interface PlansController {
  list: RequestHandler;
  get: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
}

export interface ContractsController {
  list: RequestHandler;
  get: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
}

export function createPlansController(service: PlansService): PlansController {
  return {
    async list(req, res) {
      const items = await service.list(getTenant(req));
      res.json({ items, total: items.length });
    },

    async get(req, res) {
      const { id } = idParamsSchema.parse(req.params);
      const plan = await service.get(getTenant(req), id);
      res.json({ plan });
    },

    async create(req, res) {
      const body = createPlanSchema.parse(req.body);
      const plan = await service.create(getTenant(req), body);
      res.status(201).json({ plan });
    },

    async update(req, res) {
      const { id } = idParamsSchema.parse(req.params);
      const body = updatePlanSchema.parse(req.body);
      const plan = await service.update(getTenant(req), id, body);
      res.json({ plan });
    },
  };
}

export function createContractsController(service: ContractsService): ContractsController {
  return {
    async list(req, res) {
      const query = listContractsQuerySchema.parse(req.query);
      const result = await service.list(getTenant(req), query);
      res.json(result);
    },

    async get(req, res) {
      const { id } = idParamsSchema.parse(req.params);
      const contract = await service.get(getTenant(req), id);
      res.json({ contract });
    },

    async create(req, res) {
      const body = createContractSchema.parse(req.body);
      const contract = await service.create(getTenant(req), body);
      res.status(201).json({ contract });
    },

    async update(req, res) {
      const { id } = idParamsSchema.parse(req.params);
      const body = updateContractSchema.parse(req.body);
      const contract = await service.update(getTenant(req), id, body);
      res.json({ contract });
    },
  };
}
