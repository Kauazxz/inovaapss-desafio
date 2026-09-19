/**
 * Casos de uso de organizações (§4, §37): onboarding, dados da organização atual e usuários.
 * Regras de papel (quem pode o quê) vivem aqui; o controller só valida e responde.
 */
import { ConflictError, ForbiddenError } from '../../middleware/http-errors.js';
import { NotFoundError } from '../../shared/errors.js';

import type { OrganizationsRepository } from './repository.js';
import type {
  CreateOrganizationInput,
  InviteMemberInput,
  InviteMemberResult,
  Organization,
  OrganizationMember,
  UpdateOrganizationInput,
} from './types.js';
import type { SupabaseClients } from '../../infrastructure/supabase.js';
import type { TenantContext } from '../../middleware/tenant.js';

export interface OrganizationsService {
  createForUser(authUserId: string, input: CreateOrganizationInput): Promise<Organization>;
  getCurrent(tenant: TenantContext): Promise<Organization>;
  updateCurrent(tenant: TenantContext, patch: UpdateOrganizationInput): Promise<Organization>;
  listMembers(tenant: TenantContext): Promise<OrganizationMember[]>;
  inviteMember(tenant: TenantContext, input: InviteMemberInput): Promise<InviteMemberResult>;
}

/** Código do Postgres para violação de unique (slug repetido numa corrida). */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

function slugTaken(): ConflictError {
  return new ConflictError('Já existe uma organização com este slug.', 'SLUG_TAKEN');
}

export interface OrganizationsServiceDeps {
  repository: OrganizationsRepository;
  supabase: SupabaseClients;
}

export function createOrganizationsService({
  repository,
  supabase,
}: OrganizationsServiceDeps): OrganizationsService {
  return {
    async createForUser(authUserId, input) {
      const existing = await repository.findMembershipByUser(authUserId);
      if (existing !== null) {
        throw new ConflictError(
          'Seu usuário já pertence a uma organização.',
          'ALREADY_IN_ORGANIZATION',
        );
      }
      if ((await repository.findBySlug(input.slug)) !== null) {
        throw slugTaken();
      }
      try {
        return await repository.createWithOwner({
          name: input.name,
          slug: input.slug,
          ownerAuthUserId: authUserId,
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw slugTaken();
        throw err;
      }
    },

    async getCurrent(tenant) {
      const organization = await repository.findById(tenant.organizationId);
      if (organization === null) {
        throw new NotFoundError('Organização não encontrada.');
      }
      return organization;
    },

    async updateCurrent(tenant, patch) {
      if (patch.slug !== undefined) {
        const other = await repository.findBySlug(patch.slug);
        if (other !== null && other.id !== tenant.organizationId) {
          throw slugTaken();
        }
      }
      try {
        const updated = await repository.update(tenant.organizationId, patch);
        if (updated === null) {
          throw new NotFoundError('Organização não encontrada.');
        }
        return updated;
      } catch (err) {
        if (isUniqueViolation(err)) throw slugTaken();
        throw err;
      }
    },

    async listMembers(tenant) {
      return repository.listMembers(tenant.organizationId);
    },

    async inviteMember(tenant, input) {
      // Só o owner pode nomear outro owner; admin convida até admin.
      if (input.role === 'owner' && tenant.role !== 'owner') {
        throw new ForbiddenError('Somente o owner pode atribuir o papel "owner".');
      }

      const existingUserId = await repository.findAuthUserIdByEmail(input.email);
      let authUserId: string;
      let outcome: InviteMemberResult['outcome'];

      if (existingUserId !== null) {
        authUserId = existingUserId;
        outcome = 'linked';
      } else {
        const admin = supabase.getAdmin().auth.admin;
        if (input.password !== undefined) {
          const { data, error } = await admin.createUser({
            email: input.email,
            password: input.password,
            email_confirm: true,
          });
          if (error || !data.user) {
            throw new ConflictError(
              `Não foi possível criar o usuário no Supabase Auth: ${error?.message ?? 'resposta vazia'}.`,
              'AUTH_USER_CREATE_FAILED',
            );
          }
          authUserId = data.user.id;
          outcome = 'created';
        } else {
          const { data, error } = await admin.inviteUserByEmail(input.email);
          if (error || !data.user) {
            throw new ConflictError(
              `Não foi possível enviar o convite: ${error?.message ?? 'resposta vazia'}.`,
              'AUTH_INVITE_FAILED',
            );
          }
          authUserId = data.user.id;
          outcome = 'invited';
        }
      }

      const already = await repository.findMember(tenant.organizationId, authUserId);
      if (already !== null) {
        throw new ConflictError('Este usuário já faz parte da organização.', 'ALREADY_MEMBER');
      }

      try {
        const member = await repository.addMember({
          organizationId: tenant.organizationId,
          authUserId,
          role: input.role,
        });
        return { member, outcome };
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError('Este usuário já faz parte da organização.', 'ALREADY_MEMBER');
        }
        throw err;
      }
    },
  };
}
