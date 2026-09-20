/** Rótulos e formatos da feature de documentos (pt-BR). */
import type { MetricDirection, MetricType } from '@inovaapss/shared';
import type { DocumentKind, DocumentStatus, MetricSuggestionStatus } from '@inovaapss/validation';

export const DOCUMENT_STATUS_LABELS: Readonly<Record<DocumentStatus, string>> = {
  uploaded: 'Enviado',
  extracted: 'Texto extraído',
  failed: 'Falha na extração',
};

export const DOCUMENT_KIND_LABELS: Readonly<Record<DocumentKind, string>> = {
  pdf: 'PDF',
  docx: 'DOCX',
  xlsx: 'XLSX',
  csv: 'CSV',
  json: 'JSON',
  markdown: 'Markdown',
  text: 'Texto',
};

export const SUGGESTION_STATUS_LABELS: Readonly<Record<MetricSuggestionStatus, string>> = {
  pending: 'Pendente',
  accepted: 'Aceita',
  rejected: 'Rejeitada',
};

export const METRIC_TYPE_LABELS: Readonly<Record<MetricType, string>> = {
  TIME: 'Tempo',
  PERCENTAGE: 'Percentual',
  QUANTITY: 'Quantidade',
  FREQUENCY: 'Frequência',
  FINANCIAL: 'Financeiro',
  VARIATION: 'Variação',
  SCORE: 'Nota',
  BOOLEAN: 'Sim/não',
  CATEGORY: 'Categoria',
  DATE_DEADLINE: 'Prazo',
};

export const METRIC_DIRECTION_LABELS: Readonly<Record<MetricDirection, string>> = {
  HIGHER_IS_BETTER: 'Maior é melhor',
  HIGHER_IS_WORSE: 'Maior é pior',
  TARGET_RANGE: 'Faixa-alvo',
  CUSTOM: 'Personalizada',
};

const oneDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** `160 B`, `12,4 kB`, `1,2 MB`. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${oneDecimal.format(bytes / 1024)} kB`;
  return `${oneDecimal.format(bytes / (1024 * 1024))} MB`;
}

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** Peso como fração (0,16) → `16 %`. */
export function formatWeight(weight: number | null): string {
  return weight === null ? '—' : `${oneDecimal.format(weight * 100)} %`;
}
