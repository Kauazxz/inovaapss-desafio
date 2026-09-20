/**
 * Importação de dados (§34), o fluxo inteiro:
 *
 *   upload  → valida o tipo e o tamanho, guarda o arquivo no bucket privado "imports", lê as
 *             tabelas e responde o que encontrou (abas, cabeçalhos, amostra e o dataset provável)
 *   preview → escolhe o mapeamento (preset da planilha do desafio quando os cabeçalhos casam,
 *             senão sugestão pelos cabeçalhos, senão o que a pessoa mandou), valida tudo e
 *             devolve válidas, inválidas, duplicadas, campos ausentes e os erros por linha
 *   confirm → RELÊ o arquivo do storage, revalida (nunca confia no preview), grava planos,
 *             clientes, contratos e valores mensais, registra os erros por linha e dispara o
 *             recálculo da carteira
 *
 * O núcleo de leitura, mapeamento e validação é o @inovaapss/importer, que é puro. Este serviço
 * só orquestra e persiste.
 */
import { randomUUID } from 'node:crypto';

import {
  DATASETS,
  detectDataset,
  GLOBALSYS_SHEET_PRESETS,
  ImportReadError,
  importDataset,
  mergeReports,
  normalizeHeader,
  readTabular,
  suggestMapping,
} from '@inovaapss/importer';
import type {
  ClientRow,
  ClientStatusRow,
  DatasetKey,
  ImportReport,
  Mapping,
  MonthlyMetricsRow,
  NpsRow,
  TabularSheet,
} from '@inovaapss/importer';
import { IMPORT_MAX_UPLOAD_BYTES } from '@inovaapss/shared';
import type {
  ImportConfirmDto,
  ImportCountsDto,
  ImportDatasetKey,
  ImportFieldMappingDto,
  ImportJobDetailDto,
  ImportJobMappingDto,
  ImportJobPageDto,
  ImportJobSummaryDto,
  ImportMappingSource,
  ImportPreviewDto,
  ImportRecalculationDto,
  ImportResultDto,
  ImportRowErrorDto,
  ImportSheetDto,
  ImportSheetPreviewDto,
  ImportSkippedSheetDto,
  ImportUploadDto,
} from '@inovaapss/shared';
import {
  IMPORT_ERRORS_PAGE_SIZE,
  IMPORT_MAX_ROWS_PER_SHEET,
  IMPORT_PREVIEW_ERRORS_PER_SHEET,
  IMPORT_SAMPLE_ROWS,
  resolveImportFileType,
} from '@inovaapss/validation';
import type { ImportListQuery, ImportSheetSelection } from '@inovaapss/validation';

import { resolveMetricValues } from './ingest-repository.js';
import { cancellationEndDate, statusByExternalCode, toMetricValueInputs } from './ingest.js';
import { toPublicImportJob } from './repository.js';
import { buildImportObjectPath } from './storage.js';
import { AppError, NotFoundError } from '../../shared/errors.js';

import type { ImportIngestRepository, IngestClientInput } from './ingest-repository.js';
import type { ImportsRepository, NewImportRowErrorInput } from './repository.js';
import type { ImportJobRecord, UploadImportInput } from './types.js';
import type { DocumentStorage } from '../../infrastructure/storage/document-storage.js';
import type { TenantContext } from '../../middleware/tenant.js';

// ---------------------------------------------------------------- erros

export class UnsupportedImportFileTypeError extends AppError {
  constructor(reason: string) {
    super(415, 'UNSUPPORTED_FILE_TYPE', reason);
    this.name = 'UnsupportedImportFileTypeError';
  }
}

