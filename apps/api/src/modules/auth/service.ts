/**
 * Caso de uso da sessão (§37 GET /me): junta o usuário autenticado (JWT validado pelo
 * requireAuth) com a organização e o papel resolvidos pelo middleware de tenant.
 */
import type { MeResponse } from './types.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { TenantContext } from '../../middleware/tenant.js';
import type { OrganizationsRepository } from '../organizations/repository.js';

export interface AuthService {
  me(user: AuthUser, tenant: TenantContext | undefined): Promise<MeResponse>;
}

export function createAuthService(repository: OrganizationsRepository): AuthService {
  return {
    async me(user, tenant) {
      const base = { user: { id: user.userId, email: user.email } };
      if (tenant === undefined) {
        return { ...base, organization: null, role: null };
      }
      const organization = await repository.findById(tenant.organizationId);
      if (organization === null) {
        // Vínculo apontando para uma organização que sumiu: trata como "sem organização".
        return { ...base, organization: null, role: null };
      }
      return { ...base, organization, role: tenant.role };
    },
  };
}
