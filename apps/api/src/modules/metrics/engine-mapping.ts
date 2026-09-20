/**
 * Ponte entre o que está persistido (definição + item da versão) e o `MetricConfig` que o motor
 * puro consome (METRICS_ENGINE.md §7). Também é aqui que a configuração é validada "de verdade":
 * além do Zod, rodamos o motor com uma série de exemplo — configuração inválida lança
 * `EngineConfigError` e vira 400 com a mensagem em português (SCORING.md §1).
 */
import {
  EngineConfigError,
  type MetricConfig,
  type MetricInput,
  type MetricScore,
  type PeriodValue,
  scoreMetric,
} from '@inovaapss/engine';

import { AppError } from '../../shared/errors.js';

import type { MetricDefinition, MetricModelItemWrite } from './types.js';

/** Configuração de um item sem o vínculo com a definição (preview-score e validação). */
export type ItemConfig = Omit<MetricModelItemWrite, 'metricDefinitionId' | 'sortOrder'>;

export class InvalidMetricConfigError extends AppError {
  constructor(message: string) {
    super(400, 'INVALID_METRIC_CONFIG', message);
    this.name = 'InvalidMetricConfigError';
  }
}

/** Monta o `MetricConfig` do motor a partir da definição e da configuração do item. */
export function toMetricConfig(definition: MetricDefinition, item: ItemConfig): MetricConfig {
  const config: MetricConfig = {
    id: definition.id,
    name: definition.name,
    key: definition.slug,
    type: definition.metricType,
    direction: definition.direction,
    weight: item.weight,
    normalization: item.normalizationConfig,
    componentWeights: {
      current: item.currentWeight,
      trend: item.trendWeight,
      persistence: item.persistenceWeight,
    },
    isActive: definition.isActive,
  };
  if (definition.unit !== null) config.unit = definition.unit;
  if (item.thresholdConfig?.trend !== undefined) config.trend = item.thresholdConfig.trend;
  if (item.thresholdConfig?.persistence !== undefined) {
    config.persistence = item.thresholdConfig.persistence;
  }
  if (item.criticalTriggerConfig !== null && item.criticalTriggerConfig.length > 0) {
    config.triggers = item.criticalTriggerConfig;
  }
  if (item.formulaConfig?.explanationTemplate !== undefined) {
    config.explanationTemplate = item.formulaConfig.explanationTemplate;
  }
  return config;
}

/** Série de exemplo usada só para provar que a configuração é avaliável. */
const SAMPLE_SERIES: PeriodValue[] = [
  { periodEnd: '2026-06-30', value: 10, text: 'sim' },
  { periodEnd: '2026-07-31', value: 12, text: 'sim' },
  { periodEnd: '2026-08-31', value: 15, text: 'sim' },
];

/**
 * Passa a configuração pelo motor com dados de exemplo. Lança `InvalidMetricConfigError` (400)
 * com a mensagem do motor quando faixas, janelas, pesos de componente ou regras não servem.
 */
export function assertEvaluableConfig(definition: MetricDefinition, item: ItemConfig): void {
  try {
    scoreMetric({ metric: toMetricConfig(definition, item), series: SAMPLE_SERIES });
  } catch (err) {
    if (err instanceof EngineConfigError) {
      throw new InvalidMetricConfigError(
        `Configuração da métrica "${definition.name}": ${err.message}`,
      );
    }
    throw err;
  }
}

export interface PreviewScoreInput {
  definition: MetricDefinition;
  item: ItemConfig;
  series: PeriodValue[];
  extra?: Record<string, number | string | boolean | null> | undefined;
  periodLabel?: string | undefined;
}

/**
 * §37 POST /metrics/:id/preview-score — chama o motor de verdade (normalize → trend →
 * persistence → metric health → gatilhos → explicação) sobre valores digitados, sem banco.
 */
export function previewScore(input: PreviewScoreInput): MetricScore {
  // Valida a configuração com a série de exemplo antes: uma série curta do usuário (1 período)
  // não chega a exercitar tendência/persistência e deixaria passar configuração inválida.
  assertEvaluableConfig(input.definition, input.item);
  const metricInput: MetricInput = {
    metric: toMetricConfig(input.definition, input.item),
    series: input.series,
  };
  if (input.extra !== undefined) metricInput.extra = input.extra;
  try {
    return scoreMetric(
      metricInput,
      input.periodLabel !== undefined ? { periodLabel: input.periodLabel } : {},
    );
  } catch (err) {
    if (err instanceof EngineConfigError) {
      throw new InvalidMetricConfigError(
        `Configuração da métrica "${input.definition.name}": ${err.message}`,
      );
    }
    throw err;
  }
}
