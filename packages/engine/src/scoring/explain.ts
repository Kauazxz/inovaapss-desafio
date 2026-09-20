import { fillTemplate, formatNumber, formatSigned, pluralize } from '../shared/format.js';
import { isFiniteNumber } from '../shared/math.js';

import type { MetricConfig, NormalizationResult, ResponseAnalysis, TrendResult } from './types.js';

export interface ExplainInput {
  metric: Pick<MetricConfig, 'name' | 'unit' | 'direction' | 'explanationTemplate'>;
  currentValue: number | null;
  previousValue: number | null;
  normalization: NormalizationResult;
  trend: TrendResult;
  extra?: Record<string, number | string | boolean | null>;
}

export interface ExplainOptions {
  /** Nome do período para os textos ("mês", "semana", "período"). Padrão "período". */
  periodLabel?: string;
}

/** Heurística de concordância: nome terminado em "s" minúsculo é plural ("Chamados críticos"). */
function isPluralName(name: string): boolean {
  return /[a-záéíóúâêôãõç]s$/.test(name.trim());
}

function verb(name: string, singular: string, plural: string): string {
  return isPluralName(name) ? plural : singular;
}

function withUnit(value: number, unit: string | undefined): string {
  const text = formatNumber(value);
  if (!unit) return text;
  return unit === '%' ? `${text} %` : `${text} ${unit}`;
}

/**
 * Gera o `human_explanation` de uma métrica (§29, §58) em português, no estilo
 * "SLA caiu 24 p.p. em 3 meses", "Uso está 19 % abaixo do baseline", "Taxa de reabertura dobrou".
 * A organização pode substituir pelo `explanationTemplate` da métrica.
 */
export function explainMetric(input: ExplainInput, options: ExplainOptions = {}): string {
  const { metric, currentValue, previousValue, normalization, trend } = input;
  const periodLabel = options.periodLabel ?? 'período';
  const name = metric.name;

  if (metric.explanationTemplate) {
    const delta =
      isFiniteNumber(currentValue) && isFiniteNumber(previousValue)
        ? currentValue - previousValue
        : null;
    const values: Record<string, string | number | null> = {
      name,
      unit: metric.unit ?? '',
      value: currentValue,
      previous: previousValue,
      delta: delta === null ? null : formatSigned(delta),
      deltaAbs: delta === null ? null : Math.abs(delta),
      deltaPct: trend.changePercent === null ? null : formatSigned(trend.changePercent),
      baseline: normalization.baseline,
      deviationPct:
        normalization.deviationPct === null ? null : formatSigned(normalization.deviationPct),
      window: trend.periodsUsed > 0 ? pluralize(trend.periodsUsed, periodLabel) : null,
    };
    for (const [key, raw] of Object.entries(input.extra ?? {})) {
      values[`extra.${key}`] = raw === null ? null : typeof raw === 'number' ? raw : String(raw);
    }
    return fillTemplate(metric.explanationTemplate, values);
  }

  if (!isFiniteNumber(currentValue)) {
    return `${name}: sem dado no período.`;
  }

  const span = trend.periodsUsed >= 2 ? ` em ${pluralize(trend.periodsUsed, periodLabel)}` : '';

  // Tendência disponível sobre valores brutos: "subiu/caiu X em N períodos".
  if (trend.basis === 'RAW' && isFiniteNumber(trend.firstValue) && isFiniteNumber(trend.change)) {
    const change = trend.change;
    const since = trend.periodsUsed >= 2 ? ` há ${pluralize(trend.periodsUsed, periodLabel)}` : '';
    if (change === 0) {
      return `${name} ${verb(name, 'está estável', 'estão estáveis')} em ${withUnit(currentValue, metric.unit)}${since}.`;
    }
    const rose = change > 0;
    const pct = trend.changePercent;
    const moved = verb(name, rose ? 'subiu' : 'caiu', rose ? 'subiram' : 'caíram');
    if (pct === 100) {
      return `${name} ${verb(name, 'dobrou', 'dobraram')}${span} (de ${formatNumber(trend.firstValue)} para ${withUnit(currentValue, metric.unit)}).`;
    }
    if (metric.unit === '%') {
      // Diferença de percentuais em pontos percentuais.
      return `${name} ${moved} ${formatNumber(Math.abs(change))} p.p.${span}.`;
    }
    const pctText = pct === null ? '' : ` (${formatSigned(pct)} %)`;
    return `${name} ${moved} de ${formatNumber(trend.firstValue)} para ${withUnit(currentValue, metric.unit)}${span}${pctText}.`;
  }

  // Sem tendência: desvio em relação ao baseline do próprio cliente.
  if (isFiniteNumber(normalization.deviationPct) && normalization.baseline !== null) {
    const dev = normalization.deviationPct;
    if (dev === 0) {
      return `${name} ${verb(name, 'está', 'estão')} no baseline (${withUnit(currentValue, metric.unit)}).`;
    }
    const where = normalization.strategy === 'RATIO_TO_TARGET' ? 'da meta' : 'do baseline';
    return `${name} ${verb(name, 'está', 'estão')} ${formatNumber(Math.abs(dev))} % ${dev > 0 ? 'acima' : 'abaixo'} ${where}.`;
  }

  return `${name}: ${withUnit(currentValue, metric.unit)} no período atual.`;
}

export interface ExplainUnansweredInput extends ExplainInput {
  response: ResponseAnalysis;
  /** O health do último período respondido foi mantido (com frescor reduzido). */
  carried: boolean;
}

/**
 * §22 — explicação quando o cliente foi consultado e não respondeu: diferente de "sem dado".
 * Ex.: "NPS: sem resposta neste mês (2 meses seguidos; o cliente costumava responder; última
 * resposta 9 há 2 meses, mantida com frescor reduzido)."
 */
export function explainUnanswered(input: ExplainUnansweredInput, options: ExplainOptions = {}) {
  const { metric, response } = input;
  const periodLabel = options.periodLabel ?? 'período';
  const details: string[] = [];
  if (response.consecutiveUnanswered >= 2) {
    details.push(
      `${pluralize(response.consecutiveUnanswered, periodLabel)} seguidos sem responder`,
    );
  }
  if (response.behaviorChanged) details.push('o cliente costumava responder');
  if (isFiniteNumber(response.lastAnsweredValue) && response.periodsSinceLastAnswer !== null) {
    const ago = pluralize(response.periodsSinceLastAnswer, periodLabel);
    details.push(
      `última resposta ${withUnit(response.lastAnsweredValue, metric.unit)} há ${ago}${input.carried ? ', mantida com frescor reduzido' : ''}`,
    );
  } else if (response.lastAnsweredValue === null) {
    details.push('nenhuma resposta no histórico');
  }
  const suffix = details.length > 0 ? ` (${details.join('; ')})` : '';
  return `${metric.name}: sem resposta neste ${periodLabel}${suffix}.`;
}
