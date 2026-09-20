/**
 * Repositório em memória para os testes das rotas: mesma interface do repositório Drizzle,
 * sem banco. Também simula a violação de unique do slug (código 23505 do Postgres).
 */
import { randomUUID } from 'node:crypto';

import type { OrganizationsRepository } from '../repository.js';
import type { Organization, OrganizationMember } from '../types.js';

export interface FakeAuthUser {
  id: string;
  email: string;
}

export interface FakeOrganizationsRepository extends OrganizationsRepository {
  organizations: Organization[];
  members: OrganizationMember[];
  authUsers: FakeAuthUser[];
}

function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });
}

export function createFakeOrganizationsRepository(
  seed: {
    organizations?: Organization[];
    members?: OrganizationMember[];
    authUsers?: FakeAuthUser[];
  } = {},
): FakeOrganizationsRepository {
  const organizations = [...(seed.organizations ?? [])];
  const members = [...(seed.members ?? [])];
  const authUsers = [...(seed.authUsers ?? [])];

  const withEmail = (member: OrganizationMember): OrganizationMember => ({
    ...member,
    email: authUsers.find((u) => u.id === member.authUserId)?.email ?? member.email,
  });

  return {
    organizations,
    members,
    authUsers,

    async findMembershipByUser(authUserId) {
      const member = members
        .filter((m) => m.authUserId === authUserId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      return member ? { organizationId: member.organizationId, role: member.role } : null;
    },

    async findById(organizationId) {
      return organizations.find((o) => o.id === organizationId) ?? null;
    },

    async findBySlug(slug) {
      return organizations.find((o) => o.slug === slug) ?? null;
    },

    async createWithOwner({ name, slug, ownerAuthUserId }) {
      if (organizations.some((o) => o.slug === slug)) throw uniqueViolation();
      const now = new Date().toISOString();
      const organization: Organization = {
        id: randomUUID(),
        name,
        slug,
        createdAt: now,
        updatedAt: now,
      };
      organizations.push(organization);
      members.push({
        id: randomUUID(),
        organizationId: organization.id,
        authUserId: ownerAuthUserId,
        email: null,
        role: 'owner',
        createdAt: now,
      });
      return organization;
    },

    async update(organizationId, patch) {
      const organization = organizations.find((o) => o.id === organizationId);
      if (!organization) return null;
      if (
        patch.slug !== undefined &&
        organizations.some((o) => o.slug === patch.slug && o.id !== organizationId)
      ) {
        throw uniqueViolation();
      }
      if (patch.name !== undefined) organization.name = patch.name;
      if (patch.slug !== undefined) organization.slug = patch.slug;
      organization.updatedAt = new Date().toISOString();
      return organization;
    },

    async listMembers(organizationId) {
      return members.filter((m) => m.organizationId === organizationId).map(withEmail);
    },

    async findMember(organizationId, authUserId) {
      const member = members.find(
        (m) => m.organizationId === organizationId && m.authUserId === authUserId,
      );
      return member ? withEmail(member) : null;
    },

    async addMember({ organizationId, authUserId, role }) {
      const existing = members.find(
        (m) => m.organizationId === organizationId && m.authUserId === authUserId,
      );
      if (existing) return withEmail(existing);
      const member: OrganizationMember = {
        id: randomUUID(),
        organizationId,
        authUserId,
        email: null,
        role,
        createdAt: new Date().toISOString(),
      };
      members.push(member);
      return withEmail(member);
    },

    async updateMemberRole(organizationId, authUserId, role) {
      const member = members.find(
        (m) => m.organizationId === organizationId && m.authUserId === authUserId,
      );
      if (!member) return null;
      member.role = role;
      return withEmail(member);
    },

    async removeMember(organizationId, authUserId) {
      const index = members.findIndex(
        (m) => m.organizationId === organizationId && m.authUserId === authUserId,
      );
      if (index < 0) return false;
      members.splice(index, 1);
      return true;
    },

    async countOwners(organizationId) {
      return members.filter((m) => m.organizationId === organizationId && m.role === 'owner')
        .length;
    },

    async findAuthUserIdByEmail(email) {
      return authUsers.find((u) => u.email.toLowerCase() === email.toLowerCase())?.id ?? null;
    },
  };
}
