/**
 * Traduz a configuração persistida de uma métrica (JSONs do item) para frases em português,
 * sem editor rico: a tela de detalhe mostra o que o motor vai fazer (SCORING.md §3–§5, §8).
 * O configurador completo é a Etapa 10.
 */
import {
  DEFAULT_COMPONENT_WEIGHTS,
  DEFAULT_PERSISTENCE_WINDOW_PERIODS,
  DEFAULT_TREND_WINDOW_PERIODS,
  METRIC_DIRECTION_LABELS,
  NORMALIZATION_STRATEGY_LABELS,
  type MetricConfigJson,
  type MetricDirection,
  type MetricModelItemDto,
  type NormalizationStrategy,
} from '@inovaapss/shared';

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Rec) : {};
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const pt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const fmt = (value: number): string => pt.format(value);
export const pct = (fraction: number): string => `${pt.format(fraction * 100)} %`;

const TREND_METHOD_LABELS: Readonly<Record<string, string>> = {
  DELTA_PERCENT: 'variação percentual',
  DELTA_ABSOLUTE: 'variação absoluta',
  MOVING_AVERAGE: 'média móvel',
  SLOPE: 'inclinação (regressão linear)',
  BASELINE_COMPARISON: 'comparação com o baseline',
};

/** Frases que descrevem a normalização (§9) para uma pessoa que não é programadora. */
export function describeNormalization(
  config: MetricConfigJson,
  direction: MetricDirection,
): string[] {
  const c = asRecord(config);
  const strategy = c.strategy as NormalizationStrategy | undefined;
  const lines: string[] = [];
  if (strategy === undefined) return ['Sem normalização configurada.'];
  lines.push(`Estratégia: ${NORMALIZATION_STRATEGY_LABELS[strategy] ?? strategy}.`);

  switch (strategy) {
    case 'THRESHOLD_BANDS': {
      const bands = Array.isArray(c.bands) ? c.bands.map(asRecord) : [];
      for (const band of bands) {
        const upTo = num(band.upTo);
        const health = num(band.health) ?? 0;
        lines.push(
          upTo === undefined
            ? `Acima disso → health ${fmt(health)}.`
            : `Até ${fmt(upTo)} → health ${fmt(health)}.`,
        );
      }
      break;
    }
    case 'LINEAR_RANGE': {
      const min = num(c.min) ?? 0;
      const max = num(c.max) ?? 100;
      const target = asRecord(c.target);
      const tMin = num(target.min);
      const tMax = num(target.max);
      lines.push(
        direction === 'HIGHER_IS_WORSE'
          ? `Escala de ${fmt(min)} a ${fmt(max)}: ${fmt(min)} vale 100 e ${fmt(max)} vale 0.`
          : `Escala de ${fmt(min)} a ${fmt(max)}: ${fmt(min)} vale 0 e ${fmt(max)} vale 100.`,
      );
      if (tMin !== undefined && tMax !== undefined) {
        lines.push(`Dentro da faixa-alvo ${fmt(tMin)}–${fmt(tMax)} o health é 100.`);
      }
      break;
    }
    case 'RATIO_TO_TARGET': {
      const target = num(c.target) ?? 0;
      lines.push(`Meta: ${fmt(target)}. O health é a razão entre o valor e a meta.`);
      const zeroAt = num(c.zeroAtRatio);
      if (direction === 'HIGHER_IS_WORSE') {
        lines.push(`Chega a 0 em ${fmt(zeroAt ?? 2)}× a meta (${fmt((zeroAt ?? 2) * target)}).`);
      }
      break;
    }
    case 'BASELINE_DEVIATION': {
      const window = num(c.window) ?? 6;
      const tolerance = num(c.tolerancePct) ?? 0;
      const maxDev = num(c.maxDeviationPct) ?? 50;
      const method = typeof c.method === 'string' ? c.method : 'auto';
      lines.push(
        `Compara o valor com o baseline do próprio cliente (últimos ${window} períodos, ${
          method === 'auto'
            ? 'mediana quando há outlier, média senão'
            : method === 'median'
              ? 'mediana'
              : 'média'
        }).`,
      );
      lines.push(
        `Até ${fmt(tolerance)} % de desvio o health é 100; a ${fmt(maxDev)} % de piora chega a 0.`,
      );
      if (c.absolute !== undefined) lines.push('Também aplica faixas absolutas ao valor bruto.');
      break;
    }
    case 'BOOLEAN_MAP': {
      const trueHealth = num(c.trueHealth);
      const falseHealth = num(c.falseHealth);
      lines.push(
        `Sim → health ${fmt(trueHealth ?? (direction === 'HIGHER_IS_WORSE' ? 0 : 100))}; não → health ${fmt(
          falseHealth ?? (direction === 'HIGHER_IS_WORSE' ? 100 : 0),
        )}.`,
      );
      break;
    }
    case 'SCORE_MAP': {
      const map = asRecord(c.map);
      for (const [key, value] of Object.entries(map)) {
        lines.push(`"${key}" → health ${fmt(num(value) ?? 0)}.`);
      }
      const fallback = num(c.defaultHealth);
      lines.push(
        fallback === undefined
          ? 'Categoria fora do mapa fica N/A.'
          : `Categoria fora do mapa → health ${fmt(fallback)}.`,
      );
      break;
    }
    case 'CUSTOM_SAFE_RULE': {
      lines.push(
        c.output === 'value'
          ? 'Uma regra JSON Logic segura calcula um valor derivado, normalizado em seguida.'
          : 'Uma regra JSON Logic segura devolve o health diretamente (sem eval).',
      );
      break;
    }
    default:
      break;
  }
  return lines;
}

