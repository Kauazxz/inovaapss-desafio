/**
 * A ponte entre as duas telas que viraram uma.
 *
 * A LISTA de métricas (§37 GET /metrics) é o cadastro: nome, tipo, direção, fonte, ativa.
 * Peso, ordem e normalização não moram lá — moram no ITEM da versão do modelo (§31, §41), que é
 * versionada e imutável depois de ativada. A tela mostra as duas coisas na mesma linha, então
 * aqui ficam as funções puras que juntam definição + item e que mexem no rascunho local.
 *
 * Nada aqui fala com a API: quem salva é a página.
 */
import {
  type MetricDefinitionDto,
  type MetricDefinitionListItemDto,
  type MetricModelVersionDto,
  type NormalizationStrategy,
} from '@inovaapss/shared';
import type { NormalizationConfigInput } from '@inovaapss/validation';

import {
  draftToItems,
  newDraftItem,
  versionToDraft,
  type DraftItem,
} from '@/features/metric-models/draft';

/** Uma linha da tabela: o cadastro da métrica + o lugar dela no modelo (quando tem um). */
export interface MetricRow {
  definition: MetricDefinitionListItemDto;
  /** Item do rascunho, mesmo quando a métrica está fora do modelo (guarda a configuração). */
  item: DraftItem | null;
  /** Posição 1..n entre as métricas do modelo; `null` quando está fora dele. */
  position: number | null;
}

/** Ordem da tela: o modelo primeiro, na ordem configurada; o resto em ordem alfabética. */
export function buildRows(
  definitions: readonly MetricDefinitionListItemDto[],
  draft: readonly DraftItem[],
): MetricRow[] {
  const byId = new Map(draft.map((item) => [item.metricDefinitionId, item]));
  const positions = new Map<string, number>();
  let position = 0;
  for (const item of draft) {
    if (!item.included) continue;
    position += 1;
    positions.set(item.metricDefinitionId, position);
  }

  return [...definitions]
    .sort((left, right) => {
      const leftPosition = positions.get(left.id);
      const rightPosition = positions.get(right.id);
      if (leftPosition !== undefined && rightPosition !== undefined) {
        return leftPosition - rightPosition;
      }
      if (leftPosition !== undefined) return -1;
      if (rightPosition !== undefined) return 1;
      return left.name.localeCompare(right.name, 'pt-BR');
    })
    .map((definition) => ({
      definition,
      item: byId.get(definition.id) ?? null,
      position: positions.get(definition.id) ?? null,
    }));
}

/** Leva a métrica `fromId` para o lugar de `toId` (o arrastar da coluna Ordem). */
export function moveDraftTo(
  draft: readonly DraftItem[],
  fromId: string,
  toId: string,
): DraftItem[] {
  const from = draft.findIndex((item) => item.metricDefinitionId === fromId);
  const to = draft.findIndex((item) => item.metricDefinitionId === toId);
  const next = [...draft];
  if (from < 0 || to < 0 || from === to) return next;
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

/** Sobe (−1) ou desce (+1) uma métrica — o mesmo arrastar, pelo teclado. */
export function moveDraftBy(
  draft: readonly DraftItem[],
  metricDefinitionId: string,
  delta: -1 | 1,
): DraftItem[] {
  const included = draft.filter((item) => item.included);
  const index = included.findIndex((item) => item.metricDefinitionId === metricDefinitionId);
  const neighbour = included[index + delta];
  if (index < 0 || neighbour === undefined) return [...draft];
  return moveDraftTo(draft, metricDefinitionId, neighbour.metricDefinitionId);
}

/** Entra no modelo (com o peso digitado) ou volta a entrar guardando a configuração de antes. */
export function includeInDraft(
  draft: readonly DraftItem[],
  metricDefinitionId: string,
  weight: number,
): DraftItem[] {
  const known = draft.some((item) => item.metricDefinitionId === metricDefinitionId);
  if (!known) return [...draft, { ...newDraftItem(metricDefinitionId), weight }];
  return draft.map((item) =>
    item.metricDefinitionId === metricDefinitionId ? { ...item, included: true, weight } : item,
  );
}

/** Sai do modelo. A linha continua no rascunho para o peso e a normalização não se perderem. */
export function excludeFromDraft(
  draft: readonly DraftItem[],
  metricDefinitionId: string,
): DraftItem[] {
  return draft.map((item) =>
    item.metricDefinitionId === metricDefinitionId ? { ...item, included: false } : item,
  );
}

/**
 * Configuração de partida de cada estratégia (§9). Trocar a normalização pela célula é uma
 * escolha grossa — os detalhes (faixas, metas, janelas) ficam na configuração completa.
 * CUSTOM_SAFE_RULE fica de fora: uma regra JSON Logic não tem padrão que faça sentido.
 */
export const NORMALIZATION_DEFAULTS: Readonly<
  Record<Exclude<NormalizationStrategy, 'CUSTOM_SAFE_RULE'>, NormalizationConfigInput>
> = {
  THRESHOLD_BANDS: {
    strategy: 'THRESHOLD_BANDS',
    bands: [
      { upTo: 50, health: 40 },
      { upTo: null, health: 100 },
    ],
  },
  LINEAR_RANGE: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
  RATIO_TO_TARGET: { strategy: 'RATIO_TO_TARGET', target: 100 },
  BASELINE_DEVIATION: { strategy: 'BASELINE_DEVIATION', window: 6, minHistory: 3 },
  BOOLEAN_MAP: { strategy: 'BOOLEAN_MAP', trueHealth: 100, falseHealth: 0 },
  SCORE_MAP: { strategy: 'SCORE_MAP', map: { padrao: 50 }, defaultHealth: 50 },
};

/** Troca a estratégia mantendo o que já estava configurado quando a estratégia não muda. */
export function withStrategy(
  current: NormalizationConfigInput,
  strategy: NormalizationStrategy,
): NormalizationConfigInput {
  if (current.strategy === strategy) return current;
  if (strategy === 'CUSTOM_SAFE_RULE') return current;
  return NORMALIZATION_DEFAULTS[strategy];
}

/** O rascunho mudou em relação ao que está gravado no servidor? */
export function isDirty(
  draft: readonly DraftItem[] | null,
  base: MetricModelVersionDto | null,
): boolean {
  if (draft === null) return false;
  const saved = base === null ? [] : draftToItems(versionToDraft(base));
  return JSON.stringify(draftToItems(draft)) !== JSON.stringify(saved);
}

/** Mapa id → definição, para a conferência dos pesos (só métrica ativa soma, §41). */
export function definitionsById(
  definitions: readonly MetricDefinitionDto[],
): Map<string, MetricDefinitionDto> {
  return new Map(definitions.map((definition) => [definition.id, definition]));
}
