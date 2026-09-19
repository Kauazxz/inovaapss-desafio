/**
 * §36 — organizations e organization_users (multiempresa, §4).
 *
 * `auth_user_id` é uma referência LÓGICA a auth.users do Supabase: não há FK porque o schema
 * `auth` pertence ao Supabase e o Drizzle não o gerencia. O vínculo é garantido pela API
 * (o usuário só entra em organization_users depois de existir no Supabase Auth).
 *
 * RLS e policies ficam numa migration manual (ver supabase/migrations/*auth_organizations_rls*).
 */
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { ORGANIZATION_ROLES } from '@inovaapss/shared';

export const organizationRoleEnum = pgEnum('organization_role', ORGANIZATION_ROLES);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('organizations_slug_unique').on(table.slug)],
);

export const organizationUsers = pgTable(
  'organization_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** id em auth.users (Supabase Auth). Referência lógica, sem FK. */
    authUserId: uuid('auth_user_id').notNull(),
    role: organizationRoleEnum('role').notNull().default('viewer'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('organization_users_org_user_unique').on(table.organizationId, table.authUserId),
    index('organization_users_auth_user_idx').on(table.authUserId),
    index('organization_users_organization_idx').on(table.organizationId),
  ],
);

export type OrganizationRow = typeof organizations.$inferSelect;
export type NewOrganizationRow = typeof organizations.$inferInsert;
export type OrganizationUserRow = typeof organizationUsers.$inferSelect;
export type NewOrganizationUserRow = typeof organizationUsers.$inferInsert;
