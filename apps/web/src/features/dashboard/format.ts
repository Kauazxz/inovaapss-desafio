import type { HealthThresholds, PriorityWeights } from '@inovaapss/shared';

import { formatCompactCurrency, formatInteger } from '@/lib/format';

const MINUS = '−';
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

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

/**
 * Textos de faixa e de fórmula sempre derivados da configuração vigente da organização
 * (§7 "as faixas devem ser configuráveis", §65 "não hardcodar faixas, prioridade") — nunca
 * números escritos à mão na tela.
 */

/** "health abaixo de 40" — a classe Crítico vai até `thresholds.critical` (exclusivo). */
export function criticalBandHint(thresholds: HealthThresholds): string {
  return `health abaixo de ${formatInteger(thresholds.critical)}`;
}

/** "health de 40 a 59" — a classe Risco vai de `critical` até `risk − 1`. */
export function riskBandHint(thresholds: HealthThresholds): string {
  return `health de ${formatInteger(thresholds.critical)} a ${formatInteger(thresholds.risk - 1)}`;
}

/** "Prioridade = risco × 0,7 + impacto comercial × 0,3" com os pesos vigentes (§28). */
export function priorityFormulaText(weights: PriorityWeights): string {
  return `Prioridade = risco × ${decimal.format(weights.risk)} + impacto comercial × ${decimal.format(weights.impact)}`;
}
