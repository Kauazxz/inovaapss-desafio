/** Controller da sessão: sem regra de negócio (§3). */
import { getAuthUser } from '../../middleware/auth.js';

import type { AuthService } from './service.js';
import type { RequestHandler } from 'express';

export interface AuthController {
  me: RequestHandler;
}

export function createAuthController(service: AuthService): AuthController {
  return {
    async me(req, res) {
      const user = getAuthUser(req);
      res.json(await service.me(user, req.tenant));
    },
  };
}
