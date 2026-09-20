/**
 * §36 — metric_definitions, metric_models, metric_model_versions e metric_model_items
 * (motor genérico de métricas, Etapa 3). metric_values e os snapshots ficam para a Etapa 4,
 * que precisa de clientes.
 *
 * Enums do Postgres espelham os `as const` de @inovaapss/shared (§6, §9, §31, §32).
 *
 * RLS (§5): ligado em todas as tabelas, reutilizando as funções SECURITY DEFINER da migration
 * 20260919205500_auth_organizations_rls.sql — `current_user_organization_ids()` (membro lê) e
 * `current_user_role_in(uuid)` (owner/admin escreve). A API fala com o banco como service_role e
 * ignora RLS; o isolamento nela é o filtro por organization_id em toda query do repositório.
 * metric_model_items não tem organization_id (§36): a policy chega à organização pela versão.
 */
import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  METRIC_DIRECTIONS,
  METRIC_MODEL_VERSION_STATUSES,
  METRIC_PERIODICITIES,
  METRIC_SOURCES,
  METRIC_TYPES,
  NORMALIZATION_STRATEGIES,
  WEIGHT_MODES,
} from '@inovaapss/shared';
import type {
  FormulaConfigInput,
  NormalizationConfigInput,
  ThresholdConfigInput,
  TriggerListInput,
} from '@inovaapss/validation';

import { organizations } from './organizations.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const metricTypeEnum = pgEnum('metric_type', METRIC_TYPES);
export const metricDirectionEnum = pgEnum('metric_direction', METRIC_DIRECTIONS);
export const metricSourceEnum = pgEnum('metric_source', METRIC_SOURCES);
export const metricPeriodicityEnum = pgEnum('metric_periodicity', METRIC_PERIODICITIES);
export const normalizationStrategyEnum = pgEnum('normalization_strategy', NORMALIZATION_STRATEGIES);
export const metricModelModeEnum = pgEnum('metric_model_mode', WEIGHT_MODES);
export const metricModelVersionStatusEnum = pgEnum(
  'metric_model_version_status',
  METRIC_MODEL_VERSION_STATUSES,
);

// ---------------------------------------------------------------------------
// Policies reutilizáveis
// ---------------------------------------------------------------------------

const memberOf = (organizationId: AnyPgColumn): SQL =>
  sql`${organizationId} in (select public.current_user_organization_ids())`;

const managerOf = (organizationId: AnyPgColumn): SQL =>
  sql`public.current_user_role_in(${organizationId}) in ('owner', 'admin')`;

/** select para membros da organização; insert/update/delete para owner/admin. */
function tenantPolicies(prefix: string, organizationId: AnyPgColumn) {
  return [
    pgPolicy(`${prefix}_select_member`, {
      for: 'select',
      to: 'authenticated',
      using: memberOf(organizationId),
    }),
    pgPolicy(`${prefix}_insert_owner_admin`, {
      for: 'insert',
      to: 'authenticated',
      withCheck: managerOf(organizationId),
    }),
    pgPolicy(`${prefix}_update_owner_admin`, {
      for: 'update',
      to: 'authenticated',
      using: managerOf(organizationId),
      withCheck: managerOf(organizationId),
    }),
    pgPolicy(`${prefix}_delete_owner_admin`, {
      for: 'delete',
      to: 'authenticated',
      using: managerOf(organizationId),
    }),
  ];
}

const weight = (name: string) => numeric(name, { precision: 6, scale: 4, mode: 'number' });

// ---------------------------------------------------------------------------
// metric_definitions (§6, §36)
// ---------------------------------------------------------------------------

