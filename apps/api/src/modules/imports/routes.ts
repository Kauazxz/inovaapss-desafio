/**
 * Rotas da importação de dados (§37 Imports), montadas em /api/v1/imports:
 *   POST /imports              upload multipart (campo "file") — owner/admin/analyst
 *   GET  /imports              histórico paginado (§61)
 *   GET  /imports/:id          job, tabelas do arquivo e erros por linha
 *   POST /imports/:id/preview  valida e devolve as contagens — owner/admin/analyst
 *   POST /imports/:id/confirm  grava e recalcula — owner/admin/analyst
 *
 * O multer recebe o arquivo em memória (limite §45: 20 MB no importador, um arquivo) e recusa,
 * antes de ler o corpo inteiro, extensão/MIME fora da allowlist tabular. Os erros do multer
 * viram AppError com a mesma cara dos outros.
 */
import { Router } from 'express';
import multer from 'multer';

import { IMPORT_MAX_UPLOAD_BYTES } from '@inovaapss/shared';
import type { OrganizationRole } from '@inovaapss/shared';
import { resolveImportFileType } from '@inovaapss/validation';

import { ImportFileTooLargeError, UnsupportedImportFileTypeError } from './service.js';
import { requireRole } from '../../middleware/rbac.js';
import { requireTenant } from '../../middleware/tenant.js';
import { AppError } from '../../shared/errors.js';

import type { ImportsController } from './controller.js';
import type { RequestHandler } from 'express';

/** Quem pode importar dados (viewer só lê o histórico). */
export const IMPORT_WRITER_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'analyst'];

export const IMPORT_UPLOAD_FIELD_NAME = 'file';

export interface ImportsRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  controller: ImportsController;
}

function createUploadMiddleware(): RequestHandler {
  const single = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: IMPORT_MAX_UPLOAD_BYTES, files: 1, fields: 5 },
    fileFilter: (_req, file, callback) => {
      const resolved = resolveImportFileType(file.originalname, file.mimetype);
      if (resolved.ok) callback(null, true);
      else callback(new UnsupportedImportFileTypeError(resolved.reason));
    },
  }).single(IMPORT_UPLOAD_FIELD_NAME);

  return (req, res, next) => {
    single(req, res, (err: unknown) => {
      if (err === undefined || err === null) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(new ImportFileTooLargeError());
          return;
        }
        next(
          new AppError(
            400,
            'UPLOAD_ERROR',
            `Envie um único arquivo no campo "${IMPORT_UPLOAD_FIELD_NAME}".`,
          ),
        );
        return;
      }
      next(err);
    });
  };
}

export function createImportsRouter({
  requireAuth,
  resolveTenant,
  controller,
}: ImportsRouterOptions): Router {
  const router = Router();
  const writer = requireRole(...IMPORT_WRITER_ROLES);
  const upload = createUploadMiddleware();

  router.use(requireAuth, resolveTenant, requireTenant);

  router.post('/', writer, upload, controller.upload);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/:id/preview', writer, controller.preview);
  router.post('/:id/confirm', writer, controller.confirm);

  return router;
}
