/**
 * Rotas de alertas (§37):
 *   GET   /alerts                  fila de alertas, mais graves primeiro
 *   PATCH /alerts/:id              reconhecer ou resolver (owner/admin/analyst)
 *   GET   /alerts/digest           resumo pronto para o e-mail (prévia)
 *   POST  /alerts/digest/send      envia o resumo por e-mail para quem está logado
 */
import { Router } from 'express';

import { ALERT_STATUSES, type AlertStatus } from '@inovaapss/shared';

import { requireRole } from '../../middleware/rbac.js';
import { requireTenant } from '../../middleware/tenant.js';

import type { AlertsService } from './service.js';
import type { Mailer } from '../../infrastructure/mailer.js';
import type { RequestHandler } from 'express';

export interface AlertsRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  service: AlertsService;
  mailer: Mailer;
  /** Endereço do painel, para os links do e-mail. */
  webBaseUrl: string;
}

export function createAlertsRouter({
  requireAuth,
  resolveTenant,
  service,
  mailer,
  webBaseUrl,
}: AlertsRouterOptions): Router {
  const router = Router();
  const writer = requireRole('owner', 'admin', 'analyst');
  router.use(requireAuth, resolveTenant, requireTenant);

  router.get('/', (req, res, next) => {
    const raw = req.query.status;
    const status =
      typeof raw === 'string' && ALERT_STATUSES.includes(raw as AlertStatus)
        ? (raw as AlertStatus)
        : undefined;
    service
      .list(req.tenant!.organizationId, status)
      .then((data) => res.json(data))
      .catch(next);
  });

  router.get('/digest', (req, res, next) => {
    service
      .digest(req.tenant!.organizationId, webBaseUrl)
      .then((data) => res.json(data))
      .catch(next);
  });

  router.post('/digest/send', writer, (req, res, next) => {
    const destino = typeof req.body?.to === 'string' ? req.body.to.trim() : req.auth?.email;
    if (!destino) {
      res.status(400).json({
        error: { code: 'NO_RECIPIENT', message: 'Informe o e-mail de destino.', requestId: req.id },
      });
      return;
    }
    service
      .digest(req.tenant!.organizationId, webBaseUrl)
      .then(async (digest) => {
        if (digest.totalOpen === 0) {
          res.json({
            sent: false,
            reason: 'Nenhum alerta aberto no momento — nada a enviar.',
            to: destino,
          });
          return;
        }
        const resultado = await mailer.sendDigest(destino, digest);
        res.json(resultado);
      })
      .catch(next);
  });

  router.patch('/:id', writer, (req, res, next) => {
    const raw = req.params.id;
    const alertId = Array.isArray(raw) ? raw[0] : raw;
    const status = req.body?.status as AlertStatus | undefined;
    if (!alertId || !status || !ALERT_STATUSES.includes(status)) {
      res.status(400).json({
        error: {
          code: 'INVALID_STATUS',
          message: `Status inválido. Use um de: ${ALERT_STATUSES.join(', ')}.`,
          requestId: req.id,
        },
      });
      return;
    }
    service
      .updateStatus(req.tenant!.organizationId, alertId, status)
      .then((alerta) => {
        if (!alerta) {
          res.status(404).json({
            error: {
              code: 'ALERT_NOT_FOUND',
              message: 'Alerta não encontrado.',
              requestId: req.id,
            },
          });
          return;
        }
        res.json(alerta);
      })
      .catch(next);
  });

  return router;
}
