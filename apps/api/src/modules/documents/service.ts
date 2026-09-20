/**
 * Casos de uso de documentos e descoberta automática de métricas (§35).
 *
 *   upload → storage privado + linha em uploaded_documents (status uploaded)
 *   extract-metrics → texto (TextExtractor) → storage (extracted.txt) + preview no banco
 *                     → MetricExtractionProvider → sugestões pendentes para revisão
 *   suggestions → a pessoa também pode criar uma sugestão manual e revisar (accept/reject)
 *   accept → devolve o payload pronto para POST /metrics; a métrica nasce lá, nunca aqui.
 */
import { randomUUID } from 'node:crypto';

import { isSafeRule } from '@inovaapss/engine';
import {
  createMetricSuggestionSchema,
  type DocumentListQuery,
  EXTRACTED_TEXT_PREVIEW_MAX_BYTES,
  MAX_UPLOAD_BYTES,
  resolveUploadType,
} from '@inovaapss/validation';

import { createSyncClock, toImportedDocumentInputs } from './import-archive.js';
import { toPublicDocument } from './repository.js';
import {
  buildDocumentObjectPath,
  buildExtractedTextPath,
  SIGNED_URL_TTL_SECONDS,
} from '../../infrastructure/storage/document-storage.js';
import { AppError, NotFoundError } from '../../shared/errors.js';

import type { DocumentsRepository, NewSuggestionInput } from './repository.js';
import type { CreateMetricSuggestionBody } from './schema.js';
import type {
  AcceptSuggestionResult,
  ExtractMetricsResult,
  MetricPrefill,
  MetricSuggestion,
  PaginatedDocuments,
  UploadDocumentInput,
  UploadedDocument,
  UploadedDocumentDetail,
  UploadedDocumentRecord,
} from './types.js';
import type {
  ExtractedText,
  MetricExtractionProvider,
  MetricSuggestionDraft,
  TextExtractor,
} from '../../infrastructure/extraction/index.js';
import type { DocumentStorage } from '../../infrastructure/storage/document-storage.js';
import type { TenantContext } from '../../middleware/tenant.js';

export class UnsupportedFileTypeError extends AppError {
  constructor(reason: string) {
    super(415, 'UNSUPPORTED_FILE_TYPE', reason);
    this.name = 'UnsupportedFileTypeError';
  }
}

