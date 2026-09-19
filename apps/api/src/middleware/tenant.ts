/**
 * Tenant — passo 4 do fluxo da §5: identifica a organização do usuário autenticado.
 *
 * - `resolveTenant`: procura o vínculo em organization_users pelo auth_user_id e, se existir,
 *   define `req.tenant = { organizationId, role, userId }`. Sem vínculo segue em frente (é o
 *   caso do onboarding: GET /me e POST /organizations precisam funcionar sem organização).
 * - `requireTenant`: 403 NO_ORGANIZATION quando `req.tenant` não foi definido.
 *
 * Nesta etapa cada usuário pertence a UMA organização (a primeira encontrada). Suporte a várias
 * organizações por usuário (troca de contexto) fica para quando houver necessidade.
 */
import type { OrganizationRole } from '@inovaapss/shared';

import { getAuthUser } from './auth.js';
import { NoOrganizationError } from './http-errors.js';

import type { RequestHandler } from 'express';

export interface TenantContext {
  organizationId: string;
  role: OrganizationRole;
  userId: string;
}

declare global {
  // A augmentação de tipos do Express só funciona por namespace (é o padrão do @types/express).
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Organização e papel do usuário (definido por resolveTenant). */
      tenant?: TenantContext;
    }
  }
}

export interface Membership {
  organizationId: string;
  role: OrganizationRole;
}

/** Busca o vínculo do usuário; null quando ele ainda não pertence a nenhuma organização. */
export type FindMembership = (authUserId: string) => Promise<Membership | null>;

export function createResolveTenant(findMembership: FindMembership): RequestHandler {
  return async (req, _res, next) => {
    try {
      const user = getAuthUser(req);
      const membership = await findMembership(user.userId);
      if (membership !== null) {
        req.tenant = {
          organizationId: membership.organizationId,
          role: membership.role,
          userId: user.userId,
        };
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireTenant: RequestHandler = (req, _res, next) => {
  if (req.tenant === undefined) {
    next(new NoOrganizationError());
    return;
  }
  next();
};

/** Tenant da requisição; lança 403 se não houver (use depois de requireTenant). */
export function getTenant(req: { tenant?: TenantContext }): TenantContext {
  if (req.tenant === undefined) {
    throw new NoOrganizationError();
  }
  return req.tenant;
}
