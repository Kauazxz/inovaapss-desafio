/**
 * Controller da importação: valida a entrada (schema.ts), chama o service e responde.
 * Sem regra de negócio (§3). O arquivo chega em `req.file` pelo multer (routes.ts).
 */
import {
  confirmImportSchema,
  importErrorsQuerySchema,
  importIdParamsSchema,
  importListQuerySchema,
  previewImportSchema,
} from './schema.js';
import { getTenant } from '../../middleware/tenant.js';
import { AppError } from '../../shared/errors.js';

import type { ImportsService } from './service.js';
import type { RequestHandler } from 'express';

export interface ImportsController {
  upload: RequestHandler;
  list: RequestHandler;
  get: RequestHandler;
  preview: RequestHandler;
  confirm: RequestHandler;
  listErrors: RequestHandler;
  datasets: RequestHandler;
}

export class ImportFileRequiredError extends AppError {
  constructor() {
    super(400, 'FILE_REQUIRED', 'Envie o arquivo no campo "file" (multipart/form-data).');
    this.name = 'ImportFileRequiredError';
  }
}

export function createImportsController(service: ImportsService): ImportsController {
  return {
    async upload(req, res) {
      const tenant = getTenant(req);
      const file = req.file;
      if (file === undefined) throw new ImportFileRequiredError();
      const result = await service.upload(tenant, {
        fileName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      });
      res.status(201).json(result);
    },

    async list(req, res) {
      const tenant = getTenant(req);
      const query = importListQuerySchema.parse(req.query);
      const { items, total } = await service.list(tenant, query);
      res.json({ items, page: query.page, pageSize: query.pageSize, total });
    },

    async get(req, res) {
      const tenant = getTenant(req);
      const { id } = importIdParamsSchema.parse(req.params);
      res.json(await service.get(tenant, id));
    },

    async preview(req, res) {
      const tenant = getTenant(req);
      const { id } = importIdParamsSchema.parse(req.params);
      const body = previewImportSchema.parse(req.body);
      res.json(await service.preview(tenant, id, body));
    },

    async confirm(req, res) {
      const tenant = getTenant(req);
      const { id } = importIdParamsSchema.parse(req.params);
      // Corpo opcional: a tela confirma o que já foi salvo na prévia.
      const body = confirmImportSchema.parse(req.body ?? {});
      res.json(await service.confirm(tenant, id, body));
    },

    async listErrors(req, res) {
      const tenant = getTenant(req);
      const { id } = importIdParamsSchema.parse(req.params);
      const query = importErrorsQuerySchema.parse(req.query);
      const { items, total } = await service.listErrors(tenant, id, query);
      res.json({ items, page: query.page, pageSize: query.pageSize, total });
    },

    datasets(_req, res) {
      const items = service.datasets();
      res.json({ items, total: items.length });
    },
  };
}
