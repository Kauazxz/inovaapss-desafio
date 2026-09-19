/**
 * Router base /api/v1 (§37). Cada módulo registra o seu sub-router aqui, numa linha:
 *   router.use('/clients', createClientsRouter());
 * e acrescenta a entrada correspondente em ROUTES para aparecer no GET /api/v1.
 */
import { Router } from 'express';

import { API_VERSION } from '../config/version.js';

export const API_V1_PREFIX = '/api/v1';

export interface RouteDescriptor {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  description: string;
}

export const ROUTES: readonly RouteDescriptor[] = [
  { method: 'GET', path: `${API_V1_PREFIX}`, description: 'Lista as rotas disponíveis' },
];

export function createApiV1Router(): Router {
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

  return router;
}
