/**
 * Controller de métricas e modelos: valida a entrada (schema.ts), chama o service e responde.
 * Sem regra de negócio (§3).
 */
import {
  activateMetricModelVersionSchema,
  createMetricDefinitionSchema,
  createMetricModelSchema,
  createMetricModelVersionSchema,
  idParamSchema,
  listMetricDefinitionsQuerySchema,
  listMetricModelsQuerySchema,
  previewScoreSchema,
  rebalanceMetricModelSchema,
  updateMetricDefinitionSchema,
  updateMetricModelVersionSchema,
  versionNumberParamSchema,
} from './schema.js';
import { getTenant } from '../../middleware/tenant.js';

import type { MetricsService } from './service.js';
import type { RequestHandler } from 'express';

export interface MetricsController {
  listDefinitions: RequestHandler;
  createDefinition: RequestHandler;
  getDefinition: RequestHandler;
  updateDefinition: RequestHandler;
  deleteDefinition: RequestHandler;
  previewScore: RequestHandler;
  listModels: RequestHandler;
  createModel: RequestHandler;
  getModel: RequestHandler;
  createVersion: RequestHandler;
  updateVersion: RequestHandler;
  activateVersion: RequestHandler;
  discardVersion: RequestHandler;
  rebalance: RequestHandler;
}

export function createMetricsController(service: MetricsService): MetricsController {
  return {
    async listDefinitions(req, res) {
      const query = listMetricDefinitionsQuerySchema.parse(req.query);
      const result = await service.listDefinitions(getTenant(req), query);
      res.json({ ...result, page: query.page, pageSize: query.pageSize });
    },

    async createDefinition(req, res) {
      const body = createMetricDefinitionSchema.parse(req.body);
      const definition = await service.createDefinition(getTenant(req), body);
      res.status(201).json({ definition });
    },

    async getDefinition(req, res) {
      const id = idParamSchema.parse(req.params.id);
      res.json(await service.getDefinition(getTenant(req), id));
    },

    async updateDefinition(req, res) {
      const id = idParamSchema.parse(req.params.id);
      const body = updateMetricDefinitionSchema.parse(req.body);
      const definition = await service.updateDefinition(getTenant(req), id, body);
      res.json({ definition });
    },

    async deleteDefinition(req, res) {
      const id = idParamSchema.parse(req.params.id);
      res.json(await service.deleteDefinition(getTenant(req), id));
    },

    async previewScore(req, res) {
      const id = idParamSchema.parse(req.params.id);
      const body = previewScoreSchema.parse(req.body);
      const score = await service.previewScore(getTenant(req), id, body);
      res.json({ score });
    },

    async listModels(req, res) {
      const query = listMetricModelsQuerySchema.parse(req.query);
      const result = await service.listModels(getTenant(req), query);
      res.json({ ...result, page: query.page, pageSize: query.pageSize });
    },

    async createModel(req, res) {
      const body = createMetricModelSchema.parse(req.body);
      const model = await service.createModel(getTenant(req), body);
      res.status(201).json({ model, versions: [] });
    },

    async getModel(req, res) {
      const id = idParamSchema.parse(req.params.id);
      res.json(await service.getModel(getTenant(req), id));
    },

    async createVersion(req, res) {
      const id = idParamSchema.parse(req.params.id);
      const body = createMetricModelVersionSchema.parse(req.body ?? {});
      const version = await service.createVersion(getTenant(req), id, body);
      res.status(201).json({ version });
    },

    async updateVersion(req, res) {
      const id = idParamSchema.parse(req.params.id);
      const number = versionNumberParamSchema.parse(req.params.version);
      const body = updateMetricModelVersionSchema.parse(req.body);
      const version = await service.updateVersion(getTenant(req), id, number, body);
      res.json({ version });
    },

    async activateVersion(req, res) {
      const id = idParamSchema.parse(req.params.id);
      const number = versionNumberParamSchema.parse(req.params.version);
      const body = activateMetricModelVersionSchema.parse(req.body ?? {});
      const version = await service.activateVersion(getTenant(req), id, number, body);
      res.json({ version });
    },

    async discardVersion(req, res) {
      const id = idParamSchema.parse(req.params.id);
      const number = versionNumberParamSchema.parse(req.params.version);
      await service.discardVersion(getTenant(req), id, number);
      res.status(204).end();
    },

    async rebalance(req, res) {
      const id = idParamSchema.parse(req.params.id);
      const body = rebalanceMetricModelSchema.parse(req.body ?? {});
      res.json(await service.rebalance(getTenant(req), id, body));
    },
  };
}
