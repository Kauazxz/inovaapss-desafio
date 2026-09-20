/**
 * Persistência de organizations e organization_users (Drizzle).
 *
 * Regra da §5: toda consulta que devolve dados de uma organização recebe o organization_id do
 * tenant e filtra por ele. O único ponto que parte do usuário (findMembershipByUser) existe para
 * o middleware de tenant descobrir a organização.
 *
 * Recebe `getDb` (e não a instância) para a conexão só abrir na primeira consulta: sem
 * DATABASE_URL a API sobe, e as rotas autenticadas respondem 503 DATABASE_NOT_CONFIGURED.
 */
import { and, asc, count, eq, sql } from 'drizzle-orm';

import type { OrganizationRole } from '@inovaapss/shared';

import { organizations, organizationUsers } from '../../db/schema/index.js';

import type { Organization, OrganizationMember } from './types.js';
import type { Database } from '../../infrastructure/db/index.js';
import type { Membership } from '../../middleware/tenant.js';

export interface OrganizationsRepository {
  findMembershipByUser(authUserId: string): Promise<Membership | null>;
  findById(organizationId: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  /** Cria a organização e o vínculo owner na mesma transação. */
  createWithOwner(input: {
    name: string;
    slug: string;
    ownerAuthUserId: string;
  }): Promise<Organization>;
  update(
    organizationId: string,
    patch: { name?: string | undefined; slug?: string | undefined },
  ): Promise<Organization | null>;
  listMembers(organizationId: string): Promise<OrganizationMember[]>;
  findMember(organizationId: string, authUserId: string): Promise<OrganizationMember | null>;
  addMember(input: {
    organizationId: string;
    authUserId: string;
    role: OrganizationRole;
  }): Promise<OrganizationMember>;
  /** Troca o papel de um membro; null quando o vínculo não existe nesta organização. */
  updateMemberRole(
    organizationId: string,
    authUserId: string,
    role: OrganizationRole,
  ): Promise<OrganizationMember | null>;
  /** Apaga o vínculo; false quando ele não existia. */
  removeMember(organizationId: string, authUserId: string): Promise<boolean>;
  /** Quantos owners a organização tem (para nunca ficar sem nenhum). */
  countOwners(organizationId: string): Promise<number>;
  /** Procura um usuário em auth.users pelo e-mail (sem diferenciar maiúsculas). */
  findAuthUserIdByEmail(email: string): Promise<string | null>;
}

type OrganizationRow = typeof organizations.$inferSelect;

function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type MemberRow = {
  id: string;
  organization_id: string;
  auth_user_id: string;
  email: string | null;
  role: OrganizationRole;
  created_at: string | Date;
};

function toMember(row: MemberRow): OrganizationMember {
  return {
    id: row.id,
    organizationId: row.organization_id,
    authUserId: row.auth_user_id,
    email: row.email,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * O e-mail mora em auth.users (schema do Supabase, fora do Drizzle), por isso a listagem de
 * membros usa SQL direto com o join — uma consulta só, sempre filtrada por organization_id.
 */
const memberSelect = sql`
  select ou.id, ou.organization_id, ou.auth_user_id, ou.role, ou.created_at, u.email
  from public.organization_users ou
  left join auth.users u on u.id = ou.auth_user_id
`;

export function createOrganizationsRepository(getDb: () => Database): OrganizationsRepository {
  const repository: OrganizationsRepository = {
    async findMembershipByUser(authUserId) {
      const rows = await getDb()
        .select({ organizationId: organizationUsers.organizationId, role: organizationUsers.role })
        .from(organizationUsers)
        .where(eq(organizationUsers.authUserId, authUserId))
        .orderBy(asc(organizationUsers.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async findById(organizationId) {
      const rows = await getDb()
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toOrganization(row);
    },

    async findBySlug(slug) {
      const rows = await getDb()
        .select()
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toOrganization(row);
    },

    async createWithOwner({ name, slug, ownerAuthUserId }) {
      return getDb().transaction(async (tx) => {
        const inserted = await tx.insert(organizations).values({ name, slug }).returning();
        const organization = inserted[0];
        if (organization === undefined) {
          throw new Error('Falha ao criar a organização.');
        }
        await tx.insert(organizationUsers).values({
          organizationId: organization.id,
          authUserId: ownerAuthUserId,
          role: 'owner',
        });
        return toOrganization(organization);
      });
    },

    async update(organizationId, patch) {
      const values: Partial<typeof organizations.$inferInsert> = { updatedAt: new Date() };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.slug !== undefined) values.slug = patch.slug;
      const rows = await getDb()
        .update(organizations)
        .set(values)
        .where(eq(organizations.id, organizationId))
        .returning();
      const row = rows[0];
      return row === undefined ? null : toOrganization(row);
    },

    async listMembers(organizationId) {
      const rows = await getDb().execute<MemberRow>(
        sql`${memberSelect} where ou.organization_id = ${organizationId} order by ou.created_at asc`,
      );
      return Array.from(rows).map(toMember);
    },

    async findMember(organizationId, authUserId) {
      const rows = await getDb().execute<MemberRow>(
        sql`${memberSelect} where ou.organization_id = ${organizationId} and ou.auth_user_id = ${authUserId} limit 1`,
      );
      const row = Array.from(rows)[0];
      return row === undefined ? null : toMember(row);
    },

    async addMember({ organizationId, authUserId, role }) {
      await getDb()
        .insert(organizationUsers)
        .values({ organizationId, authUserId, role })
        .onConflictDoNothing({
          target: [organizationUsers.organizationId, organizationUsers.authUserId],
        });
      const member = await repository.findMember(organizationId, authUserId);
      if (member === null) {
        throw new Error('Falha ao registrar o vínculo do usuário com a organização.');
      }
      return member;
    },

    async updateMemberRole(organizationId, authUserId, role) {
      await getDb()
        .update(organizationUsers)
        .set({ role })
        .where(
          and(
            eq(organizationUsers.organizationId, organizationId),
            eq(organizationUsers.authUserId, authUserId),
          ),
        );
      return repository.findMember(organizationId, authUserId);
    },

    async removeMember(organizationId, authUserId) {
      const rows = await getDb()
        .delete(organizationUsers)
        .where(
          and(
            eq(organizationUsers.organizationId, organizationId),
            eq(organizationUsers.authUserId, authUserId),
          ),
        )
        .returning({ id: organizationUsers.id });
      return rows.length > 0;
    },

    async countOwners(organizationId) {
      const rows = await getDb()
        .select({ total: count() })
        .from(organizationUsers)
        .where(
          and(
            eq(organizationUsers.organizationId, organizationId),
            eq(organizationUsers.role, 'owner'),
          ),
        );
      return Number(rows[0]?.total ?? 0);
    },

    async findAuthUserIdByEmail(email) {
      const rows = await getDb().execute<{ id: string }>(
        sql`select id from auth.users where lower(email) = lower(${email}) limit 1`,
      );
      return Array.from(rows)[0]?.id ?? null;
    },
  };

  return repository;
}
