/**
 * §36 `alerts` — a fila de "olhe isto agora".
 *
 * Um alerta vem de um gatilho crítico (§27): peso e gatilho são coisas diferentes. O peso entra
 * no cálculo da saúde; o gatilho gera ação imediata e pode impor um piso de prioridade.
 *
 * Chave natural: (cliente, gatilho, período). Recalcular o mesmo período atualiza o alerta em vez
 * de criar outro, e quem já reconheceu ou resolveu não vê o alerta voltar para "aberto".
 */
import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  date,
  index,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { portfolioClients } from './clients.js';
import { metricDefinitions } from './metrics.js';
import { organizations } from './organizations.js';

const memberOf = (organizationId: AnyPgColumn): SQL =>
  sql`${organizationId} in (select public.current_user_organization_ids())`;
const writerOf = (organizationId: AnyPgColumn): SQL =>
  sql`public.current_user_role_in(${organizationId}) in ('owner', 'admin', 'analyst')`;

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    portfolioClientId: uuid('portfolio_client_id')
      .notNull()
      .references(() => portfolioClients.id, { onDelete: 'cascade' }),
    metricDefinitionId: uuid('metric_definition_id').references(() => metricDefinitions.id, {
      onDelete: 'set null',
    }),
    /** Identificador do gatilho no modelo (ex.: `sla_abaixo_de_70`). */
    triggerId: text('trigger_id').notNull(),
    /** INFO | WARNING | CRITICAL. */
    severity: text('severity').notNull().default('WARNING'),
    /** open | acknowledged | resolved. */
    status: text('status').notNull().default('open'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    /** Piso de prioridade imposto pelo gatilho (§27). */
    priorityFloor: numeric('priority_floor', { precision: 5, scale: 2, mode: 'number' }),
    /** Período do snapshot que gerou o alerta. */
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    /** Estado do cliente no momento, para a tela não precisar cruzar tabelas. */
    metadataJson: jsonb('metadata_json'),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('alerts_client_trigger_period_unique').on(
      table.portfolioClientId,
      table.triggerId,
      table.periodEnd,
    ),
    index('alerts_organization_status_idx').on(table.organizationId, table.status),
    pgPolicy('alerts_select_member', {
      for: 'select',
      to: 'authenticated',
      using: memberOf(table.organizationId),
    }),
    pgPolicy('alerts_insert_writer', {
      for: 'insert',
      to: 'authenticated',
      withCheck: writerOf(table.organizationId),
    }),
    pgPolicy('alerts_update_writer', {
      for: 'update',
      to: 'authenticated',
      using: writerOf(table.organizationId),
      withCheck: writerOf(table.organizationId),
    }),
    pgPolicy('alerts_delete_writer', {
      for: 'delete',
      to: 'authenticated',
      using: writerOf(table.organizationId),
    }),
  ],
).enableRLS();
