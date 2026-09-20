/**
 * Backtest histórico (§26, §27 e §59): roda o modelo sobre o passado e compara com os
 * cancelamentos que realmente aconteceram.
 *
 * A pergunta é simples: no mês `t`, olhando só para o que se sabia até `t`, o sistema teria
 * levantado a mão para quem ia embora? Daí saem precision, recall, taxa de falso positivo,
 * lead time e precision@5/@10 — nunca accuracy sozinha, que com 22 saídas em 80 clientes premiaria
 * quem dissesse "ninguém cancela" (§26).
 *
 * Como a saúde é recalculada aqui a partir da saúde de cada métrica e dos pesos avaliados, o mesmo
 * backtest serve para os pesos de hoje e para uma proposta — a comparação fica entre iguais.
 *
 * A distância até a saída é medida em DIAS de calendário, não em posição na série: assim um
 * cliente com buraco no histórico não muda o significado de "um mês antes", e o resultado de um
 * cliente não depende dos períodos que os outros têm.
 */
import { computeOverallHealth, computePriority } from '../scoring/overall.js';
import { isFiniteNumber, mean, median, round } from '../shared/math.js';

import type {
  BacktestOptions,
  BacktestPeriodRow,
  BacktestResult,
  CalibrationClientSeries,
  CalibrationPeriodPoint,
  CalibrationWeight,
  ChurnOutcome,
  LeadTimeSummary,
  TopNPrecision,
} from './types.js';

export const DEFAULT_WINDOW_DAYS = 90;
export const DEFAULT_PERIOD_DAYS = 30;
/** Saúde ≤ 59 (§2: faixas Risco e Crítico) é o que tratamos como "o sistema levantou a mão". */
export const DEFAULT_ALERT_RISK_THRESHOLD = 41;
export const DEFAULT_TOP_N: readonly number[] = [5, 10];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ResolvedBacktestOptions {
  windowDays: number;
  periodDays: number;
  windowPeriods: number;
  alertRiskThreshold: number;
  topN: readonly number[];
}

export function resolveBacktestOptions(options: BacktestOptions = {}): ResolvedBacktestOptions {
  const periodDays =
    isFiniteNumber(options.periodDays) && options.periodDays > 0
      ? options.periodDays
      : DEFAULT_PERIOD_DAYS;
  const windowDays =
    isFiniteNumber(options.windowDays) && options.windowDays > 0
      ? options.windowDays
      : DEFAULT_WINDOW_DAYS;
  const alertRiskThreshold = isFiniteNumber(options.alertRiskThreshold)
    ? Math.min(100, Math.max(0, options.alertRiskThreshold))
    : DEFAULT_ALERT_RISK_THRESHOLD;
  const topN = (options.topN ?? DEFAULT_TOP_N)
    .filter((n) => isFiniteNumber(n) && n > 0)
    .map((n) => Math.floor(n))
    .sort((a, b) => a - b);
  return {
    windowDays,
    periodDays,
    windowPeriods: Math.max(1, Math.round(windowDays / periodDays)),
    alertRiskThreshold,
    topN: topN.length > 0 ? topN : DEFAULT_TOP_N,
  };
}

/** Dias de calendário entre duas datas ISO; `null` quando alguma não é data. */
export function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return (to - from) / MS_PER_DAY;
}

/** Uma foto por período, do mais antigo ao mais novo; períodos repetidos ficam com o último. */
function normalizePeriods(
  periods: readonly CalibrationPeriodPoint[],
): readonly CalibrationPeriodPoint[] {
  const byEnd = new Map<string, CalibrationPeriodPoint>();
  for (const period of periods) byEnd.set(period.periodEnd, period);
  return [...byEnd.values()].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
}

/** §18: saúde geral = soma(saúde da métrica × peso) / soma(peso disponível). */
function healthFromWeights(
  point: CalibrationPeriodPoint,
  weights: readonly CalibrationWeight[],
): number | null {
  const contributions = weights
    .filter((w) => isFiniteNumber(w.weight) && w.weight > 0)
    .map((w) => ({
      metricId: w.metricId,
      weight: w.weight,
      metricHealth: point.metricHealth[w.metricId] ?? null,
      confidence: 100,
    }));
  if (contributions.length === 0) {
    return isFiniteNumber(point.recordedHealthScore) ? point.recordedHealthScore : null;
  }
  const { overallHealth } = computeOverallHealth(contributions, { useMetricConfidence: false });
  if (overallHealth !== null) return overallHealth;
  return isFiniteNumber(point.recordedHealthScore) ? point.recordedHealthScore : null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round(numerator / denominator, 4) : null;
}

function precisionAtN(rows: readonly BacktestPeriodRow[], n: number): TopNPrecision {
  const byPeriod = new Map<string, BacktestPeriodRow[]>();
  for (const row of rows) {
    const bucket = byPeriod.get(row.periodEnd);
    if (bucket) bucket.push(row);
    else byPeriod.set(row.periodEnd, [row]);
  }
  let slots = 0;
  let hits = 0;
  let bestPossible = 0;
  for (const bucket of byPeriod.values()) {
    // Empate resolvido pelo id: a fila precisa ser a mesma em toda execução.
    const ranked = [...bucket].sort((a, b) => {
      const pa = a.priorityScore ?? -1;
      const pb = b.priorityScore ?? -1;
      if (pa !== pb) return pb - pa;
      return a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0;
    });
    const take = Math.min(n, ranked.length);
    slots += take;
    for (let i = 0; i < take; i += 1) {
      if (ranked[i]?.churnedWithinWindow === true) hits += 1;
    }
    const positives = bucket.filter((row) => row.churnedWithinWindow).length;
    bestPossible += Math.min(take, positives);
  }
  return {
    n,
    slots,
    hits,
    precision: ratio(hits, slots),
    maxPrecision: ratio(bestPossible, slots),
  };
}

