/**
 * Títulos dinâmicos com o "e daí?" e resumos acessíveis dos gráficos (DATAVIZ.md §1.5).
 * Ficam fora dos componentes para o Fast Refresh e para os testes montarem a frase esperada.
 */
import {
  HEALTH_CLASS_LABELS,
  type ClassDistributionItem,
  type DimensionHealth,
  type ForecastChartData,
  type HealthThresholds,
  type HealthTimeline,
} from '@inovaapss/shared';

import { formatInteger } from '@/lib/format';

// ---------- Forecast priorizado (DATAVIZ.md §5) ----------

/** Muda com 0, 1 ou N cruzamentos; diz quando não há histórico para projetar. */
export function forecastTitle(data: Pick<ForecastChartData, 'rows' | 'crossingCount'>): string {
  if (data.rows.length === 0) return 'Nenhum cliente no recorte atual';
  if (data.rows.every((row) => row.healthProjected === null)) {
    return 'Sem histórico suficiente para projetar o próximo período';
  }
  if (data.crossingCount === 0) return 'Nenhum cliente deve mudar de faixa no próximo período';
  if (data.crossingCount === 1) {
    return '1 cliente deve cruzar para Risco ou Crítico no próximo período';
  }
  return `${data.crossingCount} clientes devem cruzar para Risco ou Crítico no próximo período`;
}

/** Subtítulo obrigatório (DATAVIZ.md §5.1) + a legenda em texto. */
export function forecastSubtitle(data: Pick<ForecastChartData, 'trendWindow' | 'periodLabel'>) {
  const period = data.periodLabel === 'mês' ? 'meses' : `${data.periodLabel}s`;
  return `Projeção por tendência dos últimos ${data.trendWindow} ${period} — não é modelo preditivo · ● atual ▶ projetado · em azul, quem cruza para Risco ou Crítico`;
}

/** Resumo para leitores de tela: o que o gráfico mostra, com os nomes e números que importam. */
export function forecastSummary(data: ForecastChartData, visibleCount: number): string {
  const crossing = data.rows.filter((row) => row.crossesDown);
  const parts = [
    `Gráfico de forecast priorizado com ${data.rows.length} clientes ordenados por prioridade, mostrando os ${Math.min(visibleCount, data.rows.length)} primeiros.`,
  ];
  if (crossing.length > 0) {
    const list = crossing
      .map(
        (row) =>
          `${row.clientName} (de ${formatInteger(row.healthCurrent)} para ${formatInteger(row.healthProjected ?? 0)}, ${HEALTH_CLASS_LABELS[row.projectedClass ?? row.currentClass]})`,
      )
      .join('; ');
    parts.push(`Devem cruzar para Risco ou Crítico: ${list}.`);
  }
  parts.push('Projeção por tendência, não é modelo preditivo. Os mesmos dados estão na tabela.');
  return parts.join(' ');
}

// ---------- Distribuição por classe (DATAVIZ.md §4.2) ----------

/** "1 em cada 4 clientes está em Risco ou Crítico". */
export function distributionTitle(distribution: readonly ClassDistributionItem[]): string {
  const total = distribution.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return 'Nenhum cliente ativo com score no recorte atual';
  const atRisk = distribution
    .filter((item) => item.healthClass === 'RISK' || item.healthClass === 'CRITICAL')
    .reduce((sum, item) => sum + item.count, 0);
  if (atRisk === 0) return 'Nenhum cliente está em Risco ou Crítico';
  if (atRisk === total) return 'Todos os clientes estão em Risco ou Crítico';
  const ratio = Math.round(total / atRisk);
  if (ratio >= 2) return `1 em cada ${ratio} clientes está em Risco ou Crítico`;
  return `${atRisk} de ${total} clientes estão em Risco ou Crítico`;
}

// ---------- Saúde por dimensão (DATAVIZ.md §4.2) ----------

/** Aponta a dimensão mais fraca ou diz que está tudo na faixa-alvo. */
export function dimensionTitle(
  dimensions: readonly DimensionHealth[],
  targetBand: { min: number; max: number },
  thresholds: HealthThresholds,
): string {
  const withData = dimensions.filter(
    (dimension): dimension is DimensionHealth & { health: number } => dimension.health !== null,
  );
  if (withData.length === 0) return 'Sem dados por dimensão no recorte atual';
  const worst = withData.reduce((a, b) => (b.health < a.health ? b : a));
  const below = withData.filter((dimension) => dimension.health < thresholds.risk);
  if (worst.health >= targetBand.min) {
    return `Todas as dimensões estão na faixa-alvo (${targetBand.min}–${targetBand.max})`;
  }
  const detail =
    below.length > 1
      ? ` — ${below.length} dimensões abaixo de ${thresholds.risk}`
      : ` — abaixo da faixa-alvo (${targetBand.min}–${targetBand.max})`;
  return `${worst.label} é a dimensão mais fraca da carteira: média ${formatInteger(worst.health)}${detail}`;
}

// ---------- Evolução temporal (DATAVIZ.md §4.2) ----------

function firstAndLast(
  values: (number | null)[],
): { first: number; last: number; span: number } | null {
  const indexed = values
    .map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => item.value !== null);
  const first = indexed[0];
  const last = indexed[indexed.length - 1];
  if (!first || !last) return null;
  return { first: first.value, last: last.value, span: last.index - first.index };
}

function movementPhrase(first: number, last: number, span: number, periodWord: string): string {
  const delta = last - first;
  const plural = periodWord === 'mês' ? 'meses' : `${periodWord}s`;
  const period = span === 1 ? `1 ${periodWord}` : `${span} ${plural}`;
  if (Math.abs(delta) < 2) return `está estável em ${formatInteger(last)} há ${period}`;
  return `${delta < 0 ? 'caiu' : 'subiu'} ${formatInteger(Math.abs(delta))} pontos em ${period} (de ${formatInteger(first)} para ${formatInteger(last)})`;
}

/** O cliente destacado contra a média, ou a média da carteira no tempo. */
export function timelineTitle(timeline: HealthTimeline, periodWord = 'mês'): string {
  const portfolio = firstAndLast(timeline.portfolio.map((point) => point.health));
  if (!portfolio) return 'Sem histórico de health no recorte atual';
  if (timeline.client) {
    const client = firstAndLast(timeline.client.points.map((point) => point.health));
    if (client) {
      const gap = client.last - portfolio.last;
      const position =
        Math.abs(gap) < 2
          ? 'e está na média da carteira'
          : `e está ${formatInteger(Math.abs(gap))} pontos ${gap < 0 ? 'abaixo' : 'acima'} da média da carteira`;
      return `${timeline.client.clientName} ${movementPhrase(client.first, client.last, client.span, periodWord)} ${position}`;
    }
  }
  return `A média da carteira ${movementPhrase(portfolio.first, portfolio.last, portfolio.span, periodWord)}`;
}
