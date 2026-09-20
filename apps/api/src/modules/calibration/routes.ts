/**
 * Rotas de calibração (§37):
 *   GET  /calibration/versions               versões com histórico gravado, para escolher
 *   POST /calibration/runs                   roda o backtest e guarda o resultado (owner/admin)
 *   GET  /calibration/runs                   histórico de execuções
 *   GET  /calibration/runs/:id               uma execução com os números completos
 *   POST /calibration/runs/:id/apply-suggestions  cria RASCUNHO com os pesos aceitos (owner/admin)
 *
 * Calibrar mexe na régua de toda a carteira: escrita é de owner ou admin (§5).
 */
import { Router } from 'express';

import { CALIBRATION_WINDOW_DAYS } from '@inovaapss/shared';

import { CalibrationError } from './service.js';
import { requireRole } from '../../middleware/rbac.js';
import { requireTenant } from '../../middleware/tenant.js';

import type { CalibrationService } from './service.js';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface CalibrationRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  service: CalibrationService;
}

function fail(res: Response, req: Request, code: string, message: string, status = 400): void {
  res.status(status).json({ error: { code, message, requestId: req.id } });
}

/** Erros de regra viram resposta com código; o resto segue para o handler global. */
function handle(res: Response, req: Request, next: NextFunction) {
  return (error: unknown): void => {
    if (error instanceof CalibrationError) {
      fail(res, req, error.code, error.message, error.status);
      return;
    }
    next(error);
  };
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function createCalibrationRouter({
  requireAuth,
  resolveTenant,
  service,
}: CalibrationRouterOptions): Router {
  const router = Router();
  const manager = requireRole('owner', 'admin');
  router.use(requireAuth, resolveTenant, requireTenant);

  router.get('/versions', (req, res, next) => {
    service
      .listVersions(req.tenant!)
      .then((items) => res.json({ items }))
      .catch(handle(res, req, next));
  });

  router.get('/runs', (req, res, next) => {
    service
      .listRuns(req.tenant!)
      .then((items) => res.json({ items }))
      .catch(handle(res, req, next));
  });

  router.post('/runs', manager, (req, res, next) => {
    const windowDays = readNumber(req.body?.windowDays);
    if (
      windowDays !== undefined &&
      !CALIBRATION_WINDOW_DAYS.includes(windowDays as (typeof CALIBRATION_WINDOW_DAYS)[number])
    ) {
      fail(
        res,
        req,
        'INVALID_WINDOW',
        `Janela inválida. Use uma de: ${CALIBRATION_WINDOW_DAYS.join(', ')} dias.`,
      );
      return;
    }
    const metricModelVersionId =
      typeof req.body?.metricModelVersionId === 'string' && req.body.metricModelVersionId !== ''
        ? req.body.metricModelVersionId
        : undefined;

    service
      .createRun(
        { organizationId: req.tenant!.organizationId, userId: req.tenant!.userId },
        {
          windowDays,
          metricModelVersionId,
          alertRiskThreshold: readNumber(req.body?.alertRiskThreshold),
          suggestionStrength: readNumber(req.body?.suggestionStrength),
        },
      )
      .then((run) => res.status(201).json(run))
      .catch(handle(res, req, next));
  });

  router.get('/runs/:id', (req, res, next) => {
    service
      .getRun(req.tenant!, String(req.params.id))
      .then((run) => res.json(run))
      .catch(handle(res, req, next));
  });

  router.post('/runs/:id/apply-suggestions', manager, (req, res, next) => {
    const raw: unknown = req.body?.acceptedMetricIds;
    if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string')) {
      fail(
        res,
        req,
        'INVALID_ACCEPTED_METRICS',
        'Envie acceptedMetricIds com os ids das métricas cujo peso sugerido foi aceito.',
      );
      return;
    }
    service
      .applySuggestions(req.tenant!, String(req.params.id), raw as string[])
      .then((result) => res.status(201).json(result))
      .catch(handle(res, req, next));
  });

  return router;
}
