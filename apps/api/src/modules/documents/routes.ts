/**
 * Rotas de documentos e sugestões (§37 Documents), montadas na raiz do /api/v1:
 *   POST /documents                       upload multipart (campo "file") — owner/admin/analyst
 *   GET  /documents                       lista paginada (§61)
 *   GET  /documents/:id                   metadados + URL assinada de download
 *   POST /documents/:id/extract-metrics   extrai o texto e roda o provider — owner/admin/analyst
 *   GET  /documents/:id/suggestions       sugestões do documento
 *   POST /documents/:id/suggestions       sugestão manual — owner/admin/analyst
 *   POST /metric-suggestions/:id/accept   marca aceita e devolve o payload para POST /metrics
 *   POST /metric-suggestions/:id/reject   marca rejeitada
 *
 * O multer recebe o arquivo em memória (limite §45: 10 MB, um arquivo) e recusa, antes de ler o
 * corpo inteiro, extensão/MIME fora da allowlist. Os erros do multer viram AppError.
 */
import { Router } from 'express';
import multer from 'multer';

import type { OrganizationRole } from '@inovaapss/shared';
import { MAX_UPLOAD_BYTES, resolveUploadType } from '@inovaapss/validation';

import { FileTooLargeError, UnsupportedFileTypeError } from './service.js';
import { requireRole } from '../../middleware/rbac.js';
import { requireTenant } from '../../middleware/tenant.js';
import { AppError } from '../../shared/errors.js';

import type { DocumentsController } from './controller.js';
import type { RequestHandler } from 'express';

/** Quem pode enviar documentos e revisar sugestões (§35: revisão humana; viewer só lê). */
export const DOCUMENT_WRITER_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'analyst'];

export const UPLOAD_FIELD_NAME = 'file';

export interface DocumentsRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  controller: DocumentsController;
}

function createUploadMiddleware(): RequestHandler {
  const single = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
    fileFilter: (_req, file, callback) => {
      const resolved = resolveUploadType(file.originalname, file.mimetype);
      if (resolved.ok) callback(null, true);
      else callback(new UnsupportedFileTypeError(resolved.reason));
    },
  }).single(UPLOAD_FIELD_NAME);

  return (req, res, next) => {
    single(req, res, (err: unknown) => {
      if (err === undefined || err === null) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(new FileTooLargeError());
          return;
        }
        next(
          new AppError(
            400,
            'UPLOAD_ERROR',
            `Envie um único arquivo no campo "${UPLOAD_FIELD_NAME}".`,
          ),
        );
        return;
      }
      next(err);
    });
  };
}

export function createDocumentsRouter({
  requireAuth,
  resolveTenant,
  controller,
}: DocumentsRouterOptions): Router {
  const router = Router();
  const writer = requireRole(...DOCUMENT_WRITER_ROLES);
  const upload = createUploadMiddleware();

  router.use(['/documents', '/metric-suggestions'], requireAuth, resolveTenant, requireTenant);

  router.post('/documents', writer, upload, controller.upload);
  router.get('/documents', controller.list);
  router.get('/documents/:id', controller.get);
  router.post('/documents/:id/extract-metrics', writer, controller.extractMetrics);
  router.get('/documents/:id/suggestions', controller.listSuggestions);
  router.post('/documents/:id/suggestions', writer, controller.createSuggestion);

  router.post('/metric-suggestions/:id/accept', writer, controller.acceptSuggestion);
  router.post('/metric-suggestions/:id/reject', writer, controller.rejectSuggestion);

  return router;
}
