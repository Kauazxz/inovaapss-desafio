/**
 * §34 / §37 Imports — schemas Zod da importação de dados, usados pela API (rotas) e pelo web
 * (validação do arquivo antes de enviar, para o erro aparecer na hora).
 *
 * O que decide se um arquivo pode ser enviado é a dupla extensão + MIME (§45), como nos
 * documentos; aqui a allowlist é menor (só XLSX, CSV e JSON) e o limite é maior (20 MB).
 */
import { z } from 'zod';

import {
  IMPORT_DATASET_KEYS,
  IMPORT_EXTENSIONS,
  IMPORT_FILE_TYPES,
  IMPORT_JOB_STATUSES,
  IMPORT_MAPPING_SOURCES,
  IMPORT_MAX_UPLOAD_BYTES,
} from '@inovaapss/shared';
import type { AllowedUploadMimeType, ImportDatasetKey, ImportFileType } from '@inovaapss/shared';

import { paginationQuerySchema, uuidSchema } from '../common.js';

export const importFileTypeSchema = z.enum(IMPORT_FILE_TYPES);
export const importJobStatusSchema = z.enum(IMPORT_JOB_STATUSES);
export const importDatasetSchema = z.enum(IMPORT_DATASET_KEYS);
export const importMappingSourceSchema = z.enum(IMPORT_MAPPING_SOURCES);

// ---------- Arquivo aceito ----------

/** MIME que navegadores e sistemas mandam no lugar do canônico. */
const MIME_ALIASES: Readonly<Record<string, ImportFileType>> = {
  'application/vnd.ms-excel': 'CSV',
  'application/csv': 'CSV',
  'text/x-csv': 'CSV',
  'text/csv': 'CSV',
  'text/json': 'JSON',
  'application/json': 'JSON',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
};

/** MIME que não dizem nada sobre o conteúdo: a extensão decide sozinha. */
const GENERIC_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'application/x-zip-compressed',
  'application/zip',
  'text/plain',
]);

export function importExtensionOf(fileName: string): string {
  const match = /\.[^./\\]+$/.exec(fileName.trim());
  return match === null ? '' : match[0].toLowerCase();
}

export type ImportTypeResolution =
  | { ok: true; fileType: ImportFileType; mimeType: AllowedUploadMimeType; extension: string }
  | { ok: false; reason: string };

/**
 * Decide se o arquivo entra no importador: a extensão precisa estar na allowlist e o MIME
 * declarado precisa ser o canônico, um alias conhecido ou genérico. Devolve o MIME canônico,
 * que é o que fica gravado em `import_jobs.file_type` e no storage.
 */
export function resolveImportFileType(fileName: string, mimeType: string): ImportTypeResolution {
  const extension = importExtensionOf(fileName);
  const entry = IMPORT_EXTENSIONS[extension];
  if (entry === undefined) {
    return {
      ok: false,
      reason: `Extensão não aceita na importação. Envie ${Object.keys(IMPORT_EXTENSIONS).join(', ')}.`,
    };
  }
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const declared = MIME_ALIASES[normalized];
  if (!GENERIC_MIME_TYPES.has(normalized) && declared !== entry.fileType) {
    return {
      ok: false,
      reason: `O tipo "${normalized || 'desconhecido'}" não corresponde à extensão ${extension}.`,
    };
  }
  return { ok: true, fileType: entry.fileType, mimeType: entry.mimeType, extension };
}

/** Mesma checagem de tamanho da API, para a tela recusar antes de subir 20 MB à toa. */
export function isImportSizeAllowed(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= IMPORT_MAX_UPLOAD_BYTES;
}

// ---------- Corpo das rotas ----------

/** Campo do dataset → cabeçalho do arquivo (`null` = campo sem coluna). */
export const importMappingSchema = z.record(z.string().min(1), z.string().min(1).nullable());

/** Uma tabela do arquivo com o dataset e o mapeamento escolhidos pela pessoa. */
export const importSheetSelectionSchema = z.object({
  /** Nome da aba/tabela, como veio em `sheets[].name`. */
  sheet: z.string().trim().min(1, 'Informe a tabela.'),
  dataset: importDatasetSchema,
  /** Sem mapeamento, a API sugere (preset da planilha ou cabeçalhos). */
  mapping: importMappingSchema.optional(),
});
export type ImportSheetSelection = z.infer<typeof importSheetSelectionSchema>;

/**
 * Corpo de `POST /imports/:id/preview` e de `POST /imports/:id/confirm`. Sem `sheets`, a API
 * detecta sozinha: aplica o preset da planilha do desafio quando os cabeçalhos casam e, fora
 * disso, sugere o mapeamento pelos cabeçalhos.
 */
export const importPreviewBodySchema = z.object({
  sheets: z
    .array(importSheetSelectionSchema)
    .max(20, 'No máximo 20 tabelas por importação.')
    .optional(),
});
export type ImportPreviewBody = z.infer<typeof importPreviewBodySchema>;

/**
 * Confirmação. `recalculate: false` grava sem refazer os scores — útil para importar vários
 * arquivos em sequência e recalcular uma vez só no fim.
 */
export const importConfirmBodySchema = importPreviewBodySchema.extend({
  recalculate: z.boolean().default(true),
});
export type ImportConfirmBody = z.infer<typeof importConfirmBodySchema>;

export const importIdParamsSchema = z.object({ id: uuidSchema });

export const importListQuerySchema = paginationQuerySchema.extend({
  status: importJobStatusSchema.optional(),
});
export type ImportListQuery = z.infer<typeof importListQuerySchema>;

/** Quantos erros por linha o detalhe devolve de uma vez. */
export const IMPORT_ERRORS_PAGE_SIZE = 100;

/** Quantos erros cada tabela mostra no preview (o total continua em `errorCount`). */
export const IMPORT_PREVIEW_ERRORS_PER_SHEET = 50;

/** Quantas linhas de amostra a tela recebe por tabela. */
export const IMPORT_SAMPLE_ROWS = 5;

/** Teto de linhas por tabela, para um arquivo grande não derrubar o processo (§45). */
export const IMPORT_MAX_ROWS_PER_SHEET = 200_000;

export type { ImportDatasetKey };