export class FileTooLargeError extends AppError {
  constructor() {
    super(
      413,
      'FILE_TOO_LARGE',
      `O arquivo excede o limite de ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    );
    this.name = 'FileTooLargeError';
  }
}

export class UnsafeFormulaError extends AppError {
  constructor() {
    super(
      400,
      'UNSAFE_FORMULA',
      'A fórmula usa um operador ou caminho não permitido. Use apenas JSON Logic com os operadores da allowlist.',
    );
    this.name = 'UnsafeFormulaError';
  }
}

export interface DocumentsServiceDependencies {
  repository: DocumentsRepository;
  storage: DocumentStorage;
  textExtractor: TextExtractor;
  provider: MetricExtractionProvider;
  /**
   * Bucket da importação de dados (§34), só para leitura: é o que faz as planilhas importadas
   * aparecerem no arquivo da organização (import-archive.ts). Ausente = só os uploads.
   */
  importStorage?: DocumentStorage | undefined;
  /** Relógio injetável para os testes. */
  now?: () => Date;
  signedUrlTtlSeconds?: number;
  /** Intervalo mínimo entre duas varreduras do bucket da importação (ms). */
  importSyncTtlMs?: number;
}

export interface DocumentsService {
  upload(tenant: TenantContext, input: UploadDocumentInput): Promise<UploadedDocument>;
  list(tenant: TenantContext, query: DocumentListQuery): Promise<PaginatedDocuments>;
  get(tenant: TenantContext, id: string): Promise<UploadedDocumentDetail>;
  extractMetrics(tenant: TenantContext, id: string): Promise<ExtractMetricsResult>;
  listSuggestions(tenant: TenantContext, documentId: string): Promise<MetricSuggestion[]>;
  createSuggestion(
    tenant: TenantContext,
    documentId: string,
    body: CreateMetricSuggestionBody,
  ): Promise<MetricSuggestion>;
  accept(tenant: TenantContext, suggestionId: string): Promise<AcceptSuggestionResult>;
  reject(tenant: TenantContext, suggestionId: string): Promise<MetricSuggestion>;
}

const PDF_SIGNATURE = Buffer.from('%PDF');
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Confere os primeiros bytes contra o tipo declarado (§45): a extensão e o MIME vêm do
 * cliente, os bytes não mentem. Texto com byte nulo é binário disfarçado.
 */
function assertContentMatchesKind(buffer: Buffer, kind: UploadedDocument['kind']): void {
  const head = buffer.subarray(0, 8);
  if (kind === 'pdf' && !head.subarray(0, 4).equals(PDF_SIGNATURE)) {
    throw new UnsupportedFileTypeError('O conteúdo não é um PDF válido.');
  }
  if ((kind === 'docx' || kind === 'xlsx') && !head.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    throw new UnsupportedFileTypeError(`O conteúdo não é um ${kind.toUpperCase()} válido.`);
  }
  if (
    (kind === 'csv' || kind === 'json' || kind === 'markdown' || kind === 'text') &&
    buffer.subarray(0, 1024).includes(0)
  ) {
    throw new UnsupportedFileTypeError('O arquivo declarado como texto contém dados binários.');
  }
}

/** Corta o texto em `maxBytes` (UTF-8) sem partir um caractere no meio. */
export function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  let end = text.length;
  while (end > 0 && Buffer.byteLength(text.slice(0, end), 'utf8') > maxBytes) {
    end = Math.floor(end * 0.9);
  }
  return text.slice(0, end);
}

/** Slug a partir do nome sugerido, no formato que slugSchema aceita (2–64, a-z0-9 e hífen). */
export function slugifyMetricName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug.length >= 2 ? slug : `metrica-${slug}`.slice(0, 64);
}

function buildMetricPrefill(
  suggestion: MetricSuggestion,
  document: UploadedDocumentRecord | null,
): MetricPrefill {
  return {
    name: suggestion.suggestedName,
    slug: slugifyMetricName(suggestion.suggestedName),
    description: suggestion.description,
    category: 'Descoberta em documento',
    metricType: suggestion.suggestedType,
    unit: suggestion.unit,
    direction: suggestion.suggestedDirection,
    sourceType: 'DOCUMENT',
    periodicity: 'MONTHLY',
    weight: suggestion.suggestedWeight,
    normalization: suggestion.suggestedThresholds,
    formula: suggestion.suggestedFormula,
    isActive: false,
    origin: {
      documentId: suggestion.uploadedDocumentId,
      suggestionId: suggestion.id,
      fileName: document?.fileName ?? null,
    },
  };
}

function assertSafeFormula(formula: Record<string, unknown> | undefined): void {
  if (formula !== undefined && !isSafeRule(formula)) {
    throw new UnsafeFormulaError();
  }
}

/**
 * Sugestões vindas de um provider passam pela mesma validação de uma sugestão manual;
 * as inválidas são descartadas (nunca derrubam a extração).
 */
function toSuggestionInputs(
  drafts: readonly MetricSuggestionDraft[],
  document: UploadedDocumentRecord,
  providerName: string,
): NewSuggestionInput[] {
  const inputs: NewSuggestionInput[] = [];
  for (const draft of drafts) {
    const parsed = createMetricSuggestionSchema.safeParse(draft);
    if (!parsed.success) continue;
    if (parsed.data.suggestedFormula !== undefined && !isSafeRule(parsed.data.suggestedFormula)) {
      continue;
    }
    inputs.push({
      ...parsed.data,
      uploadedDocumentId: document.id,
      organizationId: document.organizationId,
      confidence: draft.confidence ?? null,
      provider: providerName,
      createdBy: null,
    });
  }
  return inputs;
}

export function createDocumentsService(deps: DocumentsServiceDependencies): DocumentsService {
  const { repository, storage, textExtractor, provider } = deps;
  const now = deps.now ?? (() => new Date());
  const signedUrlTtl = deps.signedUrlTtlSeconds ?? SIGNED_URL_TTL_SECONDS;
  const importStorage = deps.importStorage;
  const syncClock = createSyncClock(deps.importSyncTtlMs);

  /** O arquivo vive no bucket de quem o gravou: documentos aqui, planilhas na importação. */
  const storageOf = (record: UploadedDocumentRecord): DocumentStorage =>
    record.origin === 'import' && importStorage !== undefined ? importStorage : storage;

  /**
   * Traz para a lista o que a importação de dados gravou no bucket dela. Falha de rede,
   * bucket inexistente ou permissão negada não podem derrubar o arquivo da organização:
   * a varredura é silenciosa e a listagem segue com o que já está no banco.
   */
  const syncImportedDocuments = async (organizationId: string): Promise<void> => {
    if (importStorage === undefined || !syncClock.due(organizationId)) return;
    syncClock.touch(organizationId);
    try {
      const objects = await importStorage.list(`${organizationId}/`);
      const inputs = toImportedDocumentInputs(organizationId, objects);
      if (inputs.length > 0) await repository.registerImportedDocuments(inputs);
    } catch {
      // Silencioso de propósito: o arquivo mostra o que tem.
    }
  };

  const requireDocument = async (
    tenant: TenantContext,
    id: string,
  ): Promise<UploadedDocumentRecord> => {
    const record = await repository.findDocument(tenant.organizationId, id);
    if (record === null) throw new NotFoundError('Documento não encontrado.');
    return record;
  };

  const requireSuggestion = async (
    tenant: TenantContext,
    id: string,
  ): Promise<MetricSuggestion> => {
    const suggestion = await repository.findSuggestion(tenant.organizationId, id);
    if (suggestion === null) throw new NotFoundError('Sugestão não encontrada.');
    return suggestion;
  };

  return {
    async upload(tenant, input) {
      const resolved = resolveUploadType(input.fileName, input.mimeType);
      if (!resolved.ok) throw new UnsupportedFileTypeError(resolved.reason);
      if (input.buffer.length === 0) {
        throw new UnsupportedFileTypeError('O arquivo está vazio.');
      }
      if (input.buffer.length > MAX_UPLOAD_BYTES) throw new FileTooLargeError();
      assertContentMatchesKind(input.buffer, resolved.kind);

      const id = randomUUID();
      const storagePath = buildDocumentObjectPath(tenant.organizationId, id, input.fileName);
      await storage.upload({
        path: storagePath,
        body: input.buffer,
        contentType: resolved.mimeType,
      });
      try {
        const record = await repository.createDocument({
          id,
          organizationId: tenant.organizationId,
          storagePath,
          fileName: input.fileName,
          mimeType: resolved.mimeType,
          sizeBytes: input.buffer.length,
          uploadedBy: tenant.userId,
          origin: 'upload',
        });
        return toPublicDocument(record);
      } catch (err) {
        // Sem linha no banco o objeto ficaria órfão: remove e propaga o erro.
        await storage.remove([storagePath]).catch(() => undefined);
        throw err;
      }
    },

    async list(tenant, query) {
      await syncImportedDocuments(tenant.organizationId);
      const { items, total } = await repository.listDocuments(tenant.organizationId, query);
      return { items, page: query.page, pageSize: query.pageSize, total };
    },

    async get(tenant, id) {
      const record = await requireDocument(tenant, id);
      const downloadUrl = await storageOf(record).createSignedUrl(
        record.storagePath,
        signedUrlTtl,
        record.fileName,
      );
      return {
        ...toPublicDocument(record),
        downloadUrl,
        downloadUrlExpiresInSeconds: signedUrlTtl,
      };
    },

    async extractMetrics(tenant, id) {
      const record = await requireDocument(tenant, id);
      // Lê do bucket de origem, mas grava o texto extraído sempre no bucket dos documentos.
      const buffer = await storageOf(record).download(record.storagePath);

      let extracted: ExtractedText;
      try {
        extracted = await textExtractor.extract({
          buffer,
          kind: record.kind,
          fileName: record.fileName,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Falha desconhecida na extração.';
        await repository.updateDocument(tenant.organizationId, id, {
          status: 'failed',
          extractionError: message,
        });
        throw err;
      }

      const extractedTextPath = buildExtractedTextPath(tenant.organizationId, id);
      await storage.upload({
        path: extractedTextPath,
        body: Buffer.from(extracted.text, 'utf8'),
        // O bucket usa allowlist exata de MIME; charset no parâmetro faz o Storage rejeitar.
        contentType: 'text/plain',
      });
      const updated = await repository.updateDocument(tenant.organizationId, id, {
        status: 'extracted',
        extractedTextPath,
        extractedTextPreview: truncateUtf8(extracted.text, EXTRACTED_TEXT_PREVIEW_MAX_BYTES),
        extractionError: null,
        extractedAt: now(),
      });
      const document = updated ?? record;

      const drafts = await provider.extract(
        {
          id: document.id,
          organizationId: document.organizationId,
          fileName: document.fileName,
          mimeType: document.mimeType,
          kind: document.kind,
        },
        extracted,
      );
      const existing = await repository.listSuggestions(document.organizationId, document.id);
      const existingNames = new Set(existing.map((item) => slugifyMetricName(item.suggestedName)));
      const suggestionInputs = toSuggestionInputs(drafts, document, provider.name).filter(
        (item) => !existingNames.has(slugifyMetricName(item.suggestedName)),
      );
      const suggestions = await repository.createSuggestions(suggestionInputs);

      return {
        document: toPublicDocument(document),
        suggestions,
        extraction: {
          provider: provider.name,
          chars: extracted.text.length,
          truncated: extracted.meta.truncated,
          pages: extracted.meta.pages,
          sheets: extracted.meta.sheets,
          rows: extracted.meta.rows,
        },
      };
    },

    async listSuggestions(tenant, documentId) {
      await requireDocument(tenant, documentId);
      return repository.listSuggestions(tenant.organizationId, documentId);
    },

    async createSuggestion(tenant, documentId, body) {
      const document = await requireDocument(tenant, documentId);
      assertSafeFormula(body.suggestedFormula);
      const [created] = await repository.createSuggestions([
        {
          ...body,
          uploadedDocumentId: document.id,
          organizationId: tenant.organizationId,
          confidence: 1,
          provider: 'manual',
          createdBy: tenant.userId,
        },
      ]);
      if (created === undefined) throw new Error('Falha ao registrar a sugestão.');
      return created;
    },

    async accept(tenant, suggestionId) {
      const current = await requireSuggestion(tenant, suggestionId);
      const reviewed = await repository.reviewSuggestion(tenant.organizationId, suggestionId, {
        status: 'accepted',
        reviewedBy: tenant.userId,
        reviewedAt: now(),
      });
      const suggestion = reviewed ?? current;
      const document = await repository.findDocument(
        tenant.organizationId,
        suggestion.uploadedDocumentId,
      );
      return { suggestion, metricPayload: buildMetricPrefill(suggestion, document) };
    },

    async reject(tenant, suggestionId) {
      await requireSuggestion(tenant, suggestionId);
      const reviewed = await repository.reviewSuggestion(tenant.organizationId, suggestionId, {
        status: 'rejected',
        reviewedBy: tenant.userId,
        reviewedAt: now(),
      });
      if (reviewed === null) throw new NotFoundError('Sugestão não encontrada.');
      return reviewed;
    },
  };
}
