/**
 * Formas que as rotas de importação devolvem (§34, §37). São o contrato com a web: a tela
 * `apps/web/src/features/import/` declara estes mesmos campos.
 */
import type {
  DatasetKey,
  FieldMappingSuggestion,
  ImportErrorCode,
  Mapping,
  RawRow,
} from '@inovaapss/importer';
import type { ImportFileType, ImportJobStatus } from '@inovaapss/shared';

/** `ImportReport` sem a lista de erros (que mora em `import_row_errors`), mais a contagem. */
export interface ImportSummary {
  /** Linhas de dados lidas: `total = valid + invalid + duplicates`. */
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  /** Campos obrigatórios sem coluna mapeada. */
  missingFields: string[];
  /** Quantos erros de linha o relatório tem (pode passar do que ficou guardado). */
  errorCount: number;
}

/** Uma importação. */
export interface ImportJob {
  id: string;
  organizationId: string;
  fileName: string;
  fileType: ImportFileType;
  sizeBytes: number;
  status: ImportJobStatus;
  /** Tabela escolhida dentro do arquivo (aba do XLSX, `csv` ou chave do JSON). */
  sheetName: string | null;
  dataset: DatasetKey | null;
  mapping: Mapping | null;
  summary: ImportSummary | null;
  rowsImported: number;
  errorMessage: string | null;
  createdBy: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Linha recusada, como a tela de erros mostra. */
export interface ImportRowErrorItem {
  id: string;
  row: number;
  field: string | null;
  code: ImportErrorCode;
  message: string;
  rawData: RawRow | null;
}

/** Um dataset candidato para uma tabela do arquivo, já com o mapeamento sugerido. */
export interface DatasetSuggestion {
  dataset: DatasetKey;
  label: string;
  /** 0–1: média da confiança dos campos obrigatórios (0 quando algum ficou sem coluna). */
  confidence: number;
  mapping: Mapping;
  fields: FieldMappingSuggestion[];
  /** Cabeçalhos do arquivo que nenhum campo usou. */
  unmappedHeaders: string[];
  /** Campos obrigatórios sem coluna. */
  missingRequired: string[];
}

/** Uma tabela encontrada no arquivo, com amostra e os datasets candidatos. */
export interface ImportSheet {
  name: string;
  headers: string[];
  /** Linhas de dados (sem o cabeçalho). */
  rowCount: number;
  /** Primeiras linhas, com os valores já em texto para a tela mostrar sem interpretar. */
  sampleRows: Record<string, string | null>[];
  /** Os quatro datasets, do mais provável ao menos. */
  suggestions: DatasetSuggestion[];
}

export interface UploadImportResult {
  job: ImportJob;
  sheets: ImportSheet[];
}

export interface ImportJobDetail {
  job: ImportJob;
  /** Tabelas do arquivo; `null` quando o arquivo não pôde mais ser lido do armazenamento. */
  sheets: ImportSheet[] | null;
}

export interface PreviewImportResult {
  job: ImportJob;
  summary: ImportSummary;
  /** Primeiros erros do relatório, prontos para a tela (o resto fica no relatório do job). */
  errors: Omit<ImportRowErrorItem, 'id'>[];
  /** Primeiras linhas válidas, já tipadas, para conferência antes de confirmar. */
  sampleRows: Record<string, unknown>[];
}

/** Linha válida que não pôde ser gravada (cliente fora da carteira, métrica não cadastrada). */
export interface SkippedRow {
  row: number;
  externalCode: string;
  reason: string;
}

/**
 * Resultado de uma gravação. Duas unidades diferentes, de propósito:
 * `rows` conta LINHAS DO ARQUIVO que entraram; `recordsCreated`/`recordsUpdated` contam
 * REGISTROS no banco — uma linha de atendimento mensal vira até nove linhas de `metric_values`.
 */
export interface ApplyResult {
  rows: number;
  recordsCreated: number;
  recordsUpdated: number;
  /** Linhas válidas que não puderam ser gravadas, com o motivo. */
  skipped: SkippedRow[];
}

export interface ConfirmImportResult {
  job: ImportJob;
  summary: ImportSummary;
  imported: ApplyResult;
  /** O recálculo roda depois de gravar; falhar nele não desfaz a importação (§62). */
  recalculated: { ok: boolean; reason?: string; clients?: number };
}

/** Catálogo que a tela de mapeamento lista (campos, rótulos, tipos e obrigatoriedade). */
export interface DatasetCatalogField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface DatasetCatalogItem {
  key: DatasetKey;
  label: string;
  description: string;
  naturalKey: string[];
  fields: DatasetCatalogField[];
}