export const metricDefinitions = pgTable(
  'metric_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Chave estável na organização (ex.: `sla_compliance`); `key` do MetricConfig do motor. */
    slug: text('slug').notNull(),
    description: text('description'),
    category: text('category'),
    metricType: metricTypeEnum('metric_type').notNull(),
    unit: text('unit'),
    direction: metricDirectionEnum('direction').notNull(),
    periodicity: metricPeriodicityEnum('periodicity').notNull().default('MONTHLY'),
    sourceType: metricSourceEnum('source_type').notNull().default('MANUAL'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('metric_definitions_org_slug_unique').on(table.organizationId, table.slug),
    index('metric_definitions_organization_idx').on(table.organizationId),
    ...tenantPolicies('metric_definitions', table.organizationId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// metric_models (§31, §32, §36)
// ---------------------------------------------------------------------------

export const metricModels = pgTable(
  'metric_models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mode: metricModelModeEnum('mode').notNull().default('ASSISTED'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('metric_models_organization_idx').on(table.organizationId),
    ...tenantPolicies('metric_models', table.organizationId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// metric_model_versions (§31)
// ---------------------------------------------------------------------------

export const metricModelVersions = pgTable(
  'metric_model_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    metricModelId: uuid('metric_model_id')
      .notNull()
      .references(() => metricModels.id, { onDelete: 'cascade' }),
    /** Redundante com o modelo, de propósito: toda tabela de negócio tem tenant (§4) e a RLS fica direta. */
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: metricModelVersionStatusEnum('status').notNull().default('draft'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('metric_model_versions_model_version_unique').on(
      table.metricModelId,
      table.version,
    ),
    index('metric_model_versions_organization_idx').on(table.organizationId),
    index('metric_model_versions_model_status_idx').on(table.metricModelId, table.status),
    ...tenantPolicies('metric_model_versions', table.organizationId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// metric_model_items (§8, §9, §27, §36)
// ---------------------------------------------------------------------------

const itemVersionMember = (versionId: AnyPgColumn): SQL =>
  sql`exists (select 1 from public.metric_model_versions v where v.id = ${versionId} and v.organization_id in (select public.current_user_organization_ids()))`;

const itemVersionManager = (versionId: AnyPgColumn): SQL =>
  sql`exists (select 1 from public.metric_model_versions v where v.id = ${versionId} and public.current_user_role_in(v.organization_id) in ('owner', 'admin'))`;

export const metricModelItems = pgTable(
  'metric_model_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    metricModelVersionId: uuid('metric_model_version_id')
      .notNull()
      .references(() => metricModelVersions.id, { onDelete: 'cascade' }),
    /** `restrict`: uma definição usada em alguma versão não é apagada (histórico, §31). */
    metricDefinitionId: uuid('metric_definition_id')
      .notNull()
      .references(() => metricDefinitions.id, { onDelete: 'restrict' }),
    weight: weight('weight').notNull(),
    currentWeight: weight('current_weight').notNull().default(0.45),
    trendWeight: weight('trend_weight').notNull().default(0.35),
    persistenceWeight: weight('persistence_weight').notNull().default(0.2),
    normalizationStrategy: normalizationStrategyEnum('normalization_strategy').notNull(),
    normalizationConfigJson: jsonb('normalization_config_json')
      .$type<NormalizationConfigInput>()
      .notNull(),
    thresholdConfigJson: jsonb('threshold_config_json').$type<ThresholdConfigInput>(),
    criticalTriggerConfigJson: jsonb('critical_trigger_config_json').$type<TriggerListInput>(),
    formulaConfigJson: jsonb('formula_config_json').$type<FormulaConfigInput>(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    uniqueIndex('metric_model_items_version_definition_unique').on(
      table.metricModelVersionId,
      table.metricDefinitionId,
    ),
    index('metric_model_items_definition_idx').on(table.metricDefinitionId),
    pgPolicy('metric_model_items_select_member', {
      for: 'select',
      to: 'authenticated',
      using: itemVersionMember(table.metricModelVersionId),
    }),
    pgPolicy('metric_model_items_insert_owner_admin', {
      for: 'insert',
      to: 'authenticated',
      withCheck: itemVersionManager(table.metricModelVersionId),
    }),
    pgPolicy('metric_model_items_update_owner_admin', {
      for: 'update',
      to: 'authenticated',
      using: itemVersionManager(table.metricModelVersionId),
      withCheck: itemVersionManager(table.metricModelVersionId),
    }),
    pgPolicy('metric_model_items_delete_owner_admin', {
      for: 'delete',
      to: 'authenticated',
      using: itemVersionManager(table.metricModelVersionId),
    }),
  ],
).enableRLS();

export type MetricDefinitionRow = typeof metricDefinitions.$inferSelect;
export type NewMetricDefinitionRow = typeof metricDefinitions.$inferInsert;
export type MetricModelRow = typeof metricModels.$inferSelect;
export type NewMetricModelRow = typeof metricModels.$inferInsert;
export type MetricModelVersionRow = typeof metricModelVersions.$inferSelect;
export type NewMetricModelVersionRow = typeof metricModelVersions.$inferInsert;
export type MetricModelItemRow = typeof metricModelItems.$inferSelect;
export type NewMetricModelItemRow = typeof metricModelItems.$inferInsert;
