/**
 * Rotas do dashboard (§37 Dashboard):
 *   GET /dashboard/risk   aba "Em risco": KPIs, gráfico de forecast e ranking com evidências
 *
 * Leitura pura de snapshots: qualquer membro da organização pode ver.
 */
import { Router } from 'express';

import { requireTenant } from '../../middleware/tenant.js';

import type { DashboardService } from './service.js';
import type { RequestHandler } from 'express';

export interface DashboardRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  service: DashboardService;
}

export function createDashboardRouter({
  requireAuth,
  resolveTenant,
  service,
}: DashboardRouterOptions): Router {
  const router = Router();
  router.use(requireAuth, resolveTenant, requireTenant);

  router.get('/risk', (req, res, next) => {
    service
      .risk(req.tenant!.organizationId)
      .then((data) => res.json(data))
      .catch(next);
  });

  return router;
}
