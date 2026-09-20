/**
 * §36 — plans e contracts (§4 "Contract" e "Plan").
 *
 * - `plans`: nível de atendimento (Básico, Premium...). Nome único por organização. As
 *   políticas de SLA (Etapa 5) apontam para o plano.
 * - `contracts`: contrato de um cliente monitorado. Só UM contrato `active` por cliente por
 *   vez — o índice parcial `contracts_one_active_per_client` garante isso no banco e o service
 *   encerra o anterior ao ativar um novo (docs/CLIENTS.md).
 * - `contracted_sla_hours`: SLA contratual em horas (`sla_contratado_h` da planilha). É o
 *   valor simples da Etapa 2; a Etapa 5 refina em `sla_policies` por severidade/tipo.
 * - `monthly_value` numeric(12,2): o driver devolve string; o repository converte para número.
 *
 * RLS igual a portfolio_clients (membro lê; owner/admin/analyst escreve; owner/admin apaga).
 */
import { sql } from 'drizzle-orm';
import {
  char,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';

import { CONTRACT_STATUSES } from '@inovaapss/validation';

import { portfolioClients } from './clients.js';
import { organizations } from './organizations.js';

export const contractStatusEnum = pgEnum('contract_status', CONTRACT_STATUSES);

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('plans_org_name_unique').on(table.organizationId, table.name),
    index('plans_organization_idx').on(table.organizationId),
    pgPolicy('plans_select_member', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.organizationId} in (select public.current_user_organization_ids())`,
    }),
    pgPolicy('plans_insert_writer', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin', 'analyst')`,
    }),
    pgPolicy('plans_update_writer', {
      for: 'update',
      to: authenticatedRole,
      using: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin', 'analyst')`,
      withCheck: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin', 'analyst')`,
    }),
    pgPolicy('plans_delete_owner_admin', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin')`,
    }),
  ],
).enableRLS();

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    portfolioClientId: uuid('portfolio_client_id')
      .notNull()
      .references(() => portfolioClients.id, { onDelete: 'cascade' }),
    /** Plano do contrato; pode ficar vazio até a organização cadastrar os seus planos. */
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
    monthlyValue: numeric('monthly_value', { precision: 12, scale: 2 }).notNull().default('0'),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    status: contractStatusEnum('status').notNull().default('active'),
    contractedSlaHours: integer('contracted_sla_hours'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('contracts_organization_idx').on(table.organizationId),
    index('contracts_org_client_idx').on(table.organizationId, table.portfolioClientId),
    index('contracts_org_plan_idx').on(table.organizationId, table.planId),
    // Um único contrato ativo por cliente (índice parcial).
    uniqueIndex('contracts_one_active_per_client')
      .on(table.portfolioClientId)
      .where(sql`${table.status} = 'active'`),
    pgPolicy('contracts_select_member', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.organizationId} in (select public.current_user_organization_ids())`,
    }),
    pgPolicy('contracts_insert_writer', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin', 'analyst')`,
    }),
    pgPolicy('contracts_update_writer', {
      for: 'update',
      to: authenticatedRole,
      using: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin', 'analyst')`,
      withCheck: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin', 'analyst')`,
    }),
    pgPolicy('contracts_delete_owner_admin', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`public.current_user_role_in(${table.organizationId}) in ('owner', 'admin')`,
    }),
  ],
).enableRLS();

export type PlanRow = typeof plans.$inferSelect;
export type NewPlanRow = typeof plans.$inferInsert;
export type ContractRow = typeof contracts.$inferSelect;
export type NewContractRow = typeof contracts.$inferInsert;
