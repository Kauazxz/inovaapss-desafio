/**
 * §36 — calibration_runs (Etapa 12).
 *
 * Cada linha é uma pergunta feita ao passado: "com os pesos da versão X e uma janela de N dias,
 * o sistema teria avisado a tempo?". `parameters_json` guarda como a pergunta foi feita e
 * `results_json` a resposta completa (precision, recall, FPR, lead time, precision@5/@10 e os
 * pesos sugeridos), para o histórico continuar legível mesmo depois de o modelo mudar.
 *
 * A execução não altera nada: sugerir peso é proposta, e proposta só vira modelo quando alguém
 * cria a versão e a ATIVA (§32). Por isso não há FK para o rascunho gerado.
 *
 * RLS (§5): membro da organização lê; owner/admin escrevem — calibrar mexe na régua da carteira
 * inteira. As funções auxiliares SECURITY DEFINER vêm da migration
 * 20260919205500_auth_organizations_rls.sql.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';

import { CALIBRATION_RUN_STATUSES } from '@inovaapss/shared';

import { metricModelVersions } from './metrics.js';
import { organizations } from './organizations.js';

export const calibrationRunStatusEnum = pgEnum('calibration_run_status', CALIBRATION_RUN_STATUSES);

const memberCanRead = sql`organization_id in (select public.current_user_organization_ids())`;
const managerRoles = sql`public.current_user_role_in(organization_id) in ('owner', 'admin')`;

export const calibrationRuns = pgTable(
  'calibration_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Versão do modelo avaliada — os pesos testados são os dela. */
    metricModelVersionId: uuid('metric_model_version_id')
      .notNull()
      .references(() => metricModelVersions.id, { onDelete: 'cascade' }),
    /** Janela de antecedência em dias: 30, 60 ou 90 (§33). */
    windowDays: integer('window_days').notNull(),
    status: calibrationRunStatusEnum('status').notNull().default('queued'),
    parametersJson: jsonb('parameters_json'),
    resultsJson: jsonb('results_json'),
    /** Motivo da falha, quando `status = 'failed'`. */
    errorMessage: text('error_message'),
    /** id em auth.users de quem pediu. Referência lógica, sem FK (o schema auth é do Supabase). */
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('calibration_runs_organization_idx').on(table.organizationId, table.createdAt),
    index('calibration_runs_version_idx').on(table.metricModelVersionId),
    check('calibration_runs_window_days_check', sql`${table.windowDays} between 1 and 365`),
    pgPolicy('calibration_runs_select_member', {
      for: 'select',
      to: authenticatedRole,
      using: memberCanRead,
    }),
    pgPolicy('calibration_runs_insert_manager', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: managerRoles,
    }),
    pgPolicy('calibration_runs_update_manager', {
      for: 'update',
      to: authenticatedRole,
      using: managerRoles,
      withCheck: managerRoles,
    }),
    pgPolicy('calibration_runs_delete_manager', {
      for: 'delete',
      to: authenticatedRole,
      using: managerRoles,
    }),
  ],
).enableRLS();

export type CalibrationRunRow = typeof calibrationRuns.$inferSelect;
export type NewCalibrationRunRow = typeof calibrationRuns.$inferInsert;
