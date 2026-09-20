/**
 * Controller de documentos: valida a entrada (schema.ts), chama o service e responde.
 * Sem regra de negócio (§3). O arquivo chega em `req.file` pelo multer (routes.ts).
 */
import {
  createMetricSuggestionSchema,
  documentIdParamsSchema,
  documentListQuerySchema,
  suggestionIdParamsSchema,
} from './schema.js';
import { getTenant } from '../../middleware/tenant.js';
import { AppError } from '../../shared/errors.js';

import type { DocumentsService } from './service.js';
import type { RequestHandler } from 'express';

export interface DocumentsController {
  upload: RequestHandler;
  list: RequestHandler;
  get: RequestHandler;
  extractMetrics: RequestHandler;
  listSuggestions: RequestHandler;
  createSuggestion: RequestHandler;
  acceptSuggestion: RequestHandler;
  rejectSuggestion: RequestHandler;
}

export class FileRequiredError extends AppError {
  constructor() {
    super(400, 'FILE_REQUIRED', 'Envie o arquivo no campo "file" (multipart/form-data).');
    this.name = 'FileRequiredError';
  }
}

export function createDocumentsController(service: DocumentsService): DocumentsController {
  return {
    async upload(req, res) {
      const tenant = getTenant(req);
      const file = req.file;
      if (file === undefined) throw new FileRequiredError();
      const document = await service.upload(tenant, {
        fileName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      });
      res.status(201).json({ document });
    },

    async list(req, res) {
      const tenant = getTenant(req);
      const query = documentListQuerySchema.parse(req.query);
      res.json(await service.list(tenant, query));
    },

    async get(req, res) {
      const tenant = getTenant(req);
      const { id } = documentIdParamsSchema.parse(req.params);
      const document = await service.get(tenant, id);
      res.json({ document });
    },

    async extractMetrics(req, res) {
      const tenant = getTenant(req);
      const { id } = documentIdParamsSchema.parse(req.params);
      res.json(await service.extractMetrics(tenant, id));
    },

    async listSuggestions(req, res) {
      const tenant = getTenant(req);
      const { id } = documentIdParamsSchema.parse(req.params);
      const items = await service.listSuggestions(tenant, id);
      res.json({ items, total: items.length });
    },

    async createSuggestion(req, res) {
      const tenant = getTenant(req);
      const { id } = documentIdParamsSchema.parse(req.params);
      const body = createMetricSuggestionSchema.parse(req.body);
      const suggestion = await service.createSuggestion(tenant, id, body);
      res.status(201).json({ suggestion });
    },

    async acceptSuggestion(req, res) {
      const tenant = getTenant(req);
      const { id } = suggestionIdParamsSchema.parse(req.params);
      res.json(await service.accept(tenant, id));
    },

    async rejectSuggestion(req, res) {
      const tenant = getTenant(req);
      const { id } = suggestionIdParamsSchema.parse(req.params);
      const suggestion = await service.reject(tenant, id);
      res.json({ suggestion });
    },
  };
}
