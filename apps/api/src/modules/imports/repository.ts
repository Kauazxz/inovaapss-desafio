/**
 * Persistência de import_jobs e import_row_errors (Drizzle).
 *
 * Toda consulta recebe o organization_id do tenant e filtra por ele (§5). O repositório em
 * memória dos testes (__tests__/fake-repository.ts) implementa a mesma interface.
 */
import { and, asc, count, desc, eq } from 'drizzle-orm';

import type {
  ImportDatasetKey,
  ImportFileType,
  ImportJobDto,
  ImportJobMappingDto,
  ImportJobStatus,
  ImportJobSummaryDto,
  ImportRowErrorDto,
} from '@inovaapss/shared';
import { IMPORT_ERRORS_PAGE_SIZE } from '@inovaapss/validation';
import type { ImportListQuery } from '@inovaapss/validation';

import { importJobs, importRowErrors } from '../../db/schema/index.js';

import type { ImportJobRecord } from './types.js';
import type { Database } from '../../infrastructure/db/index.js';

export interface NewImportJobInput {
  id: string;
  organizationId: string;
  fileName: string;
  filePath: string;
  fileType: ImportFileType;
  sizeBytes: number;
  createdBy: string;
}

export interface ImportJobPatch {
  status?: ImportJobStatus;
  mapping?: ImportJobMappingDto[] | null;
  summary?: ImportJobSummaryDto | null;
  errorMessage?: string | null;
  finishedAt?: Date | null;
}

export interface NewImportRowErrorInput {
  importJobId: string;
  organizationId: string;
  sheet: string;
  dataset: ImportDatasetKey;
  rowNumber: number;
  field: string | null;
  errorCode: string;
  message: string;
  rawData: Record<string, unknown> | null;
}

export interface ImportErrorsQuery {
  page: number;
  pageSize: number;
}

export interface ImportsRepository {
  createJob(input: NewImportJobInput): Promise<ImportJobRecord>;
  findJob(organizationId: string, id: string): Promise<ImportJobRecord | null>;
  listJobs(
    organizationId: string,
    query: ImportListQuery,
  ): Promise<{ items: ImportJobDto[]; total: number }>;
  updateJob(
    organizationId: string,
    id: string,
    patch: ImportJobPatch,
  ): Promise<ImportJobRecord | null>;
  /** Troca os erros do job pelos desta confirmação (reimportar não acumula lixo antigo). */
  replaceRowErrors(
    organizationId: string,
    importJobId: string,
    errors: readonly NewImportRowErrorInput[],
  ): Promise<number>;
  listRowErrors(
    organizationId: string,
    importJobId: string,
    query: ImportErrorsQuery,
  ): Promise<{ items: ImportRowErrorDto[]; total: number }>;
}

type JobRow = typeof importJobs.$inferSelect;
type RowErrorRow = typeof importRowErrors.$inferSelect;

export function toImportJobRecord(row: JobRow): ImportJobRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    fileName: row.fileName,
    fileType: row.fileType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    mapping: (row.mappingJson as ImportJobMappingDto[] | null) ?? null,
    summary: (row.summaryJson as ImportJobSummaryDto | null) ?? null,
    error: row.errorMessage,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt === null ? null : row.finishedAt.toISOString(),
    filePath: row.filePath,
  };
}

/** Remove o caminho interno do storage antes de responder. */
export function toPublicImportJob(record: ImportJobRecord): ImportJobDto {
  const { filePath: _filePath, ...rest } = record;
  return rest;
}

export function toImportRowError(row: RowErrorRow): ImportRowErrorDto {
  return {
    row: row.rowNumber,
    sheet: row.sheet,
    dataset: row.dataset as ImportDatasetKey,
    field: row.field,
    code: row.errorCode,
    message: row.message,
  };
}

const CHUNK = 500;

export function createImportsRepository(getDb: () => Database): ImportsRepository {
  return {
    async createJob(input) {
      const rows = await getDb().insert(importJobs).values(input).returning();
      const row = rows[0];
      if (row === undefined) throw new Error('Falha ao registrar a importação.');
      return toImportJobRecord(row);
    },

    async findJob(organizationId, id) {
      const rows = await getDb()
        .select()
        .from(importJobs)
        .where(and(eq(importJobs.organizationId, organizationId), eq(importJobs.id, id)))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toImportJobRecord(row);
    },

    async listJobs(organizationId, query) {
      const conditions = [eq(importJobs.organizationId, organizationId)];
      if (query.status !== undefined) conditions.push(eq(importJobs.status, query.status));
      const where = and(...conditions);

      const db = getDb();
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(importJobs)
          .where(where)
          // O histórico é uma linha do tempo: o mais recente primeiro, sempre.
          .orderBy(desc(importJobs.createdAt), desc(importJobs.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(importJobs).where(where),
      ]);
      return {
        items: rows.map((row) => toPublicImportJob(toImportJobRecord(row))),
        total: totals[0]?.total ?? 0,
      };
    },

    async updateJob(organizationId, id, patch) {
      const values: Partial<typeof importJobs.$inferInsert> = {};
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.mapping !== undefined) values.mappingJson = patch.mapping;
      if (patch.summary !== undefined) values.summaryJson = patch.summary;
      if (patch.errorMessage !== undefined) values.errorMessage = patch.errorMessage;
      if (patch.finishedAt !== undefined) values.finishedAt = patch.finishedAt;

      const rows = await getDb()
        .update(importJobs)
        .set(values)
        .where(and(eq(importJobs.organizationId, organizationId), eq(importJobs.id, id)))
        .returning();
      const row = rows[0];
      return row === undefined ? null : toImportJobRecord(row);
    },

    async replaceRowErrors(organizationId, importJobId, errors) {
      const db = getDb();
      await db
        .delete(importRowErrors)
        .where(
          and(
            eq(importRowErrors.organizationId, organizationId),
            eq(importRowErrors.importJobId, importJobId),
          ),
        );
      for (let i = 0; i < errors.length; i += CHUNK) {
        await db.insert(importRowErrors).values(
          errors.slice(i, i + CHUNK).map((error) => ({
            importJobId: error.importJobId,
            organizationId: error.organizationId,
            sheet: error.sheet,
            dataset: error.dataset,
            rowNumber: error.rowNumber,
            field: error.field,
            errorCode: error.errorCode,
            message: error.message,
            rawDataJson: error.rawData,
          })),
        );
      }
      return errors.length;
    },

    async listRowErrors(organizationId, importJobId, query) {
      const where = and(
        eq(importRowErrors.organizationId, organizationId),
        eq(importRowErrors.importJobId, importJobId),
      );
      const pageSize = Math.min(query.pageSize, IMPORT_ERRORS_PAGE_SIZE);
      const db = getDb();
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(importRowErrors)
          .where(where)
          .orderBy(asc(importRowErrors.rowNumber), asc(importRowErrors.id))
          .limit(pageSize)
          .offset((query.page - 1) * pageSize),
        db.select({ total: count() }).from(importRowErrors).where(where),
      ]);
      return { items: rows.map(toImportRowError), total: totals[0]?.total ?? 0 };
    },
  };
}
