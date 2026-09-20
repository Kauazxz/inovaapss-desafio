/**
 * §36 — uploaded_documents e metric_extraction_suggestions (Etapa 11, fluxo manual §35).
 *
 * - `storage_path` aponta para o bucket privado "documents" do Supabase Storage
 *   (<organization_id>/<document_id>/<nome-seguro>); `extracted_text_path` é o texto extraído
 *   completo no mesmo bucket e `extracted_text_preview` os primeiros 20 kB, para a tela.
 * - `uploaded_by`, `created_by` e `reviewed_by` são referências LÓGICAS a auth.users (mesma
 *   convenção de organization_users): sem FK porque o schema `auth` é do Supabase.
 * - `suggested_type` e `suggested_direction` ficam como texto com CHECK (e não pgEnum) para não
 *   disputar o nome do enum de métricas com a Etapa 3.
 *
 * RLS pelo próprio Drizzle: leitura para membros da organização; escrita para owner/admin/analyst
 * (§35: quem revisa é humano; viewer só lê). As funções auxiliares SECURITY DEFINER vêm da
 * migration 20260919205500_auth_organizations_rls.sql.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';

import { METRIC_DIRECTIONS, METRIC_TYPES } from '@inovaapss/shared';
import { DOCUMENT_STATUSES, METRIC_SUGGESTION_STATUSES } from '@inovaapss/validation';

import { organizations } from './organizations.js';

export const documentStatusEnum = pgEnum('document_status', DOCUMENT_STATUSES);
export const metricSuggestionStatusEnum = pgEnum(
  'metric_suggestion_status',
  METRIC_SUGGESTION_STATUSES,
);

const memberCanRead = sql`organization_id in (select public.current_user_organization_ids())`;
const writerRoles = sql`public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst')`;

const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const uploadedDocuments = pgTable(
  'uploaded_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    storagePath: text('storage_path').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: documentStatusEnum('status').notNull().default('uploaded'),
    /** id em auth.users de quem enviou. Referência lógica, sem FK. */
    uploadedBy: uuid('uploaded_by').notNull(),
    extractedTextPath: text('extracted_text_path'),
    extractedTextPreview: text('extracted_text_preview'),
    extractionError: text('extraction_error'),
    extractedAt: timestamp('extracted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('uploaded_documents_organization_idx').on(table.organizationId, table.createdAt),
    check('uploaded_documents_size_bytes_check', sql`${table.sizeBytes} >= 0`),
    pgPolicy('uploaded_documents_select_member', {
      for: 'select',
      to: authenticatedRole,
      using: memberCanRead,
    }),
    pgPolicy('uploaded_documents_insert_writer', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: writerRoles,
    }),
    pgPolicy('uploaded_documents_update_writer', {
      for: 'update',
      to: authenticatedRole,
      using: writerRoles,
      withCheck: writerRoles,
    }),
    pgPolicy('uploaded_documents_delete_writer', {
      for: 'delete',
      to: authenticatedRole,
      using: writerRoles,
    }),
  ],
).enableRLS();

export const metricExtractionSuggestions = pgTable(
  'metric_extraction_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadedDocumentId: uuid('uploaded_document_id')
      .notNull()
      .references(() => uploadedDocuments.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    suggestedName: text('suggested_name').notNull(),
    description: text('description'),
    suggestedType: text('suggested_type').notNull(),
    suggestedDirection: text('suggested_direction').notNull(),
    unit: text('unit'),
    /** Fração 0–1 (§12). */
    suggestedWeight: numeric('suggested_weight', { precision: 6, scale: 4 }),
    suggestedFormulaJson: jsonb('suggested_formula_json'),
    suggestedThresholdsJson: jsonb('suggested_thresholds_json'),
    /** 0–1. Sugestão manual = 1 (veio de uma pessoa); provider de IA preenche o seu (A5). */
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    sourceExcerpt: text('source_excerpt'),
    /** Nome do provider que gerou a sugestão ('manual' ou o provider de IA). */
    provider: text('provider').notNull().default('manual'),
    status: metricSuggestionStatusEnum('status').notNull().default('pending'),
    /** id em auth.users. Referências lógicas, sem FK. */
    createdBy: uuid('created_by'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('metric_extraction_suggestions_document_idx').on(table.uploadedDocumentId),
    index('metric_extraction_suggestions_organization_idx').on(table.organizationId, table.status),
    check(
      'metric_extraction_suggestions_type_check',
      sql`${table.suggestedType} in (${sqlList(METRIC_TYPES)})`,
    ),
    check(
      'metric_extraction_suggestions_direction_check',
      sql`${table.suggestedDirection} in (${sqlList(METRIC_DIRECTIONS)})`,
    ),
    check(
      'metric_extraction_suggestions_weight_check',
      sql`${table.suggestedWeight} is null or (${table.suggestedWeight} >= 0 and ${table.suggestedWeight} <= 1)`,
    ),
    check(
      'metric_extraction_suggestions_confidence_check',
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
    pgPolicy('metric_extraction_suggestions_select_member', {
      for: 'select',
      to: authenticatedRole,
      using: memberCanRead,
    }),
    pgPolicy('metric_extraction_suggestions_insert_writer', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: writerRoles,
    }),
    pgPolicy('metric_extraction_suggestions_update_writer', {
      for: 'update',
      to: authenticatedRole,
      using: writerRoles,
      withCheck: writerRoles,
    }),
    pgPolicy('metric_extraction_suggestions_delete_writer', {
      for: 'delete',
      to: authenticatedRole,
      using: writerRoles,
    }),
  ],
).enableRLS();

export type UploadedDocumentRow = typeof uploadedDocuments.$inferSelect;
export type NewUploadedDocumentRow = typeof uploadedDocuments.$inferInsert;
export type MetricExtractionSuggestionRow = typeof metricExtractionSuggestions.$inferSelect;
export type NewMetricExtractionSuggestionRow = typeof metricExtractionSuggestions.$inferInsert;
