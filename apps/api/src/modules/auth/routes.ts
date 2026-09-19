/**
 * Rotas de sessão (§37):
 *   GET /me   usuário autenticado, organização atual e papel (organization: null sem vínculo)
 *
 * Login, logout e recuperação de senha acontecem direto no Supabase Auth a partir do
 * navegador (docs/AUTH.md); a API só valida o JWT.
 */
import { Router } from 'express';

import type { AuthController } from './controller.js';
import type { RequestHandler } from 'express';

export interface AuthRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  controller: AuthController;
}

export function createAuthRouter({
  requireAuth,
  resolveTenant,
  controller,
}: AuthRouterOptions): Router {
  const router = Router();
  router.get('/me', requireAuth, resolveTenant, controller.me);
  return router;
}
