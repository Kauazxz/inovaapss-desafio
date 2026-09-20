/**
 * Rotas da visão individual do cliente (§37 Clients, §40). Montadas sob /clients.
 *   GET /clients/:id/scores            as métricas com saúde, peso e contribuição
 *   GET /clients/:id/evidence          os motivos ordenados pelo impacto
 *   GET /clients/:id/recommendations   o que fazer (playbook de cada métrica negativa)
 *   GET /clients/:id/history           evolução e mudanças de classe
 *   GET /clients/:id/overview          cabeçalho e resumo do período
 *
 * Leitura: qualquer membro da organização.
 */
import { Router } from 'express';

import { ClientNotFoundError, type ClientHealthService } from './service.js';
import { requireTenant } from '../../middleware/tenant.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface ClientHealthRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  service: ClientHealthService;
}

type Carregador = (organizationId: string, clientId: string) => Promise<unknown>;

export function createClientHealthRouter({
  requireAuth,
  resolveTenant,
  service,
}: ClientHealthRouterOptions): Router {
  const router = Router();
  router.use(requireAuth, resolveTenant, requireTenant);

  const responder = (carregar: Carregador) => (req: Request, res: Response, next: NextFunction) => {
    const raw = req.params.id;
    const clientId = Array.isArray(raw) ? raw[0] : raw;
    if (!clientId) {
      res.status(400).json({ error: { code: 'INVALID_CLIENT', message: 'Cliente inválido.' } });
      return;
    }
    carregar(req.tenant!.organizationId, clientId)
      .then((data) => res.json(data))
      .catch((err: unknown) => {
        if (err instanceof ClientNotFoundError) {
          res.status(404).json({
            error: { code: 'CLIENT_NOT_FOUND', message: err.message, requestId: req.id },
          });
          return;
        }
        next(err);
      });
  };

  router.get(
    '/:id/overview',
    responder((org, id) => service.overview(org, id)),
  );
  router.get(
    '/:id/scores',
    responder((org, id) => service.scores(org, id)),
  );
  router.get(
    '/:id/evidence',
    responder((org, id) => service.evidence(org, id)),
  );
  router.get(
    '/:id/recommendations',
    responder((org, id) => service.recommendations(org, id)),
  );
  router.get(
    '/:id/history',
    responder((org, id) => service.history(org, id)),
  );

  return router;
}
