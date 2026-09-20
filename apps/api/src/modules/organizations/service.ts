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
  UpdateMemberRoleInput,
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
  updateMemberRole(
    tenant: TenantContext,
    authUserId: string,
    input: UpdateMemberRoleInput,
  ): Promise<OrganizationMember>;
  removeMember(tenant: TenantContext, authUserId: string): Promise<void>;
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

/**
 * Proteções de §4/§5 para qualquer mexida em um vínculo já existente:
 *   - só o owner promove alguém a owner e só o owner mexe no papel de outro owner;
 *   - ninguém remove o próprio acesso (quem sai é removido por outra pessoa);
 *   - a organização nunca fica sem nenhum owner — nem quando o próprio owner se rebaixa.
 * Ficam no service, não na tela: a API é quem garante.
 */
function assertNotSelf(tenant: TenantContext, authUserId: string, message: string): void {
  if (tenant.userId === authUserId) {
    throw new ForbiddenError(message, 'CANNOT_CHANGE_SELF');
  }
}

function assertOwnerOnly(tenant: TenantContext, message: string): void {
  if (tenant.role !== 'owner') {
    throw new ForbiddenError(message);
  }
}

export interface OrganizationsServiceDeps {
  repository: OrganizationsRepository;
  supabase: SupabaseClients;
}

export function createOrganizationsService({
  repository,
  supabase,
}: OrganizationsServiceDeps): OrganizationsService {
  const service: OrganizationsService = {
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

      // A consulta a auth.users é só interna: o resultado nunca chega à resposta. Conta nova →
      // convite por e-mail (quem prova posse do e-mail é o link); conta existente → só o vínculo.
      // Nos dois casos a resposta é a mesma (201 { member }), para a rota não servir de oráculo
      // de "este e-mail tem conta?" entre organizações. Nunca se cria conta com senha por aqui.
      let authUserId = await repository.findAuthUserIdByEmail(input.email);
      if (authUserId === null) {
        const { data, error } = await supabase.getAdmin().auth.admin.inviteUserByEmail(input.email);
        if (error || !data.user) {
          throw new ConflictError(
            'Não foi possível enviar o convite agora. Tente de novo em instantes.',
            'AUTH_INVITE_FAILED',
          );
        }
        authUserId = data.user.id;
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
        return { member };
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError('Este usuário já faz parte da organização.', 'ALREADY_MEMBER');
        }
        throw err;
      }
    },

    async updateMemberRole(tenant, authUserId, input) {
      const member = await repository.findMember(tenant.organizationId, authUserId);
      if (member === null) {
        throw new NotFoundError('Este usuário não faz parte da organização.');
      }
      if (input.role === 'owner') {
        assertOwnerOnly(tenant, 'Somente o owner pode atribuir o papel "owner".');
      }
      if (member.role === 'owner') {
        assertOwnerOnly(tenant, 'Somente o owner pode mudar o papel de outro owner.');
        if (input.role !== 'owner') {
          await assertNotLastOwner(tenant.organizationId);
        }
      }
      if (member.role === input.role) {
        return member;
      }
      const updated = await repository.updateMemberRole(
        tenant.organizationId,
        authUserId,
        input.role,
      );
      if (updated === null) {
        throw new NotFoundError('Este usuário não faz parte da organização.');
      }
      return updated;
    },

    async removeMember(tenant, authUserId) {
      assertNotSelf(
        tenant,
        authUserId,
        'Você não pode remover o seu próprio acesso. Peça a outro owner ou admin.',
      );
      const member = await repository.findMember(tenant.organizationId, authUserId);
      if (member === null) {
        throw new NotFoundError('Este usuário não faz parte da organização.');
      }
      if (member.role === 'owner') {
        assertOwnerOnly(tenant, 'Somente o owner pode remover outro owner.');
        await assertNotLastOwner(tenant.organizationId);
      }
      const removed = await repository.removeMember(tenant.organizationId, authUserId);
      if (!removed) {
        throw new NotFoundError('Este usuário não faz parte da organização.');
      }
    },
  };

  /** Impede que o último owner perca a posse: a organização ficaria sem quem a administra. */
  async function assertNotLastOwner(organizationId: string): Promise<void> {
    const owners = await repository.countOwners(organizationId);
    if (owners <= 1) {
      throw new ConflictError(
        'A organização precisa de pelo menos um owner. Promova outra pessoa a owner antes.',
        'LAST_OWNER',
      );
    }
  }

  return service;
}
