/**
 * §36 — import_jobs e import_row_errors (Etapa 7, fluxo do §34).
 *
 * - Um `import_jobs` é UMA importação: o arquivo que entrou (no bucket privado "imports",
 *   `<organization_id>/<import_job_id>/<nome-seguro>`), a tabela e o dataset escolhidos, o
 *   mapeamento confirmado (`mapping_json`) e o relatório (`summary_json` = ImportReport sem a
 *   lista de erros, que é grande e mora na tabela ao lado).
 * - `import_row_errors` guarda as linhas recusadas com o motivo em português, para a tela de
 *   erros (§61). `raw_data_json` é a linha como veio do arquivo, para quem for corrigir.
 * - `created_by` é referência LÓGICA a auth.users (mesma convenção de uploaded_documents):
 *   sem FK, porque o schema `auth` é do Supabase.
 *
 * RLS pelo Drizzle: leitura para membros da organização; escrita para owner/admin/analyst
 * (viewer não importa dados). As funções auxiliares SECURITY DEFINER vêm da migration
 * 20260919205500_auth_organizations_rls.sql. A API fala como service_role e o isolamento real
 * é o filtro por organization_id em toda query.
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

import {
  IMPORT_DATASET_KEYS,
  IMPORT_ERROR_CODES,
  IMPORT_FILE_TYPES,
  IMPORT_JOB_STATUSES,
} from '@inovaapss/shared';

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
    storagePath: text('storage_path').notNull(),
    fileName: text('file_name').notNull(),
    fileType: importFileTypeEnum('file_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: importJobStatusEnum('status').notNull().default('uploaded'),
    /** Tabela escolhida dentro do arquivo: aba do XLSX, `csv` ou chave do JSON. */
    sheetName: text('sheet_name'),
    /**
     * Dataset do catálogo do importador. Texto com CHECK (e não pgEnum) porque a lista é do
     * pacote `@inovaapss/importer` e pode crescer sem exigir migration de tipo.
     */
    dataset: text('dataset'),
    /** Campo do dataset → cabeçalho original do arquivo (`null` = sem coluna). */
    mappingJson: jsonb('mapping_json'),
    /** `ImportReport` sem a lista de erros: total, valid, invalid, duplicates, missingFields. */
    summaryJson: jsonb('summary_json'),
    /** Linhas efetivamente gravadas na confirmação. */
    rowsImported: integer('rows_imported').notNull().default(0),
    errorMessage: text('error_message'),
    /** id em auth.users de quem enviou o arquivo. Referência lógica, sem FK. */
    createdBy: uuid('created_by').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('import_jobs_organization_idx').on(table.organizationId, table.createdAt),
    index('import_jobs_org_status_idx').on(table.organizationId, table.status),
    check('import_jobs_size_bytes_check', sql`${table.sizeBytes} >= 0`),
    check('import_jobs_rows_imported_check', sql`${table.rowsImported} >= 0`),
    check(
      'import_jobs_dataset_check',
      sql`${table.dataset} is null or ${table.dataset} in (${sqlList(IMPORT_DATASET_KEYS)})`,
    ),
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
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Posição entre as linhas de dados: a primeira depois do cabeçalho é 1. */
    rowNumber: integer('row_number').notNull(),
    /** Campo do dataset (não o cabeçalho do arquivo); nulo quando o erro é da linha inteira. */
    field: text('field'),
    errorCode: text('error_code').notNull(),
    message: text('message').notNull(),
    /** A linha como veio do arquivo, para quem for corrigir a origem. */
    rawDataJson: jsonb('raw_data_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('import_row_errors_job_idx').on(table.importJobId, table.rowNumber),
    index('import_row_errors_organization_idx').on(table.organizationId),
    check('import_row_errors_row_number_check', sql`${table.rowNumber} >= 0`),
    check(
      'import_row_errors_code_check',
      sql`${table.errorCode} in (${sqlList(IMPORT_ERROR_CODES)})`,
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
