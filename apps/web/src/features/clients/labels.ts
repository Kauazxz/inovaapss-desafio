/** Rótulos em português do vocabulário de clientes (status, importância). */
import type { PortfolioClientStatus } from '@inovaapss/validation';

export const CLIENT_STATUS_LABELS: Readonly<Record<PortfolioClientStatus, string>> = {
  active: 'Ativo',
  inactive: 'Inativo',
  cancelled: 'Cancelado',
  archived: 'Arquivado',
};

/** 1–5 (§36 strategic_importance): rótulo curto para a tabela e o formulário. */
export const STRATEGIC_IMPORTANCE_LABELS: Readonly<Record<number, string>> = {
  1: '1 — Baixa',
  2: '2 — Média-baixa',
  3: '3 — Média',
  4: '4 — Alta',
  5: '5 — Estratégico',
};

export function strategicImportanceLabel(value: number): string {
  return STRATEGIC_IMPORTANCE_LABELS[value] ?? String(value);
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

/** `2026-01-31` → `31/01/2026` (data civil, sem fuso). */
export function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/** `R$ 1.500,00` na moeda do contrato (2 casas: valor de contrato, não KPI). */
export function formatMoney(value: number, currency = 'BRL'): string {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
    } catch {
      formatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });
    }
    moneyFormatters.set(currency, formatter);
  }
  return formatter.format(value);
}
