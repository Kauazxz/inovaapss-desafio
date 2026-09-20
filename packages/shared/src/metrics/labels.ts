/** Rótulos em português para a interface (§6, §9, §31, §32). */
import type {
  MetricDirection,
  MetricSource,
  MetricType,
  NormalizationStrategy,
  WeightMode,
} from '../domain.js';
import type { MetricModelVersionStatus, MetricPeriodicity } from './enums.js';

export const METRIC_TYPE_LABELS: Readonly<Record<MetricType, string>> = {
  TIME: 'Tempo',
  PERCENTAGE: 'Percentual',
  QUANTITY: 'Quantidade',
  FREQUENCY: 'Frequência',
  FINANCIAL: 'Financeiro',
  VARIATION: 'Variação',
  SCORE: 'Nota',
  BOOLEAN: 'Sim/não',
  CATEGORY: 'Categoria',
  DATE_DEADLINE: 'Prazo',
};

export const METRIC_DIRECTION_LABELS: Readonly<Record<MetricDirection, string>> = {
  HIGHER_IS_BETTER: 'Maior é melhor',
  HIGHER_IS_WORSE: 'Maior é pior',
  TARGET_RANGE: 'Faixa-alvo',
  CUSTOM: 'Personalizada',
};

export const METRIC_SOURCE_LABELS: Readonly<Record<MetricSource, string>> = {
  MANUAL: 'Manual',
  CSV: 'CSV',
  XLSX: 'Planilha (XLSX)',
  JSON: 'JSON',
  API: 'API',
  DOCUMENT: 'Documento',
  DERIVED: 'Derivada',
};

export const NORMALIZATION_STRATEGY_LABELS: Readonly<Record<NormalizationStrategy, string>> = {
  THRESHOLD_BANDS: 'Faixas de limite',
  LINEAR_RANGE: 'Escala linear',
  RATIO_TO_TARGET: 'Razão para a meta',
  BASELINE_DEVIATION: 'Desvio do baseline',
  BOOLEAN_MAP: 'Mapa sim/não',
  SCORE_MAP: 'Mapa de categorias',
  CUSTOM_SAFE_RULE: 'Regra segura (JSON Logic)',
};

export const METRIC_PERIODICITY_LABELS: Readonly<Record<MetricPeriodicity, string>> = {
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  YEARLY: 'Anual',
};

export const WEIGHT_MODE_LABELS: Readonly<Record<WeightMode, string>> = {
  MANUAL: 'Manual',
  ASSISTED: 'Assistido',
  AUTOMATIC: 'Automático',
};

export const METRIC_MODEL_VERSION_STATUS_LABELS: Readonly<
  Record<MetricModelVersionStatus, string>
> = {
  draft: 'Rascunho',
  active: 'Ativa',
  archived: 'Arquivada',
};
