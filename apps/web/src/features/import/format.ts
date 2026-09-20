/** Rótulos e formatos da importação (pt-BR). */
import type { ImportErrorCode, ImportFileType, ImportJobStatus } from './api';

export const IMPORT_STATUS_LABELS: Readonly<Record<ImportJobStatus, string>> = {
  uploaded: 'Arquivo enviado',
  mapped: 'Colunas mapeadas',
  previewed: 'Prévia conferida',
  importing: 'Importando',
  done: 'Importado',
  failed: 'Falhou',
};

export const IMPORT_FILE_TYPE_LABELS: Readonly<Record<ImportFileType, string>> = {
  XLSX: 'Planilha (XLSX)',
  CSV: 'CSV',
  JSON: 'JSON',
};

/** O que cada código quer dizer, em uma palavra, para agrupar os erros na tela. */
export const IMPORT_ERROR_LABELS: Readonly<Record<ImportErrorCode, string>> = {
  MISSING_REQUIRED: 'Campo obrigatório vazio',
  INVALID_TEXT: 'Texto inválido',
  INVALID_NUMBER: 'Número inválido',
  INVALID_INTEGER: 'Número inteiro inválido',
  INVALID_PERIOD: 'Período inválido',
  INVALID_DATE: 'Data inválida',
  INVALID_BOOLEAN: 'Sim/não inválido',
  INVALID_ENUM: 'Valor fora da lista',
  OUT_OF_RANGE: 'Fora da faixa',
  INCONSISTENT: 'Linha inconsistente',
  DUPLICATE: 'Linha repetida',
  INVALID_VALUE: 'Valor inválido',
};

const oneDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
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

export function formatCount(value: number): string {
  return integer.format(value);
}

/** Confiança 0–1 → `95 %`. */
export function formatConfidence(confidence: number): string {
  return `${integer.format(Math.round(confidence * 100))} %`;
}

/** Valor de uma célula da amostra, já pronto para a tabela. */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return oneDecimal.format(value);
  return String(value);
}
