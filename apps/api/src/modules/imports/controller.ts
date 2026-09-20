/**
 * Controller da importação: valida a entrada (schema.ts), chama o service e responde. Sem regra
 * de negócio (§3). O arquivo chega em `req.file` pelo multer (routes.ts).
 */
import {
  importConfirmBodySchema,
  importIdParamsSchema,
  importListQuerySchema,
  importPreviewBodySchema,
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
      res.json(await service.list(tenant, query));
    },

    async get(req, res) {
      const tenant = getTenant(req);
      const { id } = importIdParamsSchema.parse(req.params);
      // A paginação aqui é só dos erros por linha (§61).
      const { page } = importListQuerySchema.parse(req.query);
      res.json(await service.get(tenant, id, page));
    },

    async preview(req, res) {
      const tenant = getTenant(req);
      const { id } = importIdParamsSchema.parse(req.params);
      const body = importPreviewBodySchema.parse(req.body ?? {});
      res.json(await service.preview(tenant, id, body.sheets));
    },

    async confirm(req, res) {
      const tenant = getTenant(req);
      const { id } = importIdParamsSchema.parse(req.params);
      const body = importConfirmBodySchema.parse(req.body ?? {});
      res.json(
        await service.confirm(tenant, id, {
          selections: body.sheets,
          recalculate: body.recalculate,
        }),
      );
    },
  };
}
