/**
 * Conversões de texto ↔ número do configurador e a leitura das mensagens do Zod.
 *
 * Os campos do painel guardam TEXTO e só viram número na hora de validar: assim o input aceita
 * "", "-" e vírgula enquanto a pessoa digita, sem que o valor vire NaN no meio da digitação.
 */
import type { ZodError } from 'zod';

const pt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Fração 0–1 → percentual legível ("0,185" → "18,5 %"). */
export function percent(weight: number): string {
  return `${pt.format(weight * 100)} %`;
}

/** Diferença de peso em pontos percentuais, com sinal ("+5,56 p.p."). */
export function signedPercentPoints(weight: number): string {
  return weight === 0 ? '—' : `${weight > 0 ? '+' : '−'}${pt.format(Math.abs(weight) * 100)} p.p.`;
}

/** Texto digitado → número. Aceita vírgula decimal. `''` vira `undefined` (campo em branco). */
export function toNumber(text: string): number | undefined {
  const cleaned = text.trim().replace(',', '.');
  if (cleaned === '') return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Número → texto do campo (vazio quando não há valor). */
export function toText(value: number | undefined | null): string {
  return value === undefined || value === null ? '' : String(value);
}

/** Primeira mensagem do Zod, já com o caminho do campo quando ele ajuda a localizar o erro. */
export function firstIssueMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return 'Configuração inválida.';
  const path = issue.path.filter((part) => typeof part === 'string').join('.');
  return path === '' ? issue.message : `${path}: ${issue.message}`;
}
