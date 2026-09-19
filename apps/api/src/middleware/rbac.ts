/**
 * RBAC — passo 5 do fluxo da §5. `requireRole('owner', 'admin')` deixa passar só quem tem um
 * dos papéis listados na organização atual (§4: owner > admin > analyst > viewer).
 * Precisa rodar depois de resolveTenant/requireTenant.
 */
import type { OrganizationRole } from '@inovaapss/shared';

import { ForbiddenError, NoOrganizationError } from './http-errors.js';

import type { RequestHandler } from 'express';

export function requireRole(...roles: readonly OrganizationRole[]): RequestHandler {
  const allowed = new Set<OrganizationRole>(roles);
  return (req, _res, next) => {
    if (req.tenant === undefined) {
      next(new NoOrganizationError());
      return;
    }
    if (!allowed.has(req.tenant.role)) {
      next(
        new ForbiddenError(
          `Esta ação exige o papel ${formatRoles(roles)}; o seu é "${req.tenant.role}".`,
        ),
      );
      return;
    }
    next();
  };
}

function formatRoles(roles: readonly OrganizationRole[]): string {
  return roles.map((role) => `"${role}"`).join(' ou ');
}

/** Papéis que podem administrar a organização (editar dados e convidar usuários). */
export const MANAGER_ROLES: readonly OrganizationRole[] = ['owner', 'admin'];
