/**
 * Persistência de uploaded_documents e metric_extraction_suggestions (Drizzle).
 *
 * Toda consulta recebe o organization_id do tenant e filtra por ele (§5). O repositório em
 * memória dos testes (__tests__/fake-repository.ts) implementa a mesma interface.
 */
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { type MetricDirection, type MetricType } from '@inovaapss/shared';
import {
  type DocumentKind,
  type DocumentListQuery,
  type DocumentOrigin,
  fileExtensionOf,
  type MetricSuggestionStatus,
  type SuggestedThresholds,
  UPLOAD_EXTENSIONS,
} from '@inovaapss/validation';

import { metricExtractionSuggestions, uploadedDocuments } from '../../db/schema/index.js';

import type { MetricSuggestion, UploadedDocument, UploadedDocumentRecord } from './types.js';
import type { Database } from '../../infrastructure/db/index.js';

export interface NewDocumentInput {
  id: string;
  organizationId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Nulo quando o arquivo não veio de uma pessoa (importação de dados). */
  uploadedBy: string | null;
  origin?: DocumentOrigin | undefined;
  importJobId?: string | null | undefined;
  createdAt?: Date | undefined;
}

export interface DocumentPatch {
  status?: UploadedDocument['status'];
  extractedTextPath?: string | null;
  extractedTextPreview?: string | null;
  extractionError?: string | null;
  extractedAt?: Date | null;
}

export interface NewSuggestionInput {
  uploadedDocumentId: string;
  organizationId: string;
  suggestedName: string;
  description?: string | null | undefined;
  suggestedType: MetricType;
  suggestedDirection: MetricDirection;
  unit?: string | null | undefined;
  suggestedWeight?: number | null | undefined;
  suggestedFormula?: Record<string, unknown> | null | undefined;
  suggestedThresholds?: SuggestedThresholds | null | undefined;
  confidence?: number | null | undefined;
  sourceExcerpt?: string | null | undefined;
  provider: string;
  createdBy?: string | null | undefined;
}

export interface DocumentsRepository {
  createDocument(input: NewDocumentInput): Promise<UploadedDocumentRecord>;
  findDocument(organizationId: string, id: string): Promise<UploadedDocumentRecord | null>;
  listDocuments(
    organizationId: string,
    query: DocumentListQuery,
  ): Promise<{ items: UploadedDocument[]; total: number }>;
  updateDocument(
    organizationId: string,
    id: string,
    patch: DocumentPatch,
  ): Promise<UploadedDocumentRecord | null>;
  /**
   * Registra arquivos que já existem no bucket da importação. É idempotente: a chave
   * (organization_id, storage_path) descarta o que já estava guardado.
   */
  registerImportedDocuments(inputs: readonly NewDocumentInput[]): Promise<number>;
  deleteDocument(organizationId: string, id: string): Promise<void>;
  createSuggestions(inputs: readonly NewSuggestionInput[]): Promise<MetricSuggestion[]>;
  listSuggestions(organizationId: string, documentId: string): Promise<MetricSuggestion[]>;
  findSuggestion(organizationId: string, id: string): Promise<MetricSuggestion | null>;
  reviewSuggestion(
    organizationId: string,
    id: string,
    review: { status: MetricSuggestionStatus; reviewedBy: string; reviewedAt: Date },
  ): Promise<MetricSuggestion | null>;
}

/** Tipo lógico a partir da extensão gravada (a validação do upload garante que existe). */
export function documentKindOf(fileName: string): UploadedDocument['kind'] {
  return UPLOAD_EXTENSIONS[fileExtensionOf(fileName)]?.kind ?? 'text';
}

/** Extensões que respondem por um tipo lógico (o filtro por tipo vira busca pelo sufixo). */
export function extensionsOfKind(kind: DocumentKind): string[] {
  return Object.entries(UPLOAD_EXTENSIONS)
    .filter(([, entry]) => entry.kind === kind)
    .map(([extension]) => extension);
}

type DocumentRow = typeof uploadedDocuments.$inferSelect;
type SuggestionRow = typeof metricExtractionSuggestions.$inferSelect;

export function toDocumentRecord(row: DocumentRow): UploadedDocumentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    kind: documentKindOf(row.fileName),
    sizeBytes: row.sizeBytes,
    status: row.status,
    origin: (row.origin === 'import' ? 'import' : 'upload') as DocumentOrigin,
    importJobId: row.importJobId,
    uploadedBy: row.uploadedBy,
    uploadedByEmail: null,
    hasExtractedText: row.extractedTextPath !== null,
    extractedTextPreview: row.extractedTextPreview,
    extractionError: row.extractionError,
    extractedAt: row.extractedAt === null ? null : row.extractedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    storagePath: row.storagePath,
    extractedTextPath: row.extractedTextPath,
  };
}

