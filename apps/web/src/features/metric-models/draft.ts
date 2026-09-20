/**
 * Estado local do configurador (§41): o rascunho que a pessoa edita na tela antes de salvar.
 *
 * Regras que vêm do documento de métricas:
 *   §25 — o modo do modelo (Manual, Assistido, Automático) diz quem decide o peso; a soma
 *         continua sendo responsabilidade de quem ativa.
 *   §32 — versões são imutáveis depois de ativadas: só um rascunho é editável, e ativar uma
 *         versão nova nunca apaga a anterior nem os scores que ela gerou.
 *   §41 — os pesos das métricas ativas precisam somar 100 % para ativar, e o sistema nunca
 *         redistribui em silêncio.
 *
 * Tudo aqui é função pura: a tela só guarda `DraftItem[]` e chama estas funções.
 */
import type {
  MetricConfigJson,
  MetricDefinitionDto,
  MetricModelItemDto,
  MetricModelVersionDto,
} from '@inovaapss/shared';
import {
  roundWeight,
  validateVersionWeights,
  type FormulaConfigInput,
  type MetricModelItemBody,
  type NormalizationConfigInput,
  type ThresholdConfigInput,
  type TriggerListInput,
  type VersionWeightsResult,
  type WeightedItem,
} from '@inovaapss/validation';

/** Uma linha da tabela do configurador enquanto está sendo editada. */
export interface DraftItem {
  metricDefinitionId: string;
  /** A métrica faz parte desta versão. Fora dela, não entra nos itens nem na soma. */
  included: boolean;
  /** Fração 0–1, como o banco guarda (numeric(6,4)). */
  weight: number;
  currentWeight: number;
  trendWeight: number;
  persistenceWeight: number;
  normalization: NormalizationConfigInput;
  thresholds: ThresholdConfigInput | null;
  triggers: TriggerListInput | null;
  formula: FormulaConfigInput | null;
}

/** Normalização de partida para uma métrica nova no modelo (a pessoa ajusta no painel). */
export const DEFAULT_NORMALIZATION: NormalizationConfigInput = {
  strategy: 'LINEAR_RANGE',
  min: 0,
  max: 100,
};

const DEFAULT_COMPONENTS = { current: 0.45, trend: 0.35, persistence: 0.2 } as const;

/** Item persistido → linha editável. */
export function itemToDraft(item: MetricModelItemDto): DraftItem {
  return {
    metricDefinitionId: item.metricDefinitionId,
    included: true,
    weight: item.weight,
    currentWeight: item.currentWeight,
    trendWeight: item.trendWeight,
    persistenceWeight: item.persistenceWeight,
    normalization: item.normalizationConfig as NormalizationConfigInput,
    thresholds: item.thresholdConfig as ThresholdConfigInput | null,
    triggers: item.criticalTriggerConfig as TriggerListInput | null,
    formula: item.formulaConfig as FormulaConfigInput | null,
  };
}

/** Versão inteira → rascunho editável, já na ordem de exibição (§41 "Ordem"). */
export function versionToDraft(version: MetricModelVersionDto): DraftItem[] {
  return [...version.items].sort((a, b) => a.sortOrder - b.sortOrder).map(itemToDraft);
}

/** Linha nova para uma métrica que ainda não estava na versão. */
export function newDraftItem(metricDefinitionId: string): DraftItem {
  return {
    metricDefinitionId,
    included: true,
    weight: 0,
    currentWeight: DEFAULT_COMPONENTS.current,
    trendWeight: DEFAULT_COMPONENTS.trend,
    persistenceWeight: DEFAULT_COMPONENTS.persistence,
    normalization: DEFAULT_NORMALIZATION,
    thresholds: null,
    triggers: null,
    formula: null,
  };
}

/** Rascunho → corpo de PATCH/POST: só as incluídas, com a ordem renumerada a partir de 1. */
export function draftToItems(draft: readonly DraftItem[]): MetricModelItemBody[] {
  return draft
    .filter((item) => item.included)
    .map((item, index) => ({
      metricDefinitionId: item.metricDefinitionId,
      weight: item.weight,
      currentWeight: item.currentWeight,
      trendWeight: item.trendWeight,
      persistenceWeight: item.persistenceWeight,
      normalization: item.normalization,
      thresholds: item.thresholds,
      triggers: item.triggers,
      formula: item.formula,
      sortOrder: index + 1,
    }));
}

/**
 * Soma dos pesos como a API a confere ao ativar: entram as linhas incluídas cuja DEFINIÇÃO
 * está ativa (uma métrica desativada sai do cálculo, §41).
 */
export function weightsCheck(
  draft: readonly DraftItem[],
  definitionsById: ReadonlyMap<string, MetricDefinitionDto>,
): VersionWeightsResult {
  const weighted: WeightedItem[] = draft
    .filter((item) => item.included)
    .map((item) => ({
      metricDefinitionId: item.metricDefinitionId,
      weight: item.weight,
      isActive: definitionsById.get(item.metricDefinitionId)?.isActive ?? false,
    }));
  return validateVersionWeights(weighted);
}

/** Percentual digitado (ex.: 18,5) → fração com 4 casas (0,185). */
export function percentToWeight(percent: number): number {
  return roundWeight(percent / 100);
}

