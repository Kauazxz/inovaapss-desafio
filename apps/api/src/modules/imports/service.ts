/**
 * Casos de uso da importação de dados (§34, §37, ajuste A4).
 *
 *   upload   → storage privado + `import_jobs` (uploaded) + tabelas do arquivo com o mapeamento
 *              sugerido para cada dataset (a tela mostra e a pessoa ajusta)
 *   preview  → relê o arquivo, aplica o mapeamento escolhido, valida e devolve o relatório;
 *              nada é gravado além de `mapping_json` e `summary_json` (status previewed)
 *   confirm  → REVALIDA do zero (nunca confia na prévia), grava as linhas válidas por upsert na
 *              chave natural, guarda as recusadas em `import_row_errors` e dispara o recálculo
 *
 * Regra que atravessa tudo: erro de DADO nunca derruba a requisição — vira relatório. Só erro de
 * ARQUIVO (não é um XLSX, JSON quebrado, aba que não existe) vira status 4xx.
 */
import { randomUUID } from 'node:crypto';

import {
  applyMapping,
  type ClientRow,
  type ClientStatusRow,
  DATASETS,
  type DatasetKey,
  detectDataset,
  ImportReadError,
  type ImportReport,
  type ImportRowError,
  type Mapping,
  type MonthlyMetricsRow,
  type NpsRow,
  type RawRow,
  readTabular,
  type TabularSheet,
  validateDataset,
} from '@inovaapss/importer';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  MAX_STORED_ROW_ERRORS,
  PREVIEW_ERRORS_LIMIT,
  PREVIEW_SAMPLE_ROWS,
  resolveImportFileType,
  SHEET_SAMPLE_ROWS,
} from '@inovaapss/validation';
import type { ImportErrorsQuery, ImportListQuery } from '@inovaapss/validation';

import { buildImportObjectPath } from './storage.js';
import { AppError, NotFoundError } from '../../shared/errors.js';

import type {
  ApplyContext,
  ImportsRepository,
  NewRowErrorInput,
  PaginatedRows,
} from './repository.js';
import type { ConfirmImportBody, PreviewImportBody } from './schema.js';
import type {
  ApplyResult,
  ConfirmImportResult,
  DatasetCatalogItem,
  ImportJob,
  ImportJobDetail,
  ImportRowErrorItem,
  ImportSheet,
  ImportSummary,
  PreviewImportResult,
  UploadImportResult,
} from './types.js';
import type { DocumentStorage } from '../../infrastructure/storage/document-storage.js';
import type { TenantContext } from '../../middleware/tenant.js';

// ---------------------------------------------------------------- erros

export class UnsupportedImportFileError extends AppError {
  constructor(reason: string) {
    super(415, 'UNSUPPORTED_FILE_TYPE', reason);
    this.name = 'UnsupportedImportFileError';
  }
}

export class ImportFileTooLargeError extends AppError {
  constructor() {
    super(
      413,
      'FILE_TOO_LARGE',
      `O arquivo excede o limite de ${MAX_IMPORT_BYTES / (1024 * 1024)} MB.`,
    );
    this.name = 'ImportFileTooLargeError';
  }
}

export class UnreadableImportFileError extends AppError {
  constructor(message: string) {
    super(400, 'UNREADABLE_FILE', message);
    this.name = 'UnreadableImportFileError';
  }
}

export class TooManyRowsError extends AppError {
  constructor(rows: number) {
    super(
      413,
      'TOO_MANY_ROWS',
      `A tabela tem ${rows.toLocaleString('pt-BR')} linhas; o limite por importação é ${MAX_IMPORT_ROWS.toLocaleString('pt-BR')}. Divida o arquivo.`,
    );
    this.name = 'TooManyRowsError';
  }
}

export class SheetNotFoundError extends AppError {
  constructor(name: string, available: readonly string[]) {
    super(
      404,
      'SHEET_NOT_FOUND',
      `O arquivo não tem a tabela "${name}". Disponíveis: ${available.join(', ')}.`,
    );
    this.name = 'SheetNotFoundError';
  }
}

export class InvalidMappingError extends AppError {
  constructor(message: string) {
    super(400, 'INVALID_MAPPING', message);
    this.name = 'InvalidMappingError';
  }
}

