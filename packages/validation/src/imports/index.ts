/**
 * §34 / §36 / §45 (+ A4) — importação de dados tabulares.
 *
 * O que API e web precisam combinar sobre uma importação mora aqui: quais arquivos entram
 * (XLSX, CSV e JSON — um subconjunto da allowlist de documentos), os limites de tamanho e de
 * linhas, e os schemas do corpo de cada rota (`/imports`, `/imports/:id/preview`,
 * `/imports/:id/confirm`). A leitura, o mapeamento e a validação das LINHAS ficam em
 * `@inovaapss/importer`, que não é carregado pelo navegador.
 */
import { z } from 'zod';

import {
  type AllowedUploadMimeType,
  IMPORT_DATASET_KEYS,
  IMPORT_ERROR_CODES,
  IMPORT_FILE_TYPES,
  type ImportFileType,
  IMPORT_JOB_STATUSES,
} from '@inovaapss/shared';

import { paginationQuerySchema, uuidSchema } from '../common.js';
import { fileExtensionOf, MAX_UPLOAD_BYTES } from '../documents/index.js';

// ---------- Arquivos aceitos (§45 — allowlist de extensão + MIME) ----------

/** Extensão (minúscula, com ponto) → formato lógico e MIME canônico do importador. */
export const IMPORT_UPLOAD_EXTENSIONS: Readonly<
  Record<string, { fileType: ImportFileType; mimeType: AllowedUploadMimeType }>
> = {
  '.xlsx': {
    fileType: 'XLSX',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  '.csv': { fileType: 'CSV', mimeType: 'text/csv' },
  '.json': { fileType: 'JSON', mimeType: 'application/json' },
};

/** Extensões aceitas na importação, na ordem em que a tela as anuncia. */
export const ALLOWED_IMPORT_EXTENSIONS: readonly string[] = Object.keys(IMPORT_UPLOAD_EXTENSIONS);

/** Valor pronto para o atributo `accept` de um `<input type="file">` da tela de importação. */
export const IMPORT_ACCEPT_ATTRIBUTE: string = [
  ...ALLOWED_IMPORT_EXTENSIONS,
  ...ALLOWED_IMPORT_EXTENSIONS.map((extension) => IMPORT_UPLOAD_EXTENSIONS[extension]?.mimeType),
]
  .filter((value): value is string => typeof value === 'string')
  .join(',');

/** Limite de upload da importação: o mesmo 10 MB dos documentos (§45). */
export const MAX_IMPORT_BYTES = MAX_UPLOAD_BYTES;

/**
 * Teto de linhas de dados POR TABELA (§45: limite de linhas e de tempo ficam na API). A planilha
 * do desafio tem 1.295 linhas na maior aba; 50 mil é uma carteira de 4 mil clientes com um ano
 * de histórico. O teto existe porque a importação acontece em memória: cada linha de atendimento
 * mensal vira nove linhas de `metric_values`.
 */
export const MAX_IMPORT_ROWS = 50_000;

/** Quantas linhas recusadas são guardadas em `import_row_errors` por job. */
export const MAX_STORED_ROW_ERRORS = 500;

/** Quantos erros e quantas linhas de exemplo a prévia devolve para a tela. */
export const PREVIEW_ERRORS_LIMIT = 50;
export const PREVIEW_SAMPLE_ROWS = 10;

/** Quantas linhas de cada tabela a tela mostra no passo de mapeamento. */
export const SHEET_SAMPLE_ROWS = 5;

/**
 * MIME que navegadores e sistemas mandam no lugar do canônico para estes três formatos
 * (Windows manda `application/vnd.ms-excel` em .csv; .json às vezes chega como text/plain).
 * A extensão é quem decide o formato; o MIME declarado só precisa ser compatível.
 */
const IMPORT_MIME_ALIASES: Readonly<Record<string, ImportFileType>> = {
  'application/vnd.ms-excel': 'CSV',
  'application/csv': 'CSV',
  'text/x-csv': 'CSV',
  'text/json': 'JSON',
  'text/plain': 'CSV',
  '': 'CSV',
};

/** MIME genéricos que não dizem nada sobre o conteúdo: a extensão decide sozinha. */
const GENERIC_MIME_TYPES = new Set([
  'application/octet-stream',
  'application/x-zip-compressed',
  'application/zip',
]);

/** Formatos de texto: entre eles o MIME declarado não precisa bater exatamente. */
const TEXT_FILE_TYPES: readonly ImportFileType[] = ['CSV', 'JSON'];

export type ImportTypeResolution =
  | { ok: true; fileType: ImportFileType; mimeType: AllowedUploadMimeType; extension: string }
  | { ok: false; reason: string };

function fileTypeOfMime(normalizedMime: string): ImportFileType | null {
  for (const entry of Object.values(IMPORT_UPLOAD_EXTENSIONS)) {
    if (entry.mimeType === normalizedMime) return entry.fileType;
  }
  return IMPORT_MIME_ALIASES[normalizedMime] ?? null;
}

/**
 * Decide se um arquivo pode entrar na importação (§45): a extensão precisa ser .xlsx, .csv ou
 * .json e o MIME declarado precisa ser o canônico, um alias conhecido ou genérico. Devolve o
 * formato lógico, que é o que fica gravado em `import_jobs.file_type`.
 */
export function resolveImportFileType(fileName: string, mimeType: string): ImportTypeResolution {
  const extension = fileExtensionOf(fileName);
  const entry = IMPORT_UPLOAD_EXTENSIONS[extension];
  if (entry === undefined) {
    return {
      ok: false,
      reason: `Extensão não aceita na importação. Envie ${ALLOWED_IMPORT_EXTENSIONS.join(', ')}.`,
    };
  }
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const declared = fileTypeOfMime(normalized);
  const compatible =
    GENERIC_MIME_TYPES.has(normalized) ||
    declared === entry.fileType ||
    (declared !== null &&
      TEXT_FILE_TYPES.includes(declared) &&
      TEXT_FILE_TYPES.includes(entry.fileType));
  if (!compatible) {
    return {
      ok: false,
      reason: `O tipo "${normalized || 'desconhecido'}" não corresponde à extensão ${extension}.`,
    };
  }
  return { ok: true, fileType: entry.fileType, mimeType: entry.mimeType, extension };
}

// ---------- Vocabulário (reexportado para a web não depender do @inovaapss/shared direto) ----------

export const importFileTypeSchema = z.enum(IMPORT_FILE_TYPES);
export const importDatasetSchema = z.enum(IMPORT_DATASET_KEYS);
export const importJobStatusSchema = z.enum(IMPORT_JOB_STATUSES);
export const importErrorCodeSchema = z.enum(IMPORT_ERROR_CODES);

// ---------- Corpo das rotas (§37) ----------

/** Nome de uma tabela do arquivo (aba do XLSX, `csv` ou chave do JSON). */
export const sheetNameSchema = z
  .string()
  .trim()
  .min(1, 'Escolha a tabela do arquivo.')
  .max(200, 'O nome da tabela pode ter no máximo 200 caracteres.');

/**
 * Mapeamento escolhido: campo do dataset → cabeçalho ORIGINAL do arquivo (`null` = sem coluna).
 * Campos desconhecidos são recusados pela API ao conferir contra o catálogo do dataset.
 */
export const importMappingSchema = z
  .record(
    z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/, 'Campo do dataset inválido.'),
    z.string().max(300, 'Cabeçalho longo demais.').nullable(),
  )
  .refine(
    (mapping) => Object.keys(mapping).length <= 100,
    'Mapeamento com campos demais para um dataset.',
  );
