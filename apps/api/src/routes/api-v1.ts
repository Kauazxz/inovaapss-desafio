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
];

export interface ApiV1Dependencies {
  db: DbClient;
  supabase: SupabaseClients;
  /** Testes: substitui a validação do token no Supabase. */
  getUser?: GetUserByToken;
  /** Testes: substitui a persistência de organizações. */
  organizationsRepository?: OrganizationsRepository;
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

  return router;
}
