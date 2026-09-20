/**
 * Importação de dados (§34, §36 `import_jobs`/`import_row_errors`, §37 Imports, ajuste A4).
 *
 * Aqui ficam o vocabulário do fluxo — status do job, formatos aceitos, datasets — e os DTOs que
 * a API devolve e a tela `/import` consome. O motor de leitura, mapeamento e validação vive em
 * `@inovaapss/importer`, que depende deste pacote; por isso nada aqui importa de lá (seria um
 * ciclo). `IMPORT_DATASET_KEYS` espelha `DATASET_KEYS` do importador, e um teste da API confere
 * que as duas listas continuam iguais.
 */
import { IMPORT_FILE_TYPES } from '../domain.js';

import type { AllowedUploadMimeType, ImportFileType } from '../domain.js';

// ---------- Estados do job (§34: upload → preview → confirmação) ----------

export const IMPORT_JOB_STATUSES = ['uploaded', 'previewed', 'confirmed', 'failed'] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const IMPORT_JOB_STATUS_LABELS: Readonly<Record<ImportJobStatus, string>> = {
  uploaded: 'Arquivo recebido',
  previewed: 'Prévia conferida',
  confirmed: 'Importado',
  failed: 'Falhou',
};

// ---------- Datasets (espelho de DATASET_KEYS em @inovaapss/importer) ----------

export const IMPORT_DATASET_KEYS = ['clients', 'monthly_metrics', 'nps', 'client_status'] as const;
export type ImportDatasetKey = (typeof IMPORT_DATASET_KEYS)[number];

export const IMPORT_DATASET_LABELS: Readonly<Record<ImportDatasetKey, string>> = {
  clients: 'Clientes',
  monthly_metrics: 'Atendimento mensal',
  nps: 'Pesquisas de NPS',
  client_status: 'Situação dos clientes',
};

// ---------- Arquivo aceito (§45: allowlist de extensão + MIME; limite próprio do importador) ----------

/** Limite do importador: 20 MB (planilhas são maiores que documentos). */
export const IMPORT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Extensão (minúscula, com ponto) → formato do importador e MIME canônico gravado. */
export const IMPORT_EXTENSIONS: Readonly<
  Record<string, { fileType: ImportFileType; mimeType: AllowedUploadMimeType }>
