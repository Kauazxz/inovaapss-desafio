/**
 * §35 / §36 / §45 (+ A4, A5) — documentos enviados e sugestões de métricas.
 *
 * O que vale para API e web mora aqui: tipos de arquivo aceitos (MIME + extensão), limite de
 * upload, status de documento/sugestão e o schema da sugestão criada manualmente. A validação
 * da fórmula (JSON Logic) é feita na API com `isSafeRule` do engine; aqui só se confere o formato.
 */
import { z } from 'zod';

import { ALLOWED_UPLOAD_MIME_TYPES, type AllowedUploadMimeType } from '@inovaapss/shared';

import { paginationQuerySchema, uuidSchema } from '../common.js';
import {
  metricDirectionSchema,
  metricTypeSchema,
  normalizationStrategySchema,
  scoreSchema,
  weightSchema,
} from '../domain.js';

// ---------- Tipos de arquivo (§45 — allowlist de MIME + extensão) ----------

/** Tipo lógico do documento; decide qual extrator de texto é usado (docs/DOCUMENTS.md). */
export const DOCUMENT_KINDS = ['pdf', 'docx', 'xlsx', 'csv', 'json', 'markdown', 'text'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Limite de upload (§45): 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Extensão (minúscula, com ponto) → tipo lógico e MIME canônico gravado no banco. */
export const UPLOAD_EXTENSIONS: Readonly<
  Record<string, { kind: DocumentKind; mimeType: AllowedUploadMimeType }>
> = {
  '.pdf': { kind: 'pdf', mimeType: 'application/pdf' },
  '.docx': {
    kind: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  '.xlsx': {
    kind: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  '.csv': { kind: 'csv', mimeType: 'text/csv' },
  '.json': { kind: 'json', mimeType: 'application/json' },
  '.md': { kind: 'markdown', mimeType: 'text/markdown' },
  '.txt': { kind: 'text', mimeType: 'text/plain' },
};

/** Extensões aceitas, na ordem de exibição na tela de upload. */
export const ALLOWED_UPLOAD_EXTENSIONS: readonly string[] = Object.keys(UPLOAD_EXTENSIONS);

/** Valor pronto para o atributo `accept` de um `<input type="file">`. */
export const UPLOAD_ACCEPT_ATTRIBUTE: string = [
  ...ALLOWED_UPLOAD_EXTENSIONS,
  ...ALLOWED_UPLOAD_MIME_TYPES,
].join(',');

/**
 * MIME que os navegadores/sistemas mandam no lugar do canônico (ex.: Windows manda
 * `application/vnd.ms-excel` para .csv; Markdown chega vazio ou como text/x-markdown).
 * O tipo lógico é sempre decidido pela extensão; o MIME declarado só precisa ser compatível.
 */
const MIME_ALIASES: Readonly<Record<string, DocumentKind>> = {
  'application/vnd.ms-excel': 'csv',
  'application/csv': 'csv',
  'text/x-csv': 'csv',
  'text/x-markdown': 'markdown',
  'application/x-pdf': 'pdf',
  'text/json': 'json',
  '': 'text',
};

/** MIME genéricos que não dizem nada sobre o conteúdo: a extensão decide sozinha. */
const GENERIC_MIME_TYPES = new Set(['application/octet-stream', 'application/x-zip-compressed']);

const TEXT_KINDS: readonly DocumentKind[] = ['csv', 'json', 'markdown', 'text'];

function kindOfMime(normalizedMime: string): DocumentKind | null {
  for (const entry of Object.values(UPLOAD_EXTENSIONS)) {
    if (entry.mimeType === normalizedMime) return entry.kind;
  }
  return MIME_ALIASES[normalizedMime] ?? null;
}

export function fileExtensionOf(fileName: string): string {
  const match = /\.[^./\\]+$/.exec(fileName.trim());
  return match === null ? '' : match[0].toLowerCase();
}

export type UploadTypeResolution =
  | { ok: true; kind: DocumentKind; mimeType: AllowedUploadMimeType; extension: string }
  | { ok: false; reason: string };

/**
 * Decide se um arquivo pode ser enviado (§45): a extensão precisa estar na allowlist e o MIME
 * declarado precisa ser o canônico, um alias conhecido, genérico ou `text/plain` para os
 * formatos de texto. Devolve o MIME canônico, que é o que fica gravado.
 */
export function resolveUploadType(fileName: string, mimeType: string): UploadTypeResolution {
  const extension = fileExtensionOf(fileName);
  const entry = UPLOAD_EXTENSIONS[extension];
  if (entry === undefined) {
    return {
      ok: false,
      reason: `Extensão não aceita. Envie ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}.`,
    };
  }
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const declaredKind = kindOfMime(normalized);
  const compatible =
    GENERIC_MIME_TYPES.has(normalized) ||
    declaredKind === entry.kind ||
    (declaredKind === 'text' && TEXT_KINDS.includes(entry.kind));
  if (!compatible) {
    return {
      ok: false,
      reason: `O tipo "${normalized || 'desconhecido'}" não corresponde à extensão ${extension}.`,
    };
  }
  return { ok: true, kind: entry.kind, mimeType: entry.mimeType, extension };
}

// ---------- Status (§36 uploaded_documents / metric_extraction_suggestions) ----------

export const DOCUMENT_STATUSES = ['uploaded', 'extracted', 'failed'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);

export const METRIC_SUGGESTION_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export type MetricSuggestionStatus = (typeof METRIC_SUGGESTION_STATUSES)[number];
export const metricSuggestionStatusSchema = z.enum(METRIC_SUGGESTION_STATUSES);

/** Tamanho máximo do trecho de texto extraído guardado no banco (o resto fica no storage). */
export const EXTRACTED_TEXT_PREVIEW_MAX_BYTES = 20 * 1024;

// ---------- Listagem (§61) ----------

export const documentListQuerySchema = paginationQuerySchema.extend({
  status: documentStatusSchema.optional(),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

// ---------- Sugestão manual de métrica (§35: revisão humana) ----------

/** Faixa de normalização (THRESHOLD_BANDS): até `upTo` (null = resto) vale `health`. */
export const suggestedThresholdBandSchema = z.object({
  upTo: z.number().nullable(),
  health: scoreSchema,
});

/**
 * Thresholds sugeridos: a estratégia e os campos que ela usa (METRICS_ENGINE.md §2). Campos
 * extras são mantidos porque cada estratégia tem os seus; a API valida o conjunto ao criar a
 * métrica de fato (Etapa 3).
 */
export const suggestedThresholdsSchema = z.looseObject({
  strategy: normalizationStrategySchema.optional(),
  bands: z.array(suggestedThresholdBandSchema).min(1).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  target: z.number().optional(),
});
export type SuggestedThresholds = z.infer<typeof suggestedThresholdsSchema>;

/** Regra JSON Logic: um objeto com um operador na raiz (a segurança é conferida na API). */
export const suggestedFormulaSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (rule) => Object.keys(rule).length === 1,
    'A fórmula precisa ser uma regra JSON Logic com um único operador na raiz.',
  );

export const suggestionNameSchema = z
  .string()
  .trim()
  .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
  .max(120, 'O nome pode ter no máximo 120 caracteres.');

export const createMetricSuggestionSchema = z.object({
  suggestedName: suggestionNameSchema,
  description: z
    .string()
    .trim()
    .max(1000, 'A descrição pode ter no máximo 1000 caracteres.')
    .optional(),
  suggestedType: metricTypeSchema,
  suggestedDirection: metricDirectionSchema,
  unit: z.string().trim().max(24, 'A unidade pode ter no máximo 24 caracteres.').optional(),
  /** Peso como fração 0–1 (§12). Opcional: quem ativa a métrica decide o peso final. */
  suggestedWeight: weightSchema.optional(),
  suggestedFormula: suggestedFormulaSchema.optional(),
  suggestedThresholds: suggestedThresholdsSchema.optional(),
  /** Trecho do documento que justifica a sugestão (evidência para quem revisa). */
  sourceExcerpt: z
    .string()
    .trim()
    .max(2000, 'O trecho pode ter no máximo 2000 caracteres.')
    .optional(),
});
export type CreateMetricSuggestionInput = z.input<typeof createMetricSuggestionSchema>;
export type CreateMetricSuggestionBody = z.infer<typeof createMetricSuggestionSchema>;

export const documentIdParamsSchema = z.object({ id: uuidSchema });