/** Pesos dos componentes e janelas de tendência/persistência (§8, §10, §11). */
export function describeComponents(item: MetricModelItemDto): string[] {
  const total = item.currentWeight + item.trendWeight + item.persistenceWeight;
  const share = (w: number) => pct(total > 0 ? w / total : 0);
  const thresholds = asRecord(item.thresholdConfig);
  const trend = asRecord(thresholds.trend);
  const persistence = asRecord(thresholds.persistence);
  const trendWindow = num(trend.window) ?? DEFAULT_TREND_WINDOW_PERIODS;
  const trendMethod = typeof trend.method === 'string' ? trend.method : 'DELTA_PERCENT';
  const persistenceWindow = num(persistence.window) ?? DEFAULT_PERSISTENCE_WINDOW_PERIODS;
  const unhealthyBelow = num(persistence.unhealthyBelow) ?? 60;
  return [
    `Health da métrica = atual × ${share(item.currentWeight)} + tendência × ${share(item.trendWeight)} + persistência × ${share(item.persistenceWeight)}.`,
    `Tendência: ${TREND_METHOD_LABELS[trendMethod] ?? trendMethod} nos últimos ${trendWindow} períodos.`,
    `Persistência: quantos dos últimos ${persistenceWindow} períodos ficaram abaixo de ${fmt(unhealthyBelow)}.`,
  ];
}

/** Gatilhos críticos (§27): um por linha. */
export function describeTriggers(config: MetricConfigJson | null): string[] {
  if (!Array.isArray(config) || config.length === 0) return [];
  return config.map((raw) => {
    const t = asRecord(raw);
    const name = typeof t.name === 'string' ? t.name : 'Gatilho';
    const floor = num(t.priorityFloor);
    const suffix = floor === undefined ? '' : ` — eleva a prioridade a pelo menos ${fmt(floor)}`;
    if (t.kind === 'THRESHOLD') {
      return `${name}: quando ${String(t.field)} ${String(t.operator)} ${fmt(num(t.threshold) ?? 0)}${suffix}.`;
    }
    if (t.kind === 'STREAK') {
      return `${name}: valor ${String(t.operator)} ${fmt(num(t.threshold) ?? 0)} por ${fmt(num(t.consecutivePeriods) ?? 1)} períodos seguidos${suffix}.`;
    }
    return `${name}: regra JSON Logic segura${suffix}.`;
  });
}

/** Frase única sobre a direção (§6). */
export function describeDirection(direction: MetricDirection): string {
  const label = METRIC_DIRECTION_LABELS[direction];
  switch (direction) {
    case 'HIGHER_IS_BETTER':
      return `${label}: valores maiores deixam o cliente mais saudável.`;
    case 'HIGHER_IS_WORSE':
      return `${label}: valores maiores indicam problema.`;
    case 'TARGET_RANGE':
      return `${label}: o ideal é ficar dentro de um intervalo.`;
    default:
      return `${label}: a regra da métrica define o que é melhor.`;
  }
}

/** Configuração usada na simulação quando a métrica ainda não está em nenhuma versão ativa. */
export const DEFAULT_SIMULATION_ITEM = {
  weight: 1,
  currentWeight: DEFAULT_COMPONENT_WEIGHTS.current,
  trendWeight: DEFAULT_COMPONENT_WEIGHTS.trend,
  persistenceWeight: DEFAULT_COMPONENT_WEIGHTS.persistence,
  normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
} as const;