> = {
  '.xlsx': {
    fileType: 'XLSX',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  '.csv': { fileType: 'CSV', mimeType: 'text/csv' },
  '.json': { fileType: 'JSON', mimeType: 'application/json' },
};

/** Extensões aceitas, na ordem de exibição na tela. */
export const ALLOWED_IMPORT_EXTENSIONS: readonly string[] = Object.keys(IMPORT_EXTENSIONS);

/** MIME canônicos dos formatos tabulares (subconjunto da allowlist de §45). */
export const ALLOWED_IMPORT_MIME_TYPES: readonly AllowedUploadMimeType[] = Object.values(
  IMPORT_EXTENSIONS,
).map((entry) => entry.mimeType);

/** Valor pronto para o atributo `accept` de um `<input type="file">`. */
export const IMPORT_ACCEPT_ATTRIBUTE: string = [
  ...ALLOWED_IMPORT_EXTENSIONS,
  ...ALLOWED_IMPORT_MIME_TYPES,
].join(',');

/** Formatos, prontos para a mensagem "aceitos: XLSX, CSV, JSON". */
export const IMPORT_FILE_TYPE_LIST: string = IMPORT_FILE_TYPES.join(', ');

// ---------- DTOs do fluxo ----------

/** Uma tabela encontrada no arquivo (aba do XLSX, o CSV inteiro ou uma chave do JSON). */
export interface ImportSheetDto {
  /** Nome da aba, `csv` ou a chave do JSON. */
  name: string;
  /** Cabeçalhos como vieram do arquivo. */
  headers: string[];
  /** Linhas de dados na tabela. */
  rowCount: number;
  /** Primeiras linhas, para a pessoa reconhecer a tabela antes de mapear. */
  sample: Record<string, unknown>[];
  /** Dataset que o detector escolheu (`null` quando nada passou do mínimo de confiança). */
  detectedDataset: ImportDatasetKey | null;
  /** Confiança da detecção, 0–1. */
  detectionConfidence: number;
}

/** Um campo do dataset na tabela de mapeamento coluna → campo. */
export interface ImportFieldMappingDto {
  /** Identificador do campo no dataset (ex.: `external_code`). */
  field: string;
  /** Rótulo em português. */
  label: string;
  required: boolean;
  /** Tipo do campo (`text`, `number`, `period`...), para a tela explicar o formato esperado. */
  type: string;
  description: string | null;
  /** Cabeçalho escolhido no arquivo; `null` = campo sem coluna. */
  header: string | null;
  /** 0–1: 1 = nome idêntico, 0,95 = sinônimo exato, abaixo disso = parcial. */
  confidence: number;
  /** Como a escolha foi feita, para a tela dizer o porquê. */
  reason: 'exact' | 'synonym' | 'partial' | 'tokens' | 'none' | 'preset' | 'manual';
}

/** De onde veio o mapeamento de uma tabela. */
export const IMPORT_MAPPING_SOURCES = ['preset', 'suggested', 'manual'] as const;
export type ImportMappingSource = (typeof IMPORT_MAPPING_SOURCES)[number];

export const IMPORT_MAPPING_SOURCE_LABELS: Readonly<Record<ImportMappingSource, string>> = {
  preset: 'Planilha do desafio (mapeamento fixo)',
  suggested: 'Sugerido pelos cabeçalhos',
  manual: 'Ajustado por você',
};

/** Erro de uma linha, como o preview mostra e `import_row_errors` guarda. */
export interface ImportRowErrorDto {
  /** Posição entre as linhas de dados: 1 = primeira depois do cabeçalho. */
  row: number;
  /** Tabela de origem (nome da aba). */
  sheet: string;
  dataset: ImportDatasetKey;
  /** Campo do dataset; `null` quando o erro é da linha inteira. */
  field: string | null;
  code: string;
  message: string;
}

/** Contagens de uma tabela (§34: válidas, inválidas, duplicidades, campos ausentes). */
export interface ImportCountsDto {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  missingFields: string[];
}

/** Resultado da validação de uma tabela no preview. */
export interface ImportSheetPreviewDto {
  sheet: string;
  dataset: ImportDatasetKey;
  /** Campo → cabeçalho do arquivo (`null` = sem coluna). */
  mapping: Record<string, string | null>;
  mappingSource: ImportMappingSource;
  fields: ImportFieldMappingDto[];
  /** Cabeçalhos do arquivo que nenhum campo usou. */
  unmappedHeaders: string[];
  counts: ImportCountsDto;
  /** Primeiras linhas válidas já tipadas, para conferência. */
  sample: Record<string, unknown>[];
  errors: ImportRowErrorDto[];
}

/** Tabelas ignoradas (não casaram com nenhum dataset, ou a pessoa desmarcou). */
export interface ImportSkippedSheetDto {
  sheet: string;
  reason: string;
}

export interface ImportPreviewDto {
  job: ImportJobDto;
  sheets: ImportSheetPreviewDto[];
  skipped: ImportSkippedSheetDto[];
  /** Soma das tabelas selecionadas. */
  counts: ImportCountsDto;
  /** Total de erros; `sheets[].errors` traz só os primeiros de cada tabela. */
  errorCount: number;
}

/** O que a confirmação gravou (§34 importação + §62 recálculo). */
export interface ImportResultDto {
  plansCreated: number;
  clientsCreated: number;
  clientsUpdated: number;
  clientsCancelled: number;
  contractsCreated: number;
  contractsUpdated: number;
  metricValues: number;
  /** Linhas recusadas que foram para `import_row_errors`. */
  rowErrors: number;
  /** Códigos de cliente ou slugs de métrica que não existiam e foram ignorados. */
  skipped: string[];
  /** Resumo do recálculo; `null` quando não havia modelo ativo para rodar. */
  recalculation: ImportRecalculationDto | null;
}

export interface ImportRecalculationDto {
  clients: number;
  clientSnapshots: number;
  metricSnapshots: number;
  alerts: number;
  /** Motivo de não ter recalculado, quando foi o caso. */
  skippedReason?: string;
}

export interface ImportConfirmDto {
  job: ImportJobDto;
  result: ImportResultDto;
}

/** Um job de importação, como a lista e o detalhe mostram. */
export interface ImportJobDto {
  id: string;
  organizationId: string;
  fileName: string;
  fileType: ImportFileType;
  sizeBytes: number;
  status: ImportJobStatus;
  /** Mapeamento final por tabela, guardado em `mapping_json`. */
  mapping: ImportJobMappingDto[] | null;
  /** Contagens e resultado, guardados em `summary_json`. */
  summary: ImportJobSummaryDto | null;
  /** Mensagem do que impediu a importação (status `failed`). */
  error: string | null;
  createdBy: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface ImportJobMappingDto {
  sheet: string;
  dataset: ImportDatasetKey;
  mapping: Record<string, string | null>;
  mappingSource: ImportMappingSource;
}

export interface ImportJobSummaryDto {
  counts: ImportCountsDto;
  errorCount: number;
  sheets: { sheet: string; dataset: ImportDatasetKey; counts: ImportCountsDto }[];
  result?: ImportResultDto;
}

export interface ImportUploadDto {
  job: ImportJobDto;
  sheets: ImportSheetDto[];
}

export interface ImportJobDetailDto {
  job: ImportJobDto;
  /** Tabelas do arquivo, relidas do storage. `null` quando o arquivo não pôde ser lido. */
  sheets: ImportSheetDto[] | null;
  /** Erros gravados por linha, paginados. */
  errors: ImportRowErrorDto[];
  errorTotal: number;
}

export interface ImportJobPageDto {
  items: ImportJobDto[];
  page: number;
  pageSize: number;
  total: number;
}
