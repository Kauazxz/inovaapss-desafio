/**
 * Regras de peso (§12, §41): pesos são frações 0–1 com 4 casas; os pesos das métricas ATIVAS de
 * uma versão precisam somar 1,0000 (± 0,0001) para ela ser ativada. O sistema nunca
 * redistribui em silêncio — `proposeRebalancedWeights` devolve uma PROPOSTA que só vira
 * realidade se o usuário salvar num rascunho.
 */
import { z } from 'zod';

import { WEIGHT_DECIMALS, WEIGHT_SUM_TOLERANCE } from '@inovaapss/shared';

const SCALE = 10 ** WEIGHT_DECIMALS;

/** Arredonda para 4 casas (mesma precisão do numeric(6,4) do banco). */
export function roundWeight(value: number): number {
  return Math.round(value * SCALE) / SCALE;
}

function hasAtMostFourDecimals(value: number): boolean {
  return Math.abs(value * SCALE - Math.round(value * SCALE)) < 1e-6;
}

/** Peso de um item do modelo: 0–1, no máximo 4 casas decimais. */
export const modelWeightSchema = z
  .number()
  .finite()
  .min(0, 'O peso não pode ser negativo.')
  .max(1, 'O peso é uma fração de 0 a 1 (ex.: 0,18 para 18 %).')
  .refine(hasAtMostFourDecimals, 'O peso aceita no máximo 4 casas decimais.');

/** Peso de um componente (atual/tendência/persistência): 0–1, 4 casas; só a proporção importa. */
export const componentWeightSchema = modelWeightSchema;

export interface WeightedItem {
  metricDefinitionId: string;
  weight: number;
  /** false = a definição está desativada e sai da soma (e do cálculo). */
  isActive: boolean;
}

export interface VersionWeightsResult {
  ok: boolean;
  /** Soma dos pesos das métricas ativas, com 4 casas. */
  total: number;
  /** `total − 1`, com 4 casas (negativo = faltam pontos). */
  difference: number;
  activeCount: number;
  /** Explicação em português para a interface ("Total: 97 % — faltam 3 %"). */
  message: string;
}

function percent(value: number): string {
  return `${Math.round(value * 10000) / 100} %`;
}

/**
 * §41 — confere se os pesos ativos somam 100 % (1,0000 ± 0,0001). Nunca altera os pesos.
 */
export function validateVersionWeights(items: readonly WeightedItem[]): VersionWeightsResult {
  const active = items.filter((item) => item.isActive);
  const total = roundWeight(active.reduce((acc, item) => acc + item.weight, 0));
  const difference = roundWeight(total - 1);
  const ok = active.length > 0 && Math.abs(total - 1) <= WEIGHT_SUM_TOLERANCE;

  let message: string;
  if (active.length === 0) {
    message = 'A versão não tem nenhuma métrica ativa: inclua ao menos uma antes de ativar.';
  } else if (ok) {
    message = `Total: ${percent(total)} — pronto para ativar.`;
  } else if (difference < 0) {
    message = `Total: ${percent(total)} — faltam ${percent(-difference)}.`;
  } else {
    message = `Total: ${percent(total)} — sobram ${percent(difference)}.`;
  }

  return { ok, total, difference, activeCount: active.length, message };
}

export interface RebalanceRow {
  metricDefinitionId: string;
  currentWeight: number;
  proposedWeight: number;
  difference: number;
}

export interface RebalanceProposal {
  rows: RebalanceRow[];
  currentTotal: number;
  proposedTotal: number;
  saved: false;
}

/**
 * Proposta de redistribuição proporcional (§41 "Redistribuir pesos"): cada peso ativo é dividido
 * pela soma atual, arredondado a 4 casas, e o resíduo do arredondamento vai para o maior peso
 * para a soma fechar em exatamente 1,0000. Itens inativos ficam como estão. Se todos os pesos
 * ativos forem zero, divide igualmente. Não salva nada.
 */
export function proposeRebalancedWeights(items: readonly WeightedItem[]): RebalanceProposal {
  const active = items.filter((item) => item.isActive);
  const currentTotal = roundWeight(items.reduce((acc, item) => acc + item.weight, 0));
  const activeTotal = active.reduce((acc, item) => acc + item.weight, 0);

  const proposed = new Map<string, number>();
  if (active.length > 0) {
    const share = (item: WeightedItem) =>
      activeTotal > 0 ? item.weight / activeTotal : 1 / active.length;
    for (const item of active) proposed.set(item.metricDefinitionId, roundWeight(share(item)));
    const sum = roundWeight([...proposed.values()].reduce((acc, w) => acc + w, 0));
    const residual = roundWeight(1 - sum);
    if (residual !== 0) {
      const largest = [...proposed.entries()].sort((a, b) => b[1] - a[1])[0];
      if (largest !== undefined) proposed.set(largest[0], roundWeight(largest[1] + residual));
    }
  }

  const rows: RebalanceRow[] = items.map((item) => {
    const proposedWeight = proposed.get(item.metricDefinitionId) ?? item.weight;
    return {
      metricDefinitionId: item.metricDefinitionId,
      currentWeight: item.weight,
      proposedWeight,
      difference: roundWeight(proposedWeight - item.weight),
    };
  });

  // Só as ativas entram no total proposto (as inativas ficam fora do cálculo, §41).
  const proposedTotal = roundWeight(
    rows
      .filter((row) => proposed.has(row.metricDefinitionId))
      .reduce((acc, row) => acc + row.proposedWeight, 0),
  );

  return { rows, currentTotal, proposedTotal, saved: false };
}
