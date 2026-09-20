/**
 * Router base /api/v1 (§37). Cada módulo registra o seu sub-router aqui, numa linha:
 *   router.use('/clients', createClientsRouter(...));
 * e acrescenta a entrada correspondente em ROUTES para aparecer no GET /api/v1.
 *
 * Os middlewares de auth/tenant nascem aqui uma vez e são passados aos módulos, para todos
 * compartilharem o mesmo cache de tokens e a mesma resolução de organização.
 */
import { Router } from 'express';

import { API_VERSION } from '../config/version.js';
import { createRequireAuth, type GetUserByToken, supabaseGetUser } from '../middleware/auth.js';
import { createResolveTenant } from '../middleware/tenant.js';
import { createAuthController } from '../modules/auth/controller.js';
import { createAuthRouter } from '../modules/auth/routes.js';
import { createAuthService } from '../modules/auth/service.js';
import { createMetricsController } from '../modules/metrics/controller.js';
import { createMetricsRepository, type MetricsRepository } from '../modules/metrics/repository.js';
import {
  createMetricDefinitionsRouter,
  createMetricModelsRouter,
} from '../modules/metrics/routes.js';
import { createMetricsService } from '../modules/metrics/service.js';
import { createOrganizationsController } from '../modules/organizations/controller.js';
import {
  createOrganizationsRepository,
  type OrganizationsRepository,
} from '../modules/organizations/repository.js';
import { createOrganizationsRouter } from '../modules/organizations/routes.js';
import { createOrganizationsService } from '../modules/organizations/service.js';

import type { DbClient } from '../infrastructure/db/index.js';
import type { SupabaseClients } from '../infrastructure/supabase.js';

export const API_V1_PREFIX = '/api/v1';

export interface RouteDescriptor {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  description: string;
}

export const ROUTES: readonly RouteDescriptor[] = [
  { method: 'GET', path: `${API_V1_PREFIX}`, description: 'Lista as rotas disponíveis' },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/me`,
    description: 'Usuário autenticado, organização atual e papel',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/organizations`,
    description: 'Onboarding: cria a organização e torna o usuário owner',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/organizations/current`,
    description: 'Organização atual',
  },
  {
    method: 'PATCH',
    path: `${API_V1_PREFIX}/organizations/current`,
    description: 'Atualiza nome/slug da organização (owner ou admin)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/organizations/current/users`,
    description: 'Usuários da organização e seus papéis',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/organizations/current/users`,
    description: 'Convida ou cria um usuário na organização (owner ou admin)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/metrics`,
    description: 'Lista as definições de métrica',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metrics`,
    description: 'Cria uma definição (owner ou admin)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/metrics/:id`,
    description: 'Definição e configuração ativa',
  },
  {
    method: 'PATCH',
    path: `${API_V1_PREFIX}/metrics/:id`,
    description: 'Atualiza a definição (owner ou admin)',
  },
  {
    method: 'DELETE',
    path: `${API_V1_PREFIX}/metrics/:id`,
    description: 'Apaga se nunca usada, senão desativa (owner ou admin)',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metrics/:id/preview-score`,
    description: 'Simula o score da métrica com o motor sobre valores de exemplo',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/metric-models`,
    description: 'Lista os modelos de métricas',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metric-models`,
    description: 'Cria um modelo (owner ou admin)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/metric-models/:id`,
    description: 'Modelo com as versões e itens',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metric-models/:id/versions`,
    description: 'Cria um rascunho de versão (owner ou admin)',
  },
  {
    method: 'PATCH',
    path: `${API_V1_PREFIX}/metric-models/:id/versions/:version`,
    description: 'Edita um rascunho (owner ou admin)',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metric-models/:id/versions/:version/activate`,
    description: 'Ativa a versão: pesos somam 100 %, a anterior é arquivada (owner ou admin)',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metric-models/:id/rebalance`,
    description: 'Proposta de pesos redistribuídos proporcionalmente (não salva)',
  },
];

export interface ApiV1Dependencies {
  db: DbClient;
  supabase: SupabaseClients;
  /** Testes: substitui a validação do token no Supabase. */
  getUser?: GetUserByToken;
  /** Testes: substitui a persistência de organizações. */
  organizationsRepository?: OrganizationsRepository;
  /** Testes: substitui a persistência de métricas e modelos. */
  metricsRepository?: MetricsRepository;
}

export function createApiV1Router(deps: ApiV1Dependencies): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      name: 'inovaapss-api',
      version: API_VERSION,
      routes: ROUTES,
      links: {
        health: '/health',
        ready: '/ready',
        docs: '/api/docs',
        openapi: '/api/docs.json',
      },
    });
  });

  const organizationsRepository =
    deps.organizationsRepository ?? createOrganizationsRepository(() => deps.db.getDb());
  const requireAuth = createRequireAuth({
    getUser: deps.getUser ?? supabaseGetUser(deps.supabase),
  });
  const resolveTenant = createResolveTenant((authUserId) =>
    organizationsRepository.findMembershipByUser(authUserId),
  );

  const authService = createAuthService(organizationsRepository);
  router.use(
    createAuthRouter({
      requireAuth,
      resolveTenant,
      controller: createAuthController(authService),
    }),
  );

  const organizationsService = createOrganizationsService({
    repository: organizationsRepository,
    supabase: deps.supabase,
  });
  router.use(
    '/organizations',
    createOrganizationsRouter({
      requireAuth,
      resolveTenant,
      controller: createOrganizationsController(organizationsService),
    }),
  );

  const metricsRepository =
    deps.metricsRepository ?? createMetricsRepository(() => deps.db.getDb());
  const metricsController = createMetricsController(createMetricsService(metricsRepository));
  router.use(
    '/metrics',
    createMetricDefinitionsRouter({ requireAuth, resolveTenant, controller: metricsController }),
  );
  router.use(
    '/metric-models',
    createMetricModelsRouter({ requireAuth, resolveTenant, controller: metricsController }),
  );

  return router;
}