export class ImportNotMappedError extends AppError {
  constructor() {
    super(
      409,
      'IMPORT_NOT_MAPPED',
      'Escolha a tabela, o tipo de dado e o mapeamento (POST /imports/:id/preview) antes de confirmar.',
    );
    this.name = 'ImportNotMappedError';
  }
}

export class ImportAlreadyConfirmedError extends AppError {
  constructor() {
    super(
      409,
      'IMPORT_ALREADY_CONFIRMED',
      'Esta importação já foi confirmada. Envie o arquivo de novo para importar outra vez.',
    );
    this.name = 'ImportAlreadyConfirmedError';
  }
}

export class ImportHasInvalidRowsError extends AppError {
  constructor(summary: ImportSummary) {
    super(
      409,
      'IMPORT_HAS_INVALID_ROWS',
      `${summary.invalid + summary.duplicates} de ${summary.total} linhas foram recusadas. Corrija o arquivo ou confirme com "ignoreInvalidRows" para importar só as válidas.`,
      { summary },
    );
    this.name = 'ImportHasInvalidRowsError';
  }
}

// ---------------------------------------------------------------- service

export interface UploadImportInput {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

/** Recálculo da carteira depois de gravar (§62). Injetado para os testes não tocarem no motor. */
export type RecalculatePortfolio = (organizationId: string) => Promise<{ clients: number }>;

export interface ImportsServiceDependencies {
  repository: ImportsRepository;
  storage: DocumentStorage;
  recalculate?: RecalculatePortfolio;
  /** Relógio injetável para os testes. */
  now?: () => Date;
}

export interface ImportsService {
  upload(tenant: TenantContext, input: UploadImportInput): Promise<UploadImportResult>;
  list(tenant: TenantContext, query: ImportListQuery): Promise<PaginatedRows<ImportJob>>;
  get(tenant: TenantContext, id: string): Promise<ImportJobDetail>;
  preview(tenant: TenantContext, id: string, body: PreviewImportBody): Promise<PreviewImportResult>;
  confirm(tenant: TenantContext, id: string, body: ConfirmImportBody): Promise<ConfirmImportResult>;
  listErrors(
    tenant: TenantContext,
    id: string,
    query: ImportErrorsQuery,
  ): Promise<PaginatedRows<ImportRowErrorItem>>;
  datasets(): DatasetCatalogItem[];
}

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Confere os primeiros bytes contra o formato declarado (§45): extensão e MIME vêm do cliente,
 * os bytes não mentem. Texto com byte nulo é binário disfarçado.
 */
function assertContentMatchesType(buffer: Buffer, fileType: 'XLSX' | 'CSV' | 'JSON'): void {
  if (fileType === 'XLSX') {
    if (!buffer.subarray(0, 4).equals(ZIP_SIGNATURE)) {
      throw new UnsupportedImportFileError('O conteúdo não é um XLSX válido.');
    }
    return;
  }
  if (buffer.subarray(0, 1024).includes(0)) {
    throw new UnsupportedImportFileError(
      `O conteúdo não é um ${fileType} de texto: o arquivo parece binário.`,
    );
  }
}

/** Valor de célula em texto, para a amostra que a tela mostra sem reinterpretar. */
function toDisplayValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value);
}

function toSummary(report: ImportReport): ImportSummary {
  return {
    total: report.total,
    valid: report.valid,
    invalid: report.invalid,
    duplicates: report.duplicates,
    missingFields: [...report.missingFields],
    errorCount: report.errors.length,
  };
}

/** Chave natural de uma linha já mapeada, no mesmo formato que `validateDataset` usa. */
function naturalKeyOf(values: Record<string, unknown>, keys: readonly string[]): string {
  return keys.map((key) => String(values[key] ?? '')).join('\u0000');
}

