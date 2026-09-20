/**
 * §36 — portfolio_clients: as empresas monitoradas pela organização (§4 "Portfolio Client").
 *
 * - `external_code` é o código do cliente no sistema de origem (ex.: `cliente_id` da planilha);
 *   único por organização, é a chave que o importador (Etapa 7) usa para casar linhas.
 * - `status` `archived` é o "apagar" do produto: DELETE /clients/:id só arquiva (§37).
 * - `strategic_importance` (1–5, padrão 3) entra no impacto comercial da prioridade (§28).
 *
 * RLS (§5): select para membros da organização; escrita para owner/admin/analyst; delete só
 * owner/admin. As funções auxiliares (SECURITY DEFINER) vêm da migration
 * 20260919205500_auth_organizations_rls.sql. A API fala como service_role e ignora RLS — o
 * isolamento nela é o filtro por organization_id em toda query.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';

import { PORTFOLIO_CLIENT_STATUSES } from '@inovaapss/validation';

import { organizations } from './organizations.js';

export const portfolioClientStatusEnum = pgEnum(
  'portfolio_client_status',
  PORTFOLIO_CLIENT_STATUSES,
);

export const portfolioClients = pgTable(
  'portfolio_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Código no sistema de origem; único por organização quando informado. */
    externalCode: text('external_code'),
    name: text('name').notNull(),
    segment: text('segment'),
    size: text('size'),
    status: portfolioClientStatusEnum('status').notNull().default('active'),
    strategicImportance: smallint('strategic_importance').notNull().default(3),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('portfolio_clients_org_external_code_unique').on(
      table.organizationId,
      table.externalCode,
    ),
    index('portfolio_clients_organization_idx').on(table.organizationId),
    index('portfolio_clients_org_status_idx').on(table.organizationId, table.status),
    index('portfolio_clients_org_segment_idx').on(table.organizationId, table.segment),
    check(
      'portfolio_clients_strategic_importance_check',
      sql`${table.strategicImportance} between 1 and 5`,
    ),
    pgPolicy('portfolio_clients_select_member', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.organizationId} in (select public.current_user_organization_ids())`,
    }),
    pgPolicy('portfolio_clients_insert_writer', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin', 'analyst')`,
    }),
    pgPolicy('portfolio_clients_update_writer', {
      for: 'update',
      to: authenticatedRole,
      using: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin', 'analyst')`,
      withCheck: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin', 'analyst')`,
    }),
    pgPolicy('portfolio_clients_delete_owner_admin', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin')`,
    }),
  ],
).enableRLS();

export type PortfolioClientRow = typeof portfolioClients.$inferSelect;
export type NewPortfolioClientRow = typeof portfolioClients.$inferInsert;
