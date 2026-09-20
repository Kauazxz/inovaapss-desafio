/**
 * Canvas de Decisão do Agente IA.
 *
 * A IA escolhe somente o preset. Todo valor abaixo vem dos mesmos DTOs usados pelo dashboard,
 * o que impede gráficos bonitos com números inventados e preserva o isolamento por tenant.
 */
import type {
  AssistantCanvas,
  AssistantCanvasMetric,
  AssistantCanvasPreset,
  AssistantCanvasWidget,
  GeneralDashboardData,
  RiskDashboardData,
} from '@inovaapss/shared';

const CANVAS_RANKING_LIMIT = 8;
const compactCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function riskMetrics(risk: RiskDashboardData): AssistantCanvasMetric[] {
  return [
    {
      label: 'Clientes críticos',
      value: risk.kpis.criticalClients.value,
      delta: risk.kpis.criticalClients.delta,
      format: 'integer',
      tone: 'critical',
    },
    {
      label: 'Clientes em risco',
      value: risk.kpis.riskClients.value,
      delta: risk.kpis.riskClients.delta,
      format: 'integer',
      tone: 'risk',
    },
    {
      label: 'Receita em risco',
      value: risk.kpis.mrrAtRisk.value,
      delta: risk.kpis.mrrAtRisk.delta,
      format: 'currency',
      currency: risk.kpis.currency,
      hint: 'MRR de clientes em Risco ou Crítico',
      tone: 'attention',
    },
  ];
}

function portfolioMetrics(general: GeneralDashboardData): AssistantCanvasMetric[] {
  return [
    {
      label: 'MRR da carteira',
      value: general.kpis.mrr.value,
      delta: general.kpis.mrr.delta,
      format: 'currency',
      currency: general.kpis.currency,
    },
    {
      label: 'Clientes ativos',
      value: general.kpis.activeClients.value,
      delta: general.kpis.activeClients.delta,
      format: 'integer',
    },
    {
      label: 'Cancelados',
      value: general.kpis.cancelledClients.value,
      delta: general.kpis.cancelledClients.delta,
      format: 'integer',
      tone: 'attention',
    },
  ];
}

function forecastWidget(risk: RiskDashboardData): AssistantCanvasWidget {
  return {
    type: 'forecast',
    data: {
      ...risk.forecast,
      rows: risk.forecast.rows.slice(0, CANVAS_RANKING_LIMIT),
    },
  };
}

function prioritiesWidget(risk: RiskDashboardData): AssistantCanvasWidget {
  return {
    type: 'priorities',
    title: 'Próximas ações',
    rows: risk.ranking.slice(0, CANVAS_RANKING_LIMIT),
  };
}

function metricsWidget(title: string, items: AssistantCanvasMetric[]): AssistantCanvasWidget {
  return { type: 'metrics', title, items };
}

function widgetsFor(
  preset: AssistantCanvasPreset,
  risk: RiskDashboardData,
  general: GeneralDashboardData,
): AssistantCanvasWidget[] {
  switch (preset) {
    case 'risk':
      return [
        metricsWidget('Sinais de risco agora', riskMetrics(risk)),
        forecastWidget(risk),
        prioritiesWidget(risk),
      ];
    case 'revenue':
      return [
        metricsWidget('Receita e exposição', [
          portfolioMetrics(general)[0]!,
          riskMetrics(risk)[2]!,
          {
            label: 'Carteira exposta',
            value:
              general.kpis.mrr.value <= 0
                ? 0
                : (risk.kpis.mrrAtRisk.value / general.kpis.mrr.value) * 100,
            delta: null,
            format: 'percent',
            hint: '% do MRR total',
            tone: 'attention',
          },
        ]),
        { type: 'distribution', distribution: general.distribution },
        prioritiesWidget(risk),
      ];
    case 'forecast':
      return [
        metricsWidget('Próximo período', [
          {
            label: 'Devem piorar de classe',
            value: risk.forecast.crossingCount,
            delta: null,
            format: 'integer',
            tone: risk.forecast.crossingCount > 0 ? 'critical' : 'neutral',
          },
          ...riskMetrics(risk).slice(0, 2),
        ]),
        forecastWidget(risk),
        { type: 'timeline', timeline: general.timeline, thresholds: general.thresholds },
      ];
    case 'dimensions': {
      const worst = general.dimensions.find((dimension) => dimension.health !== null);
      return [
        metricsWidget('Leitura por dimensão', [
          ...(worst === undefined
            ? []
            : [
                {
                  label: `Pior dimensão · ${worst.label}`,
                  value: worst.health ?? 0,
                  delta: null,
                  format: 'score' as const,
                  hint: `${integer.format(worst.clientCount)} clientes medidos`,
                  tone:
                    worst.health !== null && worst.health < general.thresholds.risk
                      ? ('risk' as const)
                      : ('neutral' as const),
                },
              ]),
          {
            label: 'Clientes ativos',
            value: general.kpis.activeClients.value,
            delta: general.kpis.activeClients.delta,
            format: 'integer',
          },
        ]),
        {
          type: 'dimensions',
          dimensions: general.dimensions,
          targetBand: general.targetBand,
          thresholds: general.thresholds,
        },
        { type: 'timeline', timeline: general.timeline, thresholds: general.thresholds },
      ];
    }
    case 'portfolio':
      return [
        metricsWidget('Resumo da carteira', portfolioMetrics(general)),
        { type: 'distribution', distribution: general.distribution },
        { type: 'timeline', timeline: general.timeline, thresholds: general.thresholds },
      ];
  }
}

