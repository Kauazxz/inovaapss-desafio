/**
 * §36 — import_jobs e import_row_errors (Etapa 7, fluxo da §34).
 *
 * - `file_path` aponta para o bucket PRIVADO "imports" do Supabase Storage
 *   (<organization_id>/<import_job_id>/<nome-seguro>): o arquivo original fica guardado para a
 *   confirmação reler e validar de novo, sem confiar no que o navegador mandou no preview.
 * - `mapping_json` guarda o mapeamento final por tabela (campo → cabeçalho) e `summary_json` as
 *   contagens de §34 (válidas, inválidas, duplicidades, campos ausentes) mais o resultado da
 *   gravação. São JSON porque o formato varia com o dataset e é dado de relatório, não de
 *   consulta.
 * - `created_by` é referência LÓGICA a auth.users (mesma convenção de organization_users): sem
 *   FK porque o schema `auth` é do Supabase.
 * - Uma linha em `import_row_errors` por erro recusado na confirmação, com a linha crua, para a
 *   pessoa corrigir a planilha e reimportar.
 *
 * RLS pelo próprio Drizzle: leitura para membros da organização; escrita para owner/admin/analyst
 * (viewer só lê). As funções auxiliares SECURITY DEFINER vêm da migration
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

import { IMPORT_DATASET_KEYS, IMPORT_FILE_TYPES, IMPORT_JOB_STATUSES } from '@inovaapss/shared';

import { organizations } from './organizations.js';

export const importJobStatusEnum = pgEnum('import_job_status', IMPORT_JOB_STATUSES);
export const importFileTypeEnum = pgEnum('import_file_type', IMPORT_FILE_TYPES);

const memberCanRead = sql`organization_id in (select public.current_user_organization_ids())`;
const writerRoles = sql`public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst')`;

const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    /** Caminho do objeto no bucket privado "imports". */
    filePath: text('file_path').notNull(),
    fileType: importFileTypeEnum('file_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: importJobStatusEnum('status').notNull().default('uploaded'),
    /** Mapeamento por tabela: [{ sheet, dataset, mapping, mappingSource }]. */
    mappingJson: jsonb('mapping_json'),
    /** Contagens de §34 e, depois da confirmação, o que foi gravado. */
    summaryJson: jsonb('summary_json'),
    /** Motivo de `status = failed` (arquivo ilegível, nenhuma tabela reconhecida...). */
    errorMessage: text('error_message'),
    /** id em auth.users de quem importou. Referência lógica, sem FK. */
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    /** Preenchido na confirmação (ou na falha): quando o job parou de andar. */
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('import_jobs_organization_idx').on(table.organizationId, table.createdAt),
    index('import_jobs_org_status_idx').on(table.organizationId, table.status),
    check('import_jobs_size_bytes_check', sql`${table.sizeBytes} >= 0`),
    pgPolicy('import_jobs_select_member', {
      for: 'select',
      to: authenticatedRole,
      using: memberCanRead,
    }),
    pgPolicy('import_jobs_insert_writer', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: writerRoles,
    }),
    pgPolicy('import_jobs_update_writer', {
      for: 'update',
      to: authenticatedRole,
      using: writerRoles,
      withCheck: writerRoles,
    }),
    pgPolicy('import_jobs_delete_writer', {
      for: 'delete',
      to: authenticatedRole,
      using: writerRoles,
    }),
  ],
).enableRLS();

export const importRowErrors = pgTable(
  'import_row_errors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importJobId: uuid('import_job_id')
      .notNull()
      .references(() => importJobs.id, { onDelete: 'cascade' }),
    /** Repetido aqui para a RLS não depender de join com import_jobs. */
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Nome da tabela (aba) de onde veio a linha. */
    sheet: text('sheet').notNull(),
    dataset: text('dataset').notNull(),
    /** 1 = primeira linha depois do cabeçalho. */
    rowNumber: integer('row_number').notNull(),
    /** Campo do dataset; nulo quando o erro é da linha inteira (duplicidade, por exemplo). */
    field: text('field'),
    errorCode: text('error_code').notNull(),
    message: text('message').notNull(),
    /** A linha como veio do arquivo, para a pessoa achar e corrigir na planilha. */
    rawDataJson: jsonb('raw_data_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('import_row_errors_job_idx').on(table.importJobId, table.rowNumber),
    index('import_row_errors_organization_idx').on(table.organizationId),
    check('import_row_errors_row_number_check', sql`${table.rowNumber} >= 0`),
    check(
      'import_row_errors_dataset_check',
      sql`${table.dataset} in (${sqlList(IMPORT_DATASET_KEYS)})`,
    ),
    pgPolicy('import_row_errors_select_member', {
      for: 'select',
      to: authenticatedRole,
      using: memberCanRead,
    }),
    pgPolicy('import_row_errors_insert_writer', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: writerRoles,
    }),
    pgPolicy('import_row_errors_update_writer', {
      for: 'update',
      to: authenticatedRole,
      using: writerRoles,
      withCheck: writerRoles,
    }),
    pgPolicy('import_row_errors_delete_writer', {
      for: 'delete',
      to: authenticatedRole,
      using: writerRoles,
    }),
  ],
).enableRLS();

export type ImportJobRow = typeof importJobs.$inferSelect;
export type NewImportJobRow = typeof importJobs.$inferInsert;
export type ImportRowErrorRow = typeof importRowErrors.$inferSelect;
export type NewImportRowErrorRow = typeof importRowErrors.$inferInsert;