/** Remove os caminhos internos antes de responder. */
export function toPublicDocument(record: UploadedDocumentRecord): UploadedDocument {
  const { storagePath: _storagePath, extractedTextPath: _extractedTextPath, ...rest } = record;
  return rest;
}

const numberOrNull = (value: string | null): number | null =>
  value === null ? null : Number(value);

function toSuggestion(row: SuggestionRow): MetricSuggestion {
  return {
    id: row.id,
    uploadedDocumentId: row.uploadedDocumentId,
    organizationId: row.organizationId,
    suggestedName: row.suggestedName,
    description: row.description,
    suggestedType: row.suggestedType as MetricType,
    suggestedDirection: row.suggestedDirection as MetricDirection,
    unit: row.unit,
    suggestedWeight: numberOrNull(row.suggestedWeight),
    suggestedFormula: (row.suggestedFormulaJson as Record<string, unknown> | null) ?? null,
    suggestedThresholds: (row.suggestedThresholdsJson as SuggestedThresholds | null) ?? null,
    confidence: numberOrNull(row.confidence),
    sourceExcerpt: row.sourceExcerpt,
    provider: row.provider,
    status: row.status,
    createdBy: row.createdBy,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt === null ? null : row.reviewedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SORTABLE_COLUMNS = {
  createdAt: uploadedDocuments.createdAt,
  fileName: uploadedDocuments.fileName,
  status: uploadedDocuments.status,
  sizeBytes: uploadedDocuments.sizeBytes,
} as const;

/**
 * O e-mail de quem enviou mora em auth.users (schema do Supabase, fora do Drizzle). Uma consulta
 * só, pelos ids já carregados; se ela falhar, a lista continua sem o e-mail em vez de quebrar.
 */
async function attachUploaderEmails<T extends UploadedDocument>(
  getDb: () => Database,
  records: readonly T[],
): Promise<T[]> {
  const ids = [...new Set(records.map((r) => r.uploadedBy).filter((id) => id !== null))];
  if (ids.length === 0) return records.map((record) => ({ ...record }));
  let emails = new Map<string, string | null>();
  try {
    const rows = await getDb().execute<{ id: string; email: string | null }>(
      sql`select id::text as id, email from auth.users where id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
    emails = new Map(Array.from(rows).map((row) => [row.id, row.email]));
  } catch {
    return records.map((record) => ({ ...record }));
  }
  return records.map((record) => ({
    ...record,
    uploadedByEmail: record.uploadedBy === null ? null : (emails.get(record.uploadedBy) ?? null),
  }));
}

export function createDocumentsRepository(getDb: () => Database): DocumentsRepository {
  const repository: DocumentsRepository = {
    async createDocument(input) {
      const rows = await getDb().insert(uploadedDocuments).values(input).returning();
      const row = rows[0];
      if (row === undefined) throw new Error('Falha ao registrar o documento.');
      return toDocumentRecord(row);
    },

    async findDocument(organizationId, id) {
      const rows = await getDb()
        .select()
        .from(uploadedDocuments)
        .where(
          and(eq(uploadedDocuments.organizationId, organizationId), eq(uploadedDocuments.id, id)),
        )
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      const [record] = await attachUploaderEmails(getDb, [toDocumentRecord(row)]);
      return record ?? toDocumentRecord(row);
    },

    async listDocuments(organizationId, query) {
      const conditions = [eq(uploadedDocuments.organizationId, organizationId)];
      if (query.status !== undefined) conditions.push(eq(uploadedDocuments.status, query.status));
      if (query.origin !== undefined) conditions.push(eq(uploadedDocuments.origin, query.origin));
      if (query.kind !== undefined) {
        // O tipo lógico vem da extensão do nome gravado; o filtro vira busca pelo sufixo.
        const byExtension = extensionsOfKind(query.kind).map((extension) =>
          ilike(uploadedDocuments.fileName, `%${extension}`),
        );
        const matchesKind = byExtension.length === 1 ? byExtension[0] : or(...byExtension);
        if (matchesKind !== undefined) conditions.push(matchesKind);
      }
      if (query.search !== undefined && query.search !== '') {
        conditions.push(ilike(uploadedDocuments.fileName, `%${query.search}%`));
      }
      const where = and(...conditions);
      const sortKey = (query.sort ?? 'createdAt') as keyof typeof SORTABLE_COLUMNS;
      const column = SORTABLE_COLUMNS[sortKey] ?? uploadedDocuments.createdAt;
      // Sem `sort` explícito, o mais recente vem primeiro.
      const direction = query.sort === undefined ? 'desc' : query.order;
      const orderBy = direction === 'desc' ? desc(column) : asc(column);

      const db = getDb();
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(uploadedDocuments)
          .where(where)
          .orderBy(orderBy, desc(uploadedDocuments.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(uploadedDocuments).where(where),
      ]);
      return {
        items: await attachUploaderEmails(
          getDb,
          rows.map((row) => toPublicDocument(toDocumentRecord(row))),
        ),
        total: totals[0]?.total ?? 0,
      };
    },

    async updateDocument(organizationId, id, patch) {
      const rows = await getDb()
        .update(uploadedDocuments)
        .set({ ...patch, updatedAt: new Date() })
        .where(
          and(eq(uploadedDocuments.organizationId, organizationId), eq(uploadedDocuments.id, id)),
        )
        .returning();
      const row = rows[0];
      return row === undefined ? null : toDocumentRecord(row);
    },

    async registerImportedDocuments(inputs) {
      if (inputs.length === 0) return 0;
      const rows = await getDb()
        .insert(uploadedDocuments)
        .values(
          inputs.map((input) => ({
            id: input.id,
            organizationId: input.organizationId,
            storagePath: input.storagePath,
            fileName: input.fileName,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            uploadedBy: input.uploadedBy,
            origin: input.origin ?? 'import',
            importJobId: input.importJobId ?? null,
            ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
          })),
        )
        .onConflictDoNothing({
          target: [uploadedDocuments.organizationId, uploadedDocuments.storagePath],
        })
        .returning({ id: uploadedDocuments.id });
      return rows.length;
    },

    async deleteDocument(organizationId, id) {
      await getDb()
        .delete(uploadedDocuments)
        .where(
          and(eq(uploadedDocuments.organizationId, organizationId), eq(uploadedDocuments.id, id)),
        );
    },

    async createSuggestions(inputs) {
      if (inputs.length === 0) return [];
      const rows = await getDb()
        .insert(metricExtractionSuggestions)
        .values(
          inputs.map((input) => ({
            uploadedDocumentId: input.uploadedDocumentId,
            organizationId: input.organizationId,
            suggestedName: input.suggestedName,
            description: input.description ?? null,
            suggestedType: input.suggestedType,
            suggestedDirection: input.suggestedDirection,
            unit: input.unit ?? null,
            suggestedWeight:
              input.suggestedWeight === undefined || input.suggestedWeight === null
                ? null
                : String(input.suggestedWeight),
            suggestedFormulaJson: input.suggestedFormula ?? null,
            suggestedThresholdsJson: input.suggestedThresholds ?? null,
            confidence:
              input.confidence === undefined || input.confidence === null
                ? null
                : String(input.confidence),
            sourceExcerpt: input.sourceExcerpt ?? null,
            provider: input.provider,
            createdBy: input.createdBy ?? null,
          })),
        )
        .returning();
      return rows.map(toSuggestion);
    },

    async listSuggestions(organizationId, documentId) {
      const rows = await getDb()
        .select()
        .from(metricExtractionSuggestions)
        .where(
          and(
            eq(metricExtractionSuggestions.organizationId, organizationId),
            eq(metricExtractionSuggestions.uploadedDocumentId, documentId),
          ),
        )
        .orderBy(asc(metricExtractionSuggestions.createdAt), asc(metricExtractionSuggestions.id));
      return rows.map(toSuggestion);
    },

    async findSuggestion(organizationId, id) {
      const rows = await getDb()
        .select()
        .from(metricExtractionSuggestions)
        .where(
          and(
            eq(metricExtractionSuggestions.organizationId, organizationId),
            eq(metricExtractionSuggestions.id, id),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toSuggestion(row);
    },

    async reviewSuggestion(organizationId, id, review) {
      const rows = await getDb()
        .update(metricExtractionSuggestions)
        .set({
          status: review.status,
          reviewedBy: review.reviewedBy,
          reviewedAt: review.reviewedAt,
          updatedAt: review.reviewedAt,
        })
        .where(
          and(
            eq(metricExtractionSuggestions.organizationId, organizationId),
            eq(metricExtractionSuggestions.id, id),
          ),
        )
        .returning();
      const row = rows[0];
      return row === undefined ? null : toSuggestion(row);
    },
  };

  return repository;
}
