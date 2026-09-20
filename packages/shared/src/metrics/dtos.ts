/**
 * DTOs das rotas /metrics e /metric-models (§36, §37). São o contrato entre API e web.
 *
 * Os campos `*Config` carregam JSON cuja forma é a dos tipos de configuração do motor
 * (`NormalizationConfig`, `TrendConfig`, `PersistenceConfig`, `TriggerConfig` em
 * `@inovaapss/engine`). Este pacote não importa o engine (o engine depende dele), por isso o
 * tipo aqui é `MetricConfigJson`; a validação de forma fica nos schemas Zod de
 * `@inovaapss/validation` (`metrics/`).
 */
import type {
  MetricDirection,
  MetricSource,
  MetricType,
  NormalizationStrategy,
  WeightMode,
} from '../domain.js';
import type { MetricModelVersionStatus, MetricPeriodicity } from './enums.js';

/** JSON de configuração serializável (objeto ou lista). */
export type MetricConfigJson = Record<string, unknown> | unknown[];

/** §36 metric_definitions — "tudo é métrica" (§6). */
export interface MetricDefinitionDto {
  id: string;
  organizationId: string;
  name: string;
  /** Chave estável da métrica na organização (ex.: `sla_compliance`). Única por organização. */
  slug: string;
  description: string | null;
  category: string | null;
  metricType: MetricType;
  unit: string | null;
  direction: MetricDirection;
  periodicity: MetricPeriodicity;
  sourceType: MetricSource;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** §36 metric_models — um modelo agrupa versões; a versão ativa é a que o scoring usa. */
export interface MetricModelDto {
  id: string;
  organizationId: string;
  name: string;
  /** §32 — MANUAL, ASSISTED ou AUTOMATIC. */
  mode: WeightMode;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** §36 metric_model_items — a configuração de uma métrica dentro de uma versão. */
export interface MetricModelItemDto {
  id: string;
  metricModelVersionId: string;
  metricDefinitionId: string;
  /** Peso no modelo, fração 0–1 com 4 casas (§12). */
  weight: number;
  /** §8 — pesos dos componentes (padrão 0,45 / 0,35 / 0,20). */
  currentWeight: number;
  trendWeight: number;
  persistenceWeight: number;
  normalizationStrategy: NormalizationStrategy;
  /** `NormalizationConfig` do motor (inclui `strategy`). */
  normalizationConfig: MetricConfigJson;
  /** `{ trend?: TrendConfig, persistence?: PersistenceConfig }` (METRICS_ENGINE.md §7). */
  thresholdConfig: MetricConfigJson | null;
  /** `TriggerConfig[]` (§27). */
  criticalTriggerConfig: MetricConfigJson | null;
  /** `{ explanationTemplate?, params?, rule? }` (§29, §9 CUSTOM_SAFE_RULE). */
  formulaConfig: MetricConfigJson | null;
  /** Ordem de exibição no configurador (§41). */
  sortOrder: number;
}

/** §31 metric_model_versions — versões são imutáveis depois de ativadas. */
export interface MetricModelVersionDto {
  id: string;
  metricModelId: string;
  organizationId: string;
  version: number;
  status: MetricModelVersionStatus;
  /** Quando a versão passou (ou passa) a valer. `null` em rascunho. */
  effectiveFrom: string | null;
  createdAt: string;
  items: MetricModelItemDto[];
}

/** Resumo da posição de uma definição na versão ativa do modelo ativo (tabela §41). */
export interface MetricActivePlacementDto {
  modelId: string;
  modelName: string;
  version: number;
  weight: number;
  sortOrder: number;
  normalizationStrategy: NormalizationStrategy;
}

/** Linha de GET /metrics: a definição e onde ela está no modelo ativo (ou `null`). */
export interface MetricDefinitionListItemDto extends MetricDefinitionDto {
  activePlacement: MetricActivePlacementDto | null;
}

/** GET /metrics/:id — definição, item da versão ativa (se houver) e o modelo correspondente. */
export interface MetricDefinitionDetailDto {
  definition: MetricDefinitionDto;
  activeItem: MetricModelItemDto | null;
  activeModel: { id: string; name: string; version: number } | null;
}

/** Resultado de DELETE /metrics/:id: apaga se nunca foi usada, senão só desativa (§31). */
export interface DeleteMetricDefinitionResultDto {
  outcome: 'deleted' | 'deactivated';
  definition: MetricDefinitionDto | null;
}

/** Uma linha da proposta de POST /metric-models/:id/rebalance (nunca salva). */
export interface RebalanceProposalRowDto {
  metricDefinitionId: string;
  currentWeight: number;
  proposedWeight: number;
  /** proposedWeight − currentWeight. */
  difference: number;
}

export interface RebalanceProposalDto {
  rows: RebalanceProposalRowDto[];
  /** Soma dos pesos atuais e dos propostos (a proposta soma 1,0000). */
  currentTotal: number;
  proposedTotal: number;
  /** Sempre false: a proposta só é aplicada se o usuário salvar num rascunho (§41). */
  saved: false;
}
