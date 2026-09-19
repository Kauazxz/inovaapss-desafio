import { formatCompactCurrency } from '@/lib/format';

const MINUS = '−';

/** Variação de contagem vs. período anterior: `+2`, `−3`, `sem variação` (DATAVIZ.md §2.4). */
export function formatCountDelta(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta === 0) return 'sem variação';
  return `${delta > 0 ? '+' : MINUS}${Math.abs(delta)}`;
}

/** Variação de moeda vs. período anterior: `+R$ 6 mil`, `−R$ 6 mil`. */
export function formatCurrencyDelta(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta === 0) return 'sem variação';
  return `${delta > 0 ? '+' : MINUS}${formatCompactCurrency(Math.abs(delta))}`;
}
