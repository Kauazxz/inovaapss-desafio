/**
 * Tipos locais do módulo de métricas. Os DTOs expostos na API vêm de @inovaapss/shared; aqui
 * ficam as entradas dos casos de uso e as formas que o repositório devolve.
 */
import type {
  MetricActivePlacementDto,
  MetricDefinitionDto,
  MetricModelDto,
  MetricModelItemDto,
  MetricModelVersionDto,
  MetricModelVersionStatus,
} from '@inovaapss/shared';
import type {
  CreateMetricDefinitionBody,
  CreateMetricModelBody,
  FormulaConfigInput,
  ListMetricDefinitionsQuery,
  ListMetricModelsQuery,
  MetricModelItemBody,
  NormalizationConfigInput,
  ThresholdConfigInput,
  TriggerListInput,
  UpdateMetricDefinitionBody,
} from '@inovaapss/validation';

export type MetricDefinition = MetricDefinitionDto;
export type MetricModel = MetricModelDto;
export type MetricModelVersion = MetricModelVersionDto;
export type MetricModelItem = MetricModelItemDto;

export type CreateMetricDefinitionInput = CreateMetricDefinitionBody;
export type UpdateMetricDefinitionInput = UpdateMetricDefinitionBody;
export type ListMetricDefinitionsInput = ListMetricDefinitionsQuery;
export type CreateMetricModelInput = CreateMetricModelBody;
export type ListMetricModelsInput = ListMetricModelsQuery;

/** Item já validado pelo Zod, como o service o entrega ao repositório. */
export interface MetricModelItemWrite {
  metricDefinitionId: string;
  weight: number;
  currentWeight: number;
  trendWeight: number;
  persistenceWeight: number;
  normalizationConfig: NormalizationConfigInput;
  thresholdConfig: ThresholdConfigInput | null;
  criticalTriggerConfig: TriggerListInput | null;
  formulaConfig: FormulaConfigInput | null;
  sortOrder: number;
}

export type MetricModelItemInput = MetricModelItemBody;

export interface PagedResult<T> {
  items: T[];
  total: number;
}

/** Onde uma definição aparece na versão ativa do modelo ativo (lista §41). */
export interface ActivePlacement extends MetricActivePlacementDto {
  metricDefinitionId: string;
  item: MetricModelItem;
}

/** Quantas versões usam a definição, por status. */
export interface DefinitionUsage {
  total: number;
  byStatus: Record<MetricModelVersionStatus, number>;
}

export interface CreateVersionInput {
  metricModelId: string;
  version: number;
  status: MetricModelVersionStatus;
  effectiveFrom: string | null;
  items: MetricModelItemWrite[];
}
