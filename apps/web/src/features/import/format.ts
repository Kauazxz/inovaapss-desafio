/** Rótulos e formatos da importação de dados (pt-BR). */
import type { ImportFieldMappingDto } from '@inovaapss/shared';

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

/** Tipo do campo em português, para a tela dizer o formato esperado da coluna. */
export const FIELD_TYPE_LABELS: Readonly<Record<string, string>> = {
  text: 'texto',
  integer: 'número inteiro',
  number: 'número',
  period: 'mês (AAAA-MM)',
  date: 'data',
  boolean: 'sim/não',
  enum: 'lista de valores',
};

/**
 * Por que esta coluna foi escolhida. A tela mostra isto porque mapeamento automático sem
 * explicação é adivinhação: quem confere precisa saber o que a máquina usou para decidir.
 */
export const MAPPING_REASON_LABELS: Readonly<Record<ImportFieldMappingDto['reason'], string>> = {
  exact: 'nome idêntico',
  synonym: 'sinônimo conhecido',
  partial: 'nome parecido',
  tokens: 'palavras em comum',
  preset: 'planilha do desafio',
  manual: 'escolha sua',
  none: 'sem coluna',
};

/** Confiança alta o bastante para a tela não pedir conferência (mesmo limiar do importador). */
export const HIGH_CONFIDENCE = 0.9;

export function formatConfidence(confidence: number): string {
  return `${integer.format(confidence * 100)} %`;
}