export class ImportFileTooLargeError extends AppError {
  constructor() {
    super(
      413,
      'FILE_TOO_LARGE',
      `O arquivo excede o limite de ${IMPORT_MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    );
    this.name = 'ImportFileTooLargeError';
  }
}

export class UnreadableImportFileError extends AppError {
  constructor(reason: string) {
    super(422, 'IMPORT_FILE_UNREADABLE', reason);
    this.name = 'UnreadableImportFileError';
  }
}

export class NoDatasetSelectedError extends AppError {
  constructor(reason: string) {
    super(422, 'IMPORT_NO_DATASET', reason);
    this.name = 'NoDatasetSelectedError';
  }
}

export class ImportSheetNotFoundError extends AppError {
  constructor(sheet: string) {
    super(400, 'IMPORT_SHEET_NOT_FOUND', `A tabela "${sheet}" não existe neste arquivo.`);
    this.name = 'ImportSheetNotFoundError';
  }
}

// ---------------------------------------------------------------- tipos internos

/**
 * Seleção vinda da pessoa ou relida de `mapping_json`. Nesse segundo caso ela traz a origem do
 * mapeamento, para reconfirmar um job não rebatizar de "manual" o que veio do preset.
 */
interface StoredSelection extends ImportSheetSelection {
  mappingSource?: ImportMappingSource | undefined;
}

/** Uma tabela do arquivo já casada com um dataset e um mapeamento. */
interface ResolvedSheet {
  sheet: TabularSheet;
  dataset: DatasetKey;
  mapping: Mapping;
  mappingSource: ImportMappingSource;
}

/** Confiança mínima para a detecção automática aceitar um dataset. */
const MIN_DETECTION_CONFIDENCE = 0.5;

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export interface ImportsServiceDependencies {
  repository: ImportsRepository;
  ingest: ImportIngestRepository;
  storage: DocumentStorage;
  /**
   * Recálculo da carteira depois da gravação (§62). Injetável para os testes e para o dia em
   * que virar fila: devolve `null` quando não havia o que recalcular.
   */
  recalculate?: (organizationId: string) => Promise<ImportRecalculationDto | null>;
  now?: () => Date;
}

export interface ConfirmImportOptions {
  /** Ausente (ou undefined) = vale o mapeamento guardado no preview, ou a detecção. */
  selections?: readonly ImportSheetSelection[] | undefined;
  /** false grava sem refazer os scores — útil para importar vários arquivos em sequência. */
  recalculate: boolean;
}

export interface ImportsService {
  upload(tenant: TenantContext, input: UploadImportInput): Promise<ImportUploadDto>;
  list(tenant: TenantContext, query: ImportListQuery): Promise<ImportJobPageDto>;
  get(tenant: TenantContext, id: string, page?: number): Promise<ImportJobDetailDto>;
  preview(
    tenant: TenantContext,
    id: string,
    selections?: readonly ImportSheetSelection[],
  ): Promise<ImportPreviewDto>;
  confirm(
    tenant: TenantContext,
    id: string,
    options: ConfirmImportOptions,
  ): Promise<ImportConfirmDto>;
}

// ---------------------------------------------------------------- helpers puros

/** Confere os primeiros bytes contra o tipo declarado (§45): o MIME vem do cliente, os bytes não. */
export function assertContentMatchesFileType(buffer: Buffer, fileType: string): void {
  const head = buffer.subarray(0, 4);
  if (fileType === 'XLSX' && !head.equals(ZIP_SIGNATURE)) {
    throw new UnsupportedImportFileTypeError('O conteúdo não é uma planilha XLSX válida.');
  }
  if ((fileType === 'CSV' || fileType === 'JSON') && buffer.subarray(0, 1024).includes(0)) {
    throw new UnsupportedImportFileTypeError(
      'O arquivo declarado como texto contém dados binários.',
    );
  }
}

/**
 * Traduz um mapeamento escrito com cabeçalhos normalizados (é o caso do preset da planilha) para
 * os cabeçalhos originais da tabela. Devolve `null` quando algum campo obrigatório do preset não
 * tem coluna correspondente — aí o preset não serve e a sugestão assume.
 */
export function resolvePresetMapping(sheet: TabularSheet, preset: Mapping): Mapping | null {
  const resolved: Mapping = {};
  for (const [field, header] of Object.entries(preset)) {
    if (header === null) {
      resolved[field] = null;
      continue;
    }
    const index = sheet.normalizedHeaders.indexOf(normalizeHeader(header));
    if (index < 0) return null;
    resolved[field] = sheet.headers[index] ?? null;
  }
  return resolved;
}

/** O preset da planilha do desafio serve para esta tabela? (nome da aba + cabeçalhos). */
export function presetFor(sheet: TabularSheet): { dataset: DatasetKey; mapping: Mapping } | null {
  const sheetName = normalizeHeader(sheet.name);
  const preset = GLOBALSYS_SHEET_PRESETS.find((item) => normalizeHeader(item.sheet) === sheetName);
  if (preset === undefined) return null;
  const mapping = resolvePresetMapping(sheet, preset.mapping);
  return mapping === null ? null : { dataset: preset.dataset, mapping };
}

/** Campos do dataset, com rótulo e tipo, prontos para a tabela de mapeamento da tela. */
export function toFieldMappings(
  dataset: DatasetKey,
  mapping: Mapping,
  mappingSource: ImportMappingSource,
  headers: readonly string[],
): ImportFieldMappingDto[] {
  const suggestion = suggestMapping(headers, dataset);
  const confidenceByField = new Map(suggestion.fields.map((field) => [field.field, field]));
  return DATASETS[dataset].fields.map((field) => {
    const header = mapping[field.key] ?? null;
    const suggested = confidenceByField.get(field.key);
    // Quando a coluna é a que o detector escolheria, mostra o motivo e a confiança dele;
    // quando a pessoa (ou o preset) escolheu outra, o motivo é esse.
    const sameAsSuggested = suggested?.header === header;
    return {
      field: field.key,
      label: field.label,
      required: field.required,
      type: field.type,
      description: field.description ?? null,
      header,
      confidence: sameAsSuggested ? (suggested?.confidence ?? 0) : header === null ? 0 : 1,
      reason: sameAsSuggested
        ? (suggested?.reason ?? 'none')
        : header === null
          ? 'none'
          : mappingSource === 'preset'
            ? 'preset'
            : 'manual',
    };
  });
}

function toCounts(report: ImportReport): ImportCountsDto {
  return {
    total: report.total,
    valid: report.valid,
    invalid: report.invalid,
    duplicates: report.duplicates,
    missingFields: [...report.missingFields],
  };
}

function toRowErrors(
  report: ImportReport,
  sheet: string,
  dataset: DatasetKey,
): ImportRowErrorDto[] {
  return report.errors.map((error) => ({
    row: error.row,
    sheet,
    dataset: dataset as ImportDatasetKey,
    field: error.field,
    code: error.code,
    message: error.message,
  }));
}

/** O arquivo virou tabelas: o que a tela mostra antes de mapear. */
export function toSheetDtos(sheets: readonly TabularSheet[]): ImportSheetDto[] {
  return sheets.map((sheet) => {
    const best = detectDataset(sheet.headers)[0];
    const preset = presetFor(sheet);
    const detected =
      preset !== null
        ? { dataset: preset.dataset, confidence: 1 }
        : best !== undefined && best.confidence >= MIN_DETECTION_CONFIDENCE
          ? { dataset: best.dataset, confidence: best.confidence }
          : null;
    return {
      name: sheet.name,
      headers: [...sheet.headers],
      rowCount: sheet.rows.length,
      sample: sheet.rows.slice(0, IMPORT_SAMPLE_ROWS),
      detectedDataset: (detected?.dataset ?? null) as ImportDatasetKey | null,
      detectionConfidence: detected?.confidence ?? 0,
    };
  });
}

// ---------------------------------------------------------------- serviço

export function createImportsService(deps: ImportsServiceDependencies): ImportsService {
  const { repository, ingest, storage } = deps;
  const now = deps.now ?? (() => new Date());

  const requireJob = async (tenant: TenantContext, id: string): Promise<ImportJobRecord> => {
    const job = await repository.findJob(tenant.organizationId, id);
    if (job === null) throw new NotFoundError('Importação não encontrada.');
    return job;
  };

  /** Lê o arquivo do storage e devolve as tabelas; erro de leitura vira 422 com a razão. */
  const readSheets = (buffer: Buffer, fileType: ImportJobRecord['fileType']): TabularSheet[] => {
    let sheets: TabularSheet[];
    try {
      sheets = readTabular(buffer, fileType).sheets;
    } catch (err) {
      if (err instanceof ImportReadError) throw new UnreadableImportFileError(err.message);
      throw err;
    }
    if (sheets.length === 0) {
      throw new UnreadableImportFileError('O arquivo não tem nenhuma tabela com dados.');
    }
    const tooBig = sheets.find((sheet) => sheet.rows.length > IMPORT_MAX_ROWS_PER_SHEET);
    if (tooBig !== undefined) {
      throw new UnreadableImportFileError(
        `A tabela "${tooBig.name}" tem ${tooBig.rows.length} linhas; o limite por importação é ${IMPORT_MAX_ROWS_PER_SHEET}. Divida o arquivo.`,
      );
    }
    return sheets;
  };

  const loadSheets = async (job: ImportJobRecord): Promise<TabularSheet[]> => {
    const buffer = await storage.download(job.filePath);
    return readSheets(buffer, job.fileType);
  };

  /**
   * Decide dataset e mapeamento de cada tabela. Com `selections`, manda a pessoa; sem elas,
   * tenta o preset da planilha do desafio e depois a detecção pelos cabeçalhos. O que não casa
   * com nada é ignorado com o motivo (abas "Leia-me" e "dicionario" caem aqui).
   */
  const resolveSelections = (
    sheets: readonly TabularSheet[],
    selections: readonly StoredSelection[] | undefined,
  ): { resolved: ResolvedSheet[]; skipped: ImportSkippedSheetDto[] } => {
    const resolved: ResolvedSheet[] = [];
    const skipped: ImportSkippedSheetDto[] = [];

    if (selections !== undefined && selections.length > 0) {
      const chosen = new Set(selections.map((selection) => selection.sheet));
      for (const selection of selections) {
        const sheet = sheets.find((item) => item.name === selection.sheet);
        if (sheet === undefined) throw new ImportSheetNotFoundError(selection.sheet);
        // O preset só vale se a pessoa manteve o conjunto de dados que ele descreve; trocar o
        // conjunto e herdar o mapeamento antigo casaria colunas com campos de outra tabela.
        const preset = presetFor(sheet);
        const doPreset = preset !== null && preset.dataset === selection.dataset;
        resolved.push({
          sheet,
          dataset: selection.dataset,
          mapping:
            selection.mapping ??
            (doPreset ? preset.mapping : suggestMapping(sheet.headers, selection.dataset).mapping),
          mappingSource:
            selection.mappingSource ??
            (selection.mapping !== undefined ? 'manual' : doPreset ? 'preset' : 'suggested'),
        });
      }
      for (const sheet of sheets) {
        if (!chosen.has(sheet.name)) {
          skipped.push({ sheet: sheet.name, reason: 'Não selecionada para esta importação.' });
        }
      }
      return { resolved, skipped };
    }

    for (const sheet of sheets) {
      const preset = presetFor(sheet);
      if (preset !== null) {
        resolved.push({ ...preset, sheet, mappingSource: 'preset' });
        continue;
      }
      const best = detectDataset(sheet.headers)[0];
      if (best === undefined || best.confidence < MIN_DETECTION_CONFIDENCE) {
        skipped.push({
          sheet: sheet.name,
          reason: 'Os cabeçalhos não correspondem a nenhum conjunto de dados conhecido.',
        });
        continue;
      }
      resolved.push({
        sheet,
        dataset: best.dataset,
        mapping: best.suggestion.mapping,
        mappingSource: 'suggested',
      });
    }
    return { resolved, skipped };
  };

  /** Valida cada tabela resolvida e devolve as linhas tipadas mais o relatório. */
  const validateAll = (
    resolved: readonly ResolvedSheet[],
  ): { sheet: ResolvedSheet; rows: unknown[]; report: ImportReport }[] =>
    resolved.map((item) => {
      const result = importDataset(item.dataset, item.sheet.rows, item.mapping, item.sheet.headers);
      return { sheet: item, rows: result.rows as unknown[], report: result.report };
    });

  const toMappingDtos = (resolved: readonly ResolvedSheet[]): ImportJobMappingDto[] =>
    resolved.map((item) => ({
      sheet: item.sheet.name,
      dataset: item.dataset as ImportDatasetKey,
      mapping: { ...item.mapping },
      mappingSource: item.mappingSource,
    }));

  const toSummary = (
    validated: readonly { sheet: ResolvedSheet; report: ImportReport }[],
  ): ImportJobSummaryDto => {
    const merged = mergeReports(validated.map((item) => item.report));
    return {
      counts: toCounts(merged),
      errorCount: merged.errors.length,
      sheets: validated.map((item) => ({
        sheet: item.sheet.sheet.name,
        dataset: item.sheet.dataset as ImportDatasetKey,
        counts: toCounts(item.report),
      })),
    };
  };

  return {
    async upload(tenant, input) {
      const resolved = resolveImportFileType(input.fileName, input.mimeType);
      if (!resolved.ok) throw new UnsupportedImportFileTypeError(resolved.reason);
      if (input.buffer.length === 0) {
        throw new UnsupportedImportFileTypeError('O arquivo está vazio.');
      }
      if (input.buffer.length > IMPORT_MAX_UPLOAD_BYTES) throw new ImportFileTooLargeError();
      assertContentMatchesFileType(input.buffer, resolved.fileType);

      // Lê ANTES de gravar: um arquivo ilegível não vira job nem ocupa o bucket.
      const sheets = readSheets(input.buffer, resolved.fileType);

      const id = randomUUID();
      const filePath = buildImportObjectPath(tenant.organizationId, id, input.fileName);
      await storage.upload({
        path: filePath,
        body: input.buffer,
        contentType: resolved.mimeType,
      });
      let job: ImportJobRecord;
      try {
        job = await repository.createJob({
          id,
          organizationId: tenant.organizationId,
          fileName: input.fileName,
          filePath,
          fileType: resolved.fileType,
          sizeBytes: input.buffer.length,
          createdBy: tenant.userId,
        });
      } catch (err) {
        // Sem linha no banco o objeto ficaria órfão: remove e propaga.
        await storage.remove([filePath]).catch(() => undefined);
        throw err;
      }

      return { job: toPublicImportJob(job), sheets: toSheetDtos(sheets) };
    },

    async list(tenant, query) {
      const { items, total } = await repository.listJobs(tenant.organizationId, query);
      return { items, page: query.page, pageSize: query.pageSize, total };
    },

    async get(tenant, id, page = 1) {
      const job = await requireJob(tenant, id);
      // O detalhe continua útil sem o arquivo: o histórico e os erros já estão no banco.
      const sheets: ImportSheetDto[] | null = await loadSheets(job)
        .then(toSheetDtos)
        .catch(() => null);
      const errors = await repository.listRowErrors(tenant.organizationId, id, {
        page,
        pageSize: IMPORT_ERRORS_PAGE_SIZE,
      });
      return {
        job: toPublicImportJob(job),
        sheets,
        errors: errors.items,
        errorTotal: errors.total,
      };
    },

    async preview(tenant, id, selections) {
      const job = await requireJob(tenant, id);
      const sheets = await loadSheets(job);
      const { resolved, skipped } = resolveSelections(sheets, selections);
      if (resolved.length === 0) {
        throw new NoDatasetSelectedError(
          'Nenhuma tabela do arquivo corresponde a um conjunto de dados conhecido. Escolha o conjunto e as colunas na tela de mapeamento.',
        );
      }

      const validated = validateAll(resolved);
      const summary = toSummary(validated);
      const updated = await repository.updateJob(tenant.organizationId, id, {
        status: 'previewed',
        mapping: toMappingDtos(resolved),
        summary,
        errorMessage: null,
      });

      const previews: ImportSheetPreviewDto[] = validated.map((item) => ({
        sheet: item.sheet.sheet.name,
        dataset: item.sheet.dataset as ImportDatasetKey,
        mapping: { ...item.sheet.mapping },
        mappingSource: item.sheet.mappingSource,
        fields: toFieldMappings(
          item.sheet.dataset,
          item.sheet.mapping,
          item.sheet.mappingSource,
          item.sheet.sheet.headers,
        ),
        unmappedHeaders: item.sheet.sheet.headers.filter(
          (header) => !Object.values(item.sheet.mapping).includes(header),
        ),
        counts: toCounts(item.report),
        sample: item.rows.slice(0, IMPORT_SAMPLE_ROWS) as Record<string, unknown>[],
        errors: toRowErrors(item.report, item.sheet.sheet.name, item.sheet.dataset).slice(
          0,
          IMPORT_PREVIEW_ERRORS_PER_SHEET,
        ),
      }));

      return {
        job: toPublicImportJob(updated ?? job),
        sheets: previews,
        skipped,
        counts: summary.counts,
        errorCount: summary.errorCount,
      };
    },

    async confirm(tenant, id, options) {
      const job = await requireJob(tenant, id);
      const sheets = await loadSheets(job);
      // Sem seleção nova, vale a do preview; sem preview, detecta de novo.
      const selections =
        options.selections ??
        (job.mapping === null
          ? undefined
          : job.mapping.map((item) => ({
              sheet: item.sheet,
              dataset: item.dataset,
              mapping: item.mapping,
              mappingSource: item.mappingSource,
            })));
      const { resolved } = resolveSelections(sheets, selections);
      if (resolved.length === 0) {
        throw new NoDatasetSelectedError(
          'Nenhuma tabela selecionada para importar. Volte ao mapeamento e escolha ao menos uma.',
        );
      }

      // Revalida do arquivo guardado: o preview é informação, não autorização (§45).
      const validated = validateAll(resolved);

      // ---------------------------------------------------- erros por linha
      const rowErrors: NewImportRowErrorInput[] = [];
      for (const item of validated) {
        for (const error of item.report.errors) {
          rowErrors.push({
            importJobId: job.id,
            organizationId: tenant.organizationId,
            sheet: item.sheet.sheet.name,
            dataset: item.sheet.dataset as ImportDatasetKey,
            rowNumber: error.row,
            field: error.field,
            errorCode: error.code,
            message: error.message,
            rawData: (item.sheet.sheet.rows[error.row - 1] ?? null) as Record<
              string,
              unknown
            > | null,
          });
        }
      }
      await repository.replaceRowErrors(tenant.organizationId, job.id, rowErrors);

      // ---------------------------------------------------- linhas por dataset
      const byDataset = <T>(dataset: DatasetKey): T[] =>
        validated
          .filter((item) => item.sheet.dataset === dataset)
          .flatMap((item) => item.rows as T[]);

      const clientRows = byDataset<ClientRow>('clients');
      const statusRows = byDataset<ClientStatusRow>('client_status');
      const monthlyRows = byDataset<MonthlyMetricsRow>('monthly_metrics');
      const npsRows = byDataset<NpsRow>('nps');

      const result: ImportResultDto = {
        plansCreated: 0,
        clientsCreated: 0,
        clientsUpdated: 0,
        clientsCancelled: 0,
        contractsCreated: 0,
        contractsUpdated: 0,
        metricValues: 0,
        rowErrors: rowErrors.length,
        skipped: [],
        recalculation: null,
      };
      const skipped = new Set<string>();

      // ---------------------------------------------------- planos, clientes e contratos
      const statuses = statusByExternalCode(statusRows);
      let clientIdByCode = new Map<string, string>();

      if (clientRows.length > 0) {
        const plans = await ingest.ensurePlans(
          tenant.organizationId,
          clientRows.map((row) => row.plan),
        );
        result.plansCreated = plans.created;

        const inputs: IngestClientInput[] = clientRows.map((row) => {
          const situation = statuses.get(row.external_code);
          const status = situation?.status === 'cancelled' ? 'cancelled' : 'active';
          return {
            externalCode: row.external_code,
            name: row.name,
            segment: row.segment,
            size: row.size,
            plan: row.plan,
            monthlyValue: row.monthly_value,
            contractedSlaHours: row.contracted_sla_hours,
            contractStart: row.contract_start,
            status,
            contractEnd: cancellationEndDate(situation),
          };
        });
        const written = await ingest.upsertClients(tenant.organizationId, inputs, plans.idByName);
        result.clientsCreated = written.created;
        result.clientsUpdated = written.updated;
        result.clientsCancelled = written.cancelled;
        result.contractsCreated = written.contractsCreated;
        result.contractsUpdated = written.contractsUpdated;
        clientIdByCode = written.clientIdByCode;
      }

      // Situação de clientes que não vieram na aba de clientes (arquivo só de cancelamentos).
      const pendingStatuses = statusRows.filter((row) => !clientIdByCode.has(row.external_code));
      if (pendingStatuses.length > 0) {
        const applied = await ingest.applyStatuses(
          tenant.organizationId,
          pendingStatuses.map((row) => ({
            externalCode: row.external_code,
            status: row.status === 'cancelled' ? 'cancelled' : 'active',
            contractEnd: cancellationEndDate(row),
          })),
        );
        result.clientsUpdated += applied.updated;
        result.clientsCancelled += applied.cancelled;
        for (const code of applied.missing) skipped.add(`cliente ${code} não cadastrado`);
      }

      // ---------------------------------------------------- valores mensais e NPS
      if (monthlyRows.length > 0 || npsRows.length > 0) {
        // Clientes criados agora entram junto com os que já estavam lá.
        const known = await ingest.clientIdsByExternalCode(tenant.organizationId);
        for (const [code, clientId] of clientIdByCode) known.set(code, clientId);
        const metricIds = await ingest.metricIdsBySlug(tenant.organizationId);

        const values = toMetricValueInputs(monthlyRows, npsRows);
        const resolvedValues = resolveMetricValues(values, known, metricIds);
        for (const reason of resolvedValues.skipped) skipped.add(reason);
        result.metricValues = await ingest.upsertMetricValues(
          tenant.organizationId,
          resolvedValues.resolved,
          job.fileName,
          job.fileType,
        );
      }

      result.skipped = [...skipped];

      // ---------------------------------------------------- recálculo (§62)
      if (options.recalculate && deps.recalculate) {
        try {
          result.recalculation = await deps.recalculate(tenant.organizationId);
        } catch (err) {
          // Importar deu certo; recalcular, não. O job não vira falha por isso: o resumo diz
          // o motivo e a pessoa roda o recálculo depois.
          result.recalculation = {
            clients: 0,
            clientSnapshots: 0,
            metricSnapshots: 0,
            alerts: 0,
            skippedReason: err instanceof Error ? err.message : 'Falha ao recalcular a carteira.',
          };
        }
      }

      const summary: ImportJobSummaryDto = { ...toSummary(validated), result };
      const updated = await repository.updateJob(tenant.organizationId, id, {
        status: 'confirmed',
        mapping: toMappingDtos(resolved),
        summary,
        errorMessage: null,
        finishedAt: now(),
      });

      return { job: toPublicImportJob(updated ?? job), result };
    },
  };
}