/** Fração (0,185) → percentual para o campo (18,5). */
export function weightToPercent(weight: number): number {
  return Math.round(weight * 1_000_000) / 10_000;
}

/** Troca a linha `index` com a vizinha (−1 sobe, +1 desce). Fora da lista, devolve igual. */
export function moveDraftItem(
  draft: readonly DraftItem[],
  index: number,
  delta: -1 | 1,
): DraftItem[] {
  const target = index + delta;
  if (index < 0 || index >= draft.length || target < 0 || target >= draft.length) {
    return [...draft];
  }
  const next = [...draft];
  const moved = next[index] as DraftItem;
  next[index] = next[target] as DraftItem;
  next[target] = moved;
  return next;
}

/** Aplica um campo a uma linha, sem mexer nas outras. */
export function patchDraftItem(
  draft: readonly DraftItem[],
  metricDefinitionId: string,
  patch: Partial<DraftItem>,
): DraftItem[] {
  return draft.map((item) =>
    item.metricDefinitionId === metricDefinitionId ? { ...item, ...patch } : item,
  );
}

/** Aplica uma proposta de redistribuição (só depois de a pessoa clicar em aplicar, §41). */
export function applyRebalance(
  draft: readonly DraftItem[],
  rows: readonly { metricDefinitionId: string; proposedWeight: number }[],
): DraftItem[] {
  const byId = new Map(rows.map((row) => [row.metricDefinitionId, row.proposedWeight]));
  return draft.map((item) => {
    const proposed = byId.get(item.metricDefinitionId);
    return proposed === undefined ? item : { ...item, weight: proposed };
  });
}

// ---------------------------------------------------------------------------
// Comparação entre versões (§32 — o que muda para a organização inteira)
// ---------------------------------------------------------------------------

export interface VersionChange {
  metricDefinitionId: string;
  metricName: string;
  kind: 'added' | 'removed' | 'weight' | 'config';
  /** Frase pronta para a tela ("de 18 % para 20 %"). */
  description: string;
}

function percentLabel(weight: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(weight * 100)} %`;
}

function sameConfig(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Diferenças entre a versão atualmente ativa e o que vai valer: métricas que entram, que saem,
 * pesos que mudam e configurações que mudam. É o resumo mostrado antes de confirmar a ativação.
 */
export function compareItems(
  from: readonly MetricModelItemDto[],
  to: readonly MetricModelItemDto[],
  nameOf: (metricDefinitionId: string) => string,
): VersionChange[] {
  const before = new Map(from.map((item) => [item.metricDefinitionId, item]));
  const after = new Map(to.map((item) => [item.metricDefinitionId, item]));
  const changes: VersionChange[] = [];

  for (const [id, item] of after) {
    const old = before.get(id);
    const metricName = nameOf(id);
    if (old === undefined) {
      changes.push({
        metricDefinitionId: id,
        metricName,
        kind: 'added',
        description: `entra no modelo com peso ${percentLabel(item.weight)}`,
      });
      continue;
    }
    if (roundWeight(old.weight) !== roundWeight(item.weight)) {
      changes.push({
        metricDefinitionId: id,
        metricName,
        kind: 'weight',
        description: `peso de ${percentLabel(old.weight)} para ${percentLabel(item.weight)}`,
      });
    }
    if (
      !sameConfig(old.normalizationConfig, item.normalizationConfig) ||
      !sameConfig(old.thresholdConfig, item.thresholdConfig) ||
      !sameConfig(old.criticalTriggerConfig, item.criticalTriggerConfig) ||
      !sameConfig(old.formulaConfig, item.formulaConfig)
    ) {
      changes.push({
        metricDefinitionId: id,
        metricName,
        kind: 'config',
        description: 'normalização, faixas ou gatilhos mudaram',
      });
    }
  }

  for (const [id, item] of before) {
    if (after.has(id)) continue;
    changes.push({
      metricDefinitionId: id,
      metricName: nameOf(id),
      kind: 'removed',
      description: `sai do modelo (tinha peso ${percentLabel(item.weight)})`,
    });
  }

  return changes;
}

/** O mesmo resumo, a partir do rascunho em edição (que ainda não virou itens persistidos). */
export function compareDraftWithVersion(
  active: MetricModelVersionDto | null,
  draft: readonly DraftItem[],
  nameOf: (metricDefinitionId: string) => string,
): VersionChange[] {
  const asItems = draftToItems(draft).map(
    (item) =>
      ({
        id: '',
        metricModelVersionId: '',
        metricDefinitionId: item.metricDefinitionId,
        weight: item.weight,
        currentWeight: item.currentWeight,
        trendWeight: item.trendWeight,
        persistenceWeight: item.persistenceWeight,
        normalizationStrategy: item.normalization.strategy,
        normalizationConfig: item.normalization as unknown as MetricConfigJson,
        thresholdConfig: item.thresholds as unknown as MetricConfigJson | null,
        criticalTriggerConfig: item.triggers as unknown as MetricConfigJson | null,
        formulaConfig: item.formula as unknown as MetricConfigJson | null,
        sortOrder: item.sortOrder ?? 0,
      }) satisfies MetricModelItemDto,
  );
  return compareItems(active?.items ?? [], asItems, nameOf);
}