function titleFor(preset: AssistantCanvasPreset): string {
  const titles: Record<AssistantCanvasPreset, string> = {
    risk: 'Radar de risco e ação',
    revenue: 'Receita sob atenção',
    forecast: 'Sinais do próximo período',
    dimensions: 'Diagnóstico por dimensão',
    portfolio: 'Pulso da carteira',
  };
  return titles[preset];
}

function summaryFor(
  preset: AssistantCanvasPreset,
  risk: RiskDashboardData,
  general: GeneralDashboardData,
): string {
  switch (preset) {
    case 'risk':
      return `${integer.format(risk.kpis.criticalClients.value)} críticos e ${integer.format(risk.kpis.riskClients.value)} em risco; ${compactCurrency.format(risk.kpis.mrrAtRisk.value)} de MRR exigem atenção.`;
    case 'revenue':
      return `${compactCurrency.format(general.kpis.mrr.value)} de MRR recorrente, dos quais ${compactCurrency.format(risk.kpis.mrrAtRisk.value)} estão em contas com saúde em risco ou crítica.`;
    case 'forecast':
      return `${integer.format(risk.forecast.crossingCount)} cliente(s) devem cruzar para uma classe pior no próximo ${risk.forecast.periodLabel}.`;
    case 'dimensions': {
      const worst = general.dimensions.find((dimension) => dimension.health !== null);
      return worst === undefined
        ? 'Ainda não há dados suficientes para comparar as dimensões da carteira.'
        : `${worst.label} é a dimensão mais fraca, com saúde média ${integer.format(worst.health ?? 0)}/100 entre ${integer.format(worst.clientCount)} clientes medidos.`;
    }
    case 'portfolio':
      return `${integer.format(general.kpis.activeClients.value)} clientes ativos geram ${compactCurrency.format(general.kpis.mrr.value)} de MRR recorrente.`;
  }
}

export function buildAssistantCanvas(
  preset: AssistantCanvasPreset,
  risk: RiskDashboardData,
  general: GeneralDashboardData,
): AssistantCanvas {
  return {
    preset,
    title: titleFor(preset),
    summary: summaryFor(preset, risk, general),
    generatedAt: risk.generatedAt || general.generatedAt,
    widgets: widgetsFor(preset, risk, general),
  };
}

/** Fallback determinístico para clientes antigos/testes que ainda devolvem texto simples. */
export function inferCanvasPreset(question: string): AssistantCanvasPreset {
  const normalized = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/mrr|receita|fatur|finance|valor|contrato/.test(normalized)) return 'revenue';
  if (/dimens|sla|uso|nps|atendimento|adocao|satisfacao/.test(normalized)) return 'dimensions';
  if (/proxim|previs|projec|forecast|tendenc|cancelar/.test(normalized)) return 'forecast';
  if (/quem|prior|falar|acao|risco|critic|urgente/.test(normalized)) return 'risk';
  return 'portfolio';
}