export function createImportsService(deps: ImportsServiceDependencies): ImportsService {
  const { repository, storage } = deps;
  const now = deps.now ?? (() => new Date());

  /** Lê o arquivo do storage e devolve as tabelas; erro de leitura vira 400 com o motivo. */
  const readSheets = async (job: ImportJob, storagePath: string): Promise<TabularSheet[]> => {
    const buffer = await storage.download(storagePath);
    try {
      return readTabular(buffer, job.fileType).sheets;
    } catch (err) {
      if (err instanceof ImportReadError) throw new UnreadableImportFileError(err.message);
      throw err;
    }
  };

  const findSheet = (sheets: readonly TabularSheet[], name: string): TabularSheet => {
    const sheet = sheets.find((candidate) => candidate.name === name);
    if (sheet === undefined) {
      throw new SheetNotFoundError(
        name,
        sheets.map((candidate) => candidate.name),
      );
    }
    if (sheet.rows.length > MAX_IMPORT_ROWS) throw new TooManyRowsError(sheet.rows.length);
    return sheet;
  };

  /** Tabela do arquivo + o mapeamento sugerido para cada um dos datasets, do mais provável. */
  const toImportSheet = (sheet: TabularSheet): ImportSheet => ({
    name: sheet.name,
    headers: [...sheet.headers],
    rowCount: sheet.rows.length,
    sampleRows: sheet.rows.slice(0, SHEET_SAMPLE_ROWS).map((row) => {
      const display: Record<string, string | null> = {};
      for (const header of sheet.headers) display[header] = toDisplayValue(row[header]);
      return display;
    }),
    suggestions: detectDataset(sheet.headers).map((detection) => ({
      dataset: detection.dataset,
      label: DATASETS[detection.dataset].label,
      confidence: detection.confidence,
      mapping: detection.suggestion.mapping,
      fields: detection.suggestion.fields,
      unmappedHeaders: detection.suggestion.unmappedHeaders,
      missingRequired: detection.suggestion.missingRequired,
    })),
  });

  /**
   * Confere o mapeamento contra o catálogo do dataset e contra os cabeçalhos do arquivo. Campo
   * desconhecido ou coluna inexistente é erro de PROGRAMA (400), não de dado: a tela só oferece
   * o que existe. Campo obrigatório sem coluna NÃO é erro aqui — aparece no relatório, que é
   * exatamente o que a prévia serve para mostrar.
   */
  const assertMappingFits = (dataset: DatasetKey, mapping: Mapping, sheet: TabularSheet): void => {
    const spec = DATASETS[dataset];
    const known = new Set(spec.fields.map((field) => field.key));
    const headers = new Set(sheet.headers);
    for (const [field, header] of Object.entries(mapping)) {
      if (!known.has(field)) {
        throw new InvalidMappingError(
          `O campo "${field}" não existe em ${spec.label}. Campos: ${[...known].join(', ')}.`,
        );
      }
      if (header !== null && !headers.has(header)) {
        throw new InvalidMappingError(`A coluna "${header}" não existe na tabela "${sheet.name}".`);
      }
    }
  };

  /**
   * O núcleo puro do importador sobre uma tabela: mapeia, coage, valida. Devolve também a
   * posição de cada linha por chave natural, para a confirmação conseguir dizer QUAL linha não
   * pôde ser gravada.
   */
  const runImport = (dataset: DatasetKey, sheet: TabularSheet, mapping: Mapping) => {
    const applied = applyMapping(sheet.rows, mapping, dataset);
    const { rows, report } = validateDataset(dataset, applied);
    const naturalKey = DATASETS[dataset].naturalKey;
    const rowNumbers = new Map<string, number>();
    for (const mapped of applied.rows) {
      const key = naturalKeyOf(mapped.values, naturalKey);
      // A primeira ocorrência vence, como na deduplicação de `validateDataset`.
      if (!rowNumbers.has(key)) rowNumbers.set(key, mapped.row);
    }
    return { rows, report, rowNumbers };
  };

  /** Erro do relatório + a linha crua correspondente, pronto para `import_row_errors`. */
  const toRowErrorInputs = (
    errors: readonly ImportRowError[],
    sheet: TabularSheet,
  ): NewRowErrorInput[] =>
    errors.slice(0, MAX_STORED_ROW_ERRORS).map((error) => ({
      row: error.row,
      field: error.field,
      code: error.code,
      message: error.message,
      // `row` é a posição entre as linhas de DADOS: a primeira depois do cabeçalho é 1.
      rawData: (sheet.rows[error.row - 1] as RawRow | undefined) ?? null,
    }));

  const requireJob = async (tenant: TenantContext, id: string): Promise<ImportJob> => {
    const job = await repository.findJob(tenant.organizationId, id);
    if (job === null) throw new NotFoundError('Importação não encontrada.');
    return job;
  };

  /** O caminho do arquivo no bucket é derivado do job — nunca vem do cliente. */
  const storagePathOf = (job: ImportJob): string =>
    buildImportObjectPath(job.organizationId, job.id, job.fileName);

  const applyRows = async (
    dataset: DatasetKey,
    context: ApplyContext,
    rows: readonly unknown[],
  ): Promise<ApplyResult> => {
    switch (dataset) {
      case 'clients':
        return repository.applyClients(context, rows as readonly ClientRow[]);
      case 'client_status':
        return repository.applyClientStatus(context, rows as readonly ClientStatusRow[]);
      case 'monthly_metrics':
        return repository.applyMonthlyMetrics(context, rows as readonly MonthlyMetricsRow[]);
      case 'nps':
        return repository.applyNps(context, rows as readonly NpsRow[]);
    }
  };

  return {
    async upload(tenant, input) {
      const resolved = resolveImportFileType(input.fileName, input.mimeType);
      if (!resolved.ok) throw new UnsupportedImportFileError(resolved.reason);
      if (input.buffer.length > MAX_IMPORT_BYTES) throw new ImportFileTooLargeError();
      if (input.buffer.length === 0) {
        throw new UnsupportedImportFileError('O arquivo está vazio.');
      }
      assertContentMatchesType(input.buffer, resolved.fileType);

      // Lê ANTES de gravar: arquivo que não abre não vira job nem objeto no bucket.
      let sheets: TabularSheet[];
      try {
        sheets = readTabular(input.buffer, resolved.fileType).sheets;
      } catch (err) {
        if (err instanceof ImportReadError) throw new UnreadableImportFileError(err.message);
        throw err;
      }
      if (sheets.length === 0) {
        throw new UnreadableImportFileError('O arquivo não tem nenhuma tabela com dados.');
      }
      const biggest = Math.max(...sheets.map((sheet) => sheet.rows.length));
      if (biggest > MAX_IMPORT_ROWS) throw new TooManyRowsError(biggest);

      const id = randomUUID();
      const storagePath = buildImportObjectPath(tenant.organizationId, id, input.fileName);
      await storage.upload({
        path: storagePath,
        body: input.buffer,
        contentType: resolved.mimeType,
      });

      const job = await repository.createJob({
        id,
        organizationId: tenant.organizationId,
        storagePath,
        fileName: input.fileName,
        fileType: resolved.fileType,
        sizeBytes: input.buffer.length,
        createdBy: tenant.userId,
      });

      return { job, sheets: sheets.map(toImportSheet) };
    },

    async list(tenant, query) {
      return repository.listJobs(tenant.organizationId, query);
    },

    async get(tenant, id) {
      const job = await requireJob(tenant, id);
      try {
        const sheets = await readSheets(job, storagePathOf(job));
        return { job, sheets: sheets.map(toImportSheet) };
      } catch {
        // O arquivo pode ter sumido do bucket, ou o armazenamento estar fora do ar. Os dados do
        // job (relatório, mapeamento, o que foi importado) continuam valendo e é o que a tela
        // mostra; `sheets: null` é o contrato para "não deu para reler o arquivo".
        return { job, sheets: null };
      }
    },

    async preview(tenant, id, body) {
      const job = await requireJob(tenant, id);
      if (job.status === 'done') throw new ImportAlreadyConfirmedError();

      const sheets = await readSheets(job, storagePathOf(job));
      const sheet = findSheet(sheets, body.sheet);
      assertMappingFits(body.dataset, body.mapping, sheet);

      const { rows, report } = runImport(body.dataset, sheet, body.mapping);
      const summary = toSummary(report);

      const updated = await repository.updateJob(tenant.organizationId, id, {
        status: 'previewed',
        sheetName: body.sheet,
        dataset: body.dataset,
        mapping: body.mapping,
        summary,
        errorMessage: null,
      });

      return {
        job: updated ?? job,
        summary,
        errors: report.errors.slice(0, PREVIEW_ERRORS_LIMIT).map((error) => ({
          row: error.row,
          field: error.field,
          code: error.code,
          message: error.message,
          rawData: (sheet.rows[error.row - 1] as RawRow | undefined) ?? null,
        })),
        sampleRows: rows.slice(0, PREVIEW_SAMPLE_ROWS) as Record<string, unknown>[],
      };
    },

    async confirm(tenant, id, body) {
      const job = await requireJob(tenant, id);
      if (job.status === 'done') throw new ImportAlreadyConfirmedError();

      const sheetName = body.sheet ?? job.sheetName;
      const dataset = body.dataset ?? job.dataset;
      const mapping = body.mapping ?? job.mapping;
      if (sheetName === null || dataset === null || mapping === null) {
        throw new ImportNotMappedError();
      }

      const sheets = await readSheets(job, storagePathOf(job));
      const sheet = findSheet(sheets, sheetName);
      assertMappingFits(dataset, mapping, sheet);

      // Revalida do zero: a prévia é informação para quem confirma, nunca a fonte da verdade.
      const { rows, report, rowNumbers } = runImport(dataset, sheet, mapping);
      const summary = toSummary(report);

      if (!body.ignoreInvalidRows && summary.invalid + summary.duplicates > 0) {
        await repository.updateJob(tenant.organizationId, id, {
          status: 'previewed',
          sheetName,
          dataset,
          mapping,
          summary,
        });
        await repository.replaceRowErrors(
          tenant.organizationId,
          id,
          toRowErrorInputs(report.errors, sheet),
        );
        throw new ImportHasInvalidRowsError(summary);
      }

      await repository.updateJob(tenant.organizationId, id, {
        status: 'importing',
        sheetName,
        dataset,
        mapping,
        summary,
        errorMessage: null,
      });

      let imported: ApplyResult;
      try {
        imported = await applyRows(
          dataset,
          {
            organizationId: tenant.organizationId,
            source: job.fileType,
            sourceReference: job.fileName,
            rowNumbers,
          },
          rows,
        );
      } catch (err) {
        // A mensagem técnica ajuda o suporte a entender o que aconteceu e aparece no histórico;
        // limitar o tamanho evita despejar um erro gigante do banco na tabela e na tela.
        const message = err instanceof Error ? err.message : 'Falha ao gravar os dados.';
        await repository.updateJob(tenant.organizationId, id, {
          status: 'failed',
          errorMessage: message.slice(0, 500),
        });
        throw err;
      }

      // As linhas recusadas na validação MAIS as que não puderam ser gravadas: o relatório do
      // job é a resposta completa à pergunta "o que não entrou, e por quê".
      const rowErrors: NewRowErrorInput[] = [
        ...toRowErrorInputs(report.errors, sheet),
        ...imported.skipped.map((skipped) => ({
          row: skipped.row,
          field: null,
          code: 'INCONSISTENT' as const,
          message: `${skipped.externalCode}: ${skipped.reason}`,
          rawData: (sheet.rows[skipped.row - 1] as RawRow | undefined) ?? null,
        })),
      ].slice(0, MAX_STORED_ROW_ERRORS);
      await repository.replaceRowErrors(tenant.organizationId, id, rowErrors);

      const finalSummary: ImportSummary = {
        ...summary,
        errorCount: report.errors.length + imported.skipped.length,
      };
      const confirmed = await repository.updateJob(tenant.organizationId, id, {
        status: 'done',
        summary: finalSummary,
        rowsImported: imported.rows,
        confirmedAt: now(),
      });

      // O recálculo vem depois de gravar (§62). Falhar nele não desfaz a importação: os dados
      // estão no banco e a carteira recalcula na próxima vez.
      let recalculated: ConfirmImportResult['recalculated'] = {
        ok: false,
        reason: 'Recálculo não configurado nesta instância.',
      };
      if (deps.recalculate !== undefined) {
        try {
          const result = await deps.recalculate(tenant.organizationId);
          recalculated = { ok: true, clients: result.clients };
        } catch (err) {
          recalculated = {
            ok: false,
            reason: err instanceof Error ? err.message : 'Falha ao recalcular a carteira.',
          };
        }
      }

      return {
        job: confirmed ?? job,
        summary: finalSummary,
        imported,
        recalculated,
      };
    },

    async listErrors(tenant, id, query) {
      await requireJob(tenant, id);
      return repository.listRowErrors(tenant.organizationId, id, query);
    },

    datasets() {
      return Object.values(DATASETS).map((spec) => ({
        key: spec.key,
        label: spec.label,
        description: spec.description,
        naturalKey: [...spec.naturalKey],
        fields: spec.fields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required,
          ...(field.description === undefined ? {} : { description: field.description }),
        })),
      }));
    },
  };
}