export type ImportMapping = z.infer<typeof importMappingSchema>;

export const previewImportSchema = z.object({
  sheet: sheetNameSchema,
  dataset: importDatasetSchema,
  mapping: importMappingSchema,
});
export type PreviewImportBody = z.infer<typeof previewImportSchema>;

/**
 * Confirmação. O corpo é opcional: sem nada, vale o que ficou salvo na prévia — é o caminho da
 * tela. Reenviar tabela/dataset/mapeamento serve a clientes de API que pulam a prévia.
 */
export const confirmImportSchema = z.object({
  sheet: sheetNameSchema.optional(),
  dataset: importDatasetSchema.optional(),
  mapping: importMappingSchema.optional(),
  /**
   * Importar mesmo com linhas inválidas (as válidas entram, as recusadas ficam no relatório).
   * Padrão `false`: quem confirma vê os erros antes e decide.
   */
  ignoreInvalidRows: z.boolean().default(false),
});
export type ConfirmImportBody = z.infer<typeof confirmImportSchema>;
export type ConfirmImportInput = z.input<typeof confirmImportSchema>;

// ---------- Listagens (§61) ----------

export const importListQuerySchema = paginationQuerySchema.extend({
  status: importJobStatusSchema.optional(),
});
export type ImportListQuery = z.infer<typeof importListQuerySchema>;

export const importErrorsQuerySchema = paginationQuerySchema;
export type ImportErrorsQuery = z.infer<typeof importErrorsQuerySchema>;

export const importIdParamsSchema = z.object({ id: uuidSchema });