function summarizeLeadTime(outcomes: readonly ChurnOutcome[], periodDays: number): LeadTimeSummary {
  const leads = outcomes
    .filter((o) => o.caught && o.leadPeriods !== null)
    .map((o) => o.leadPeriods as number);
  const meanPeriods = mean(leads);
  const medianPeriods = median(leads);
  return {
    meanPeriods: meanPeriods === null ? null : round(meanPeriods, 2),
    medianPeriods: medianPeriods === null ? null : round(medianPeriods, 2),
    meanDays: meanPeriods === null ? null : round(meanPeriods * periodDays, 1),
    medianDays: medianPeriods === null ? null : round(medianPeriods * periodDays, 1),
    sampleSize: leads.length,
  };
}

export interface BacktestInput {
  clients: readonly CalibrationClientSeries[];
  weights: readonly CalibrationWeight[];
  options?: BacktestOptions;
}

export function runBacktest({ clients, weights, options }: BacktestInput): BacktestResult {
  const resolved = resolveBacktestOptions(options);

  const rows: BacktestPeriodRow[] = [];
  const churnOutcomes: ChurnOutcome[] = [];
  let clientsAnalyzed = 0;

  for (const client of [...clients].sort((a, b) => (a.clientId < b.clientId ? -1 : 1))) {
    const clientRows: BacktestPeriodRow[] = [];

    for (const point of normalizePeriods(client.periods)) {
      // Depois da saída o cliente não está mais na carteira: não há nada a prever.
      if (client.churnPeriodEnd !== null && point.periodEnd >= client.churnPeriodEnd) continue;

      const healthScore = healthFromWeights(point, weights);
      if (healthScore === null) continue;
      const riskScore = round(100 - healthScore, 2);
      const { priorityScore } = computePriority({
        riskScore,
        commercialImpactScore: point.commercialImpactScore,
      });

      let periodsUntilChurn: number | null = null;
      if (client.churnPeriodEnd !== null) {
        const days = daysBetween(point.periodEnd, client.churnPeriodEnd);
        periodsUntilChurn =
          days === null ? null : Math.max(1, Math.round(days / resolved.periodDays));
      }

      clientRows.push({
        clientId: client.clientId,
        periodEnd: point.periodEnd,
        healthScore,
        riskScore,
        priorityScore,
        alerted: riskScore >= resolved.alertRiskThreshold,
        churnedWithinWindow:
          periodsUntilChurn !== null && periodsUntilChurn <= resolved.windowPeriods,
        periodsUntilChurn,
      });
    }

    if (clientRows.length === 0) continue;
    clientsAnalyzed += 1;
    rows.push(...clientRows);

    if (client.churnPeriodEnd !== null) {
      const firstAlert = clientRows.find((row) => row.alerted) ?? null;
      churnOutcomes.push({
        clientId: client.clientId,
        clientName: client.clientName,
        churnPeriodEnd: client.churnPeriodEnd,
        caught: clientRows.some((row) => row.alerted && row.churnedWithinWindow),
        firstAlertPeriodEnd: firstAlert?.periodEnd ?? null,
        leadPeriods: firstAlert?.periodsUntilChurn ?? null,
      });
    }
  }

  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  for (const row of rows) {
    if (row.alerted && row.churnedWithinWindow) truePositives += 1;
    else if (row.alerted) falsePositives += 1;
    else if (row.churnedWithinWindow) falseNegatives += 1;
    else trueNegatives += 1;
  }

  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  const churnsCaught = churnOutcomes.filter((o) => o.caught).length;

  return {
    windowDays: resolved.windowDays,
    periodDays: resolved.periodDays,
    windowPeriods: resolved.windowPeriods,
    alertRiskThreshold: resolved.alertRiskThreshold,
    periodsAnalyzed: new Set(rows.map((row) => row.periodEnd)).size,
    pairsAnalyzed: rows.length,
    clientsAnalyzed,
    churnsAnalyzed: churnOutcomes.length,
    churnsCaught,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision,
    recall,
    churnDetectionRate: ratio(churnsCaught, churnOutcomes.length),
    falsePositiveRate: ratio(falsePositives, falsePositives + trueNegatives),
    f1:
      precision !== null && recall !== null && precision + recall > 0
        ? round((2 * precision * recall) / (precision + recall), 4)
        : null,
    leadTime: summarizeLeadTime(churnOutcomes, resolved.periodDays),
    topN: resolved.topN.map((n) => precisionAtN(rows, n)),
    churnOutcomes: churnOutcomes.sort((a, b) =>
      a.churnPeriodEnd === b.churnPeriodEnd
        ? a.clientId < b.clientId
          ? -1
          : 1
        : a.churnPeriodEnd < b.churnPeriodEnd
          ? -1
          : 1,
    ),
    rows,
  };
}
