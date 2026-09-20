import type { MetricDefinitionListItemDto } from '@inovaapss/shared';

/** Modelo ativo primeiro, na ordem configurada; demais métricas em ordem alfabética. */
export function orderMetricItems(
  items: readonly MetricDefinitionListItemDto[],
): MetricDefinitionListItemDto[] {
  return [...items].sort((left, right) => {
    const leftOrder = left.activePlacement?.sortOrder;
    const rightOrder = right.activePlacement?.sortOrder;
    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder || left.name.localeCompare(right.name, 'pt-BR');
    }
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return left.name.localeCompare(right.name, 'pt-BR');
  });
}
