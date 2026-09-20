/**
 * Rotas de importação (§37 Imports), montadas em /api/v1/imports:
 *   POST /imports              upload multipart (campo "file") — owner/admin/analyst
 *   GET  /imports              importações da organização (§61)
 *   GET  /imports/datasets     catálogo de datasets e campos, para a tela de mapeamento
 *   GET  /imports/:id          a importação + as tabelas do arquivo com o mapeamento sugerido
 *   POST /imports/:id/preview  valida com o mapeamento escolhido e devolve o relatório
 *   POST /imports/:id/confirm  revalida, grava e recalcula — owner/admin/analyst
 *   GET  /imports/:id/errors   linhas recusadas, paginadas (§61)
 *
 * `/imports/datasets` fica ANTES de `/imports/:id` porque "datasets" bateria no parâmetro.
 *
 * O multer recebe o arquivo em memória (limite §45: 10 MB, um arquivo) e recusa, antes de ler o
 * corpo inteiro, extensão/MIME fora da allowlist de importação. Os erros do multer viram AppError.
 */
import { Router } from 'express';
import multer from 'multer';

import type { OrganizationRole } from '@inovaapss/shared';
import { MAX_IMPORT_BYTES, resolveImportFileType } from '@inovaapss/validation';

import { ImportFileTooLargeError, UnsupportedImportFileError } from './service.js';
import { requireRole } from '../../middleware/rbac.js';
import { requireTenant } from '../../middleware/tenant.js';
import { AppError } from '../../shared/errors.js';

import type { ImportsController } from './controller.js';
import type { RequestHandler } from 'express';

/** Quem pode importar dados (§5: viewer só lê). */
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
    limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 5 },
    fileFilter: (_req, file, callback) => {
      const resolved = resolveImportFileType(file.originalname, file.mimetype);
      if (resolved.ok) callback(null, true);
      else callback(new UnsupportedImportFileError(resolved.reason));
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
  router.get('/datasets', controller.datasets);
  router.get('/:id', controller.get);
  router.post('/:id/preview', writer, controller.preview);
  router.post('/:id/confirm', writer, controller.confirm);
  router.get('/:id/errors', controller.listErrors);

  return router;
}
