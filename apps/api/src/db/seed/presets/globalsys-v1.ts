/**
 * Preset GlobalSys v1 — as 10 métricas iniciais, como DADOS.
 *
 * Fonte: docs/DEFINICOES_METRICAS.md (definições consolidadas do time) e SPEC §12–§22 e §71.
 * Nada aqui é regra de código: pesos, faixas, limites e gatilhos são configuração e podem ser
 * alterados pelo configurador de métricas ou substituídos por completo por outra empresa.
 *
 * Os dados de origem são as colunas da planilha (data/README.md):
 *   chamados_abertos, chamados_criticos, chamados_reabertos, chamados_dentro_sla,
 *   pct_sla_cumprido, tempo_medio_resolucao_h, reclamacoes_formais, uso_plataforma_pct,
 *   dias_atraso_pagamento, reunioes_previstas, reunioes_realizadas, nota_nps.
 */
import {
  GLOBALSYS_V1_PRESET,
  type GlobalSysV1Key,
  type MetricDirection,
  type MetricPeriodicity,
  type MetricSource,
  type MetricType,
  type NormalizationStrategy,
} from '@inovaapss/shared';

/** Uma métrica do preset, pronta para virar linha em metric_definitions + metric_model_items. */
export interface PresetMetric {
  readonly slug: GlobalSysV1Key;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly metricType: MetricType;
  readonly unit: string;
  readonly direction: MetricDirection;
  readonly sourceType: MetricSource;
  readonly periodicity: MetricPeriodicity;
  /** Peso da métrica no modelo (0–1). Os 10 somam 1,0000 (§71). */
  readonly weight: number;
  readonly sortOrder: number;
  readonly normalizationStrategy: NormalizationStrategy;
  /** Configuração da estratégia, no formato que o motor espera. */
  readonly normalizationConfig: Record<string, unknown>;
  /** Gatilhos críticos (§22 do documento): separados do peso, geram alerta e piso de prioridade. */
  readonly triggers?: ReadonlyArray<Record<string, unknown>>;
  /** Playbook (§24 do documento): ação sugerida quando a métrica puxa a saúde para baixo. */
  readonly playbook: string;
}

/** Composição padrão de cada métrica (§4 do documento): atual 45 %, tendência 35 %, persistência 20 %. */
export const PRESET_COMPONENT_WEIGHTS = { current: 0.45, trend: 0.35, persistence: 0.2 } as const;

const weightOf = (key: GlobalSysV1Key): number => {
  const item = GLOBALSYS_V1_PRESET.find((entry) => entry.key === key);
  if (!item) throw new Error(`Chave fora do preset GlobalSys v1: ${key}`);
  return item.weight;
};
const orderOf = (key: GlobalSysV1Key): number => {
  const item = GLOBALSYS_V1_PRESET.find((entry) => entry.key === key);
  if (!item) throw new Error(`Chave fora do preset GlobalSys v1: ${key}`);
  return item.order;
};

export const GLOBALSYS_V1_METRICS: readonly PresetMetric[] = [
  // 1 — 18 % — §7 do documento
  {
    slug: 'critical_tickets',
    name: 'Chamados críticos',
    description:
      'Concentração, crescimento e recorrência de chamados de maior severidade. Avalia a quantidade do mês contra o padrão histórico do próprio cliente e também faixas absolutas, ficando com o pior dos dois. Origem: chamados_criticos (e chamados_abertos para a taxa).',
    category: 'Atendimento',
    metricType: 'QUANTITY',
    unit: 'chamados',
    direction: 'HIGHER_IS_WORSE',
    sourceType: 'XLSX',
    periodicity: 'MONTHLY',
    weight: weightOf('critical_tickets'),
    sortOrder: orderOf('critical_tickets'),
    normalizationStrategy: 'BASELINE_DEVIATION',
    normalizationConfig: {
      strategy: 'BASELINE_DEVIATION',
      window: 6,
      minHistory: 2,
      method: 'auto',
      tolerancePct: 20,
      maxDeviationPct: 150,
      combine: 'worst',
      absolute: {
        strategy: 'THRESHOLD_BANDS',
        bands: [
          { upTo: 0, health: 100 },
          { upTo: 1, health: 85 },
          { upTo: 2, health: 65 },
          { upTo: 4, health: 40 },
          { upTo: 6, health: 20 },
          { upTo: null, health: 0 },
        ],
      },
    },
    triggers: [
      {
        kind: 'STREAK',
        id: 'critical_tickets_recorrentes',
        name: 'Chamados críticos recorrentes',
        operator: 'gte',
        threshold: 3,
        consecutivePeriods: 2,
        severity: 'high',
        priorityFloor: 85,
        message:
          'Três ou mais chamados críticos em {periods} meses seguidos. Abrir sala de crise com o time técnico.',
      },
    ],
    playbook:
      'Abrir sala de crise com o time técnico e revisar os chamados críticos abertos com o cliente.',
  },

  // 2 — 16 % — §8 do documento
  {
    slug: 'resolution_vs_sla',
    name: 'Tempo de resolução × SLA contratado',
    description:
      'Tempo médio de resolução do mês comparado ao SLA contratado do cliente (meta). Quanto mais perto ou acima da meta, pior. A meta padrão aqui é 24 h e é substituída pelo SLA do contrato de cada cliente quando existe. Origem: tempo_medio_resolucao_h e sla_contratado_h.',
    category: 'SLA',
    metricType: 'TIME',
    unit: 'horas',
    direction: 'HIGHER_IS_WORSE',
    sourceType: 'XLSX',
    periodicity: 'MONTHLY',
    weight: weightOf('resolution_vs_sla'),
    sortOrder: orderOf('resolution_vs_sla'),
    normalizationStrategy: 'RATIO_TO_TARGET',
    normalizationConfig: {
      strategy: 'RATIO_TO_TARGET',
      target: 24,
      zeroAtRatio: 2,
    },
    triggers: [
      {
        kind: 'THRESHOLD',
        id: 'resolucao_acima_do_sla',
        name: 'Tempo de resolução comprometendo o SLA',
        field: 'health',
        operator: 'lte',
        threshold: 50,
        severity: 'high',
        priorityFloor: 80,
        message:
          'Tempo médio de resolução consumindo mais do que a meta do SLA contratado. Revisar a fila e as causas de estouro.',
      },
    ],
    playbook:
      'Revisar os chamados fora do prazo e as causas do estouro, junto com o gestor da conta.',
  },

  // 3 — 14 % — §9 do documento
  {
    slug: 'platform_usage',
    name: 'Uso da plataforma',
    description:
      'Engajamento do cliente com o produto. O que importa não é o valor absoluto e sim a queda em relação ao padrão do próprio cliente: 65 % estável é saudável, 93 % caindo para 62 % não é. Origem: uso_plataforma_pct.',
    category: 'Adoção',
    metricType: 'PERCENTAGE',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    sourceType: 'XLSX',
    periodicity: 'MONTHLY',
    weight: weightOf('platform_usage'),
    sortOrder: orderOf('platform_usage'),
    normalizationStrategy: 'BASELINE_DEVIATION',
    normalizationConfig: {
      strategy: 'BASELINE_DEVIATION',
      window: 6,
      minHistory: 2,
      method: 'auto',
      tolerancePct: 5,
      maxDeviationPct: 40,
      combine: 'worst',
      absolute: {
        strategy: 'THRESHOLD_BANDS',
        bands: [
          { upTo: 40, health: 0 },
          { upTo: 55, health: 30 },
          { upTo: 70, health: 60 },
          { upTo: 85, health: 85 },
          { upTo: null, health: 100 },
        ],
      },
    },
    triggers: [
      {
        kind: 'STREAK',
        id: 'uso_baixo_persistente',
        name: 'Uso baixo por vários meses',
        operator: 'lt',
        threshold: 60,
        consecutivePeriods: 3,
        severity: 'medium',
        priorityFloor: 70,
        message: 'Uso abaixo de 60 % em {periods} meses seguidos. Revisar adoção com o cliente.',
      },
    ],
    playbook: 'Validar a queda de utilização e retomar o plano de adoção com o time do cliente.',
  },

  // 4 — 12 % — §10 do documento
  {
    slug: 'sla_compliance',
    name: 'Cumprimento de SLA',
    description:
      'Desempenho agregado do atendimento no mês: percentual de chamados resolvidos dentro do prazo. Diferente da métrica 2, que olha o prazo dos chamados; esta olha o resultado global do cliente. Origem: pct_sla_cumprido (ou chamados_dentro_sla sobre os resolvidos).',
    category: 'SLA',
    metricType: 'PERCENTAGE',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    sourceType: 'XLSX',
    periodicity: 'MONTHLY',
    weight: weightOf('sla_compliance'),
    sortOrder: orderOf('sla_compliance'),
    normalizationStrategy: 'THRESHOLD_BANDS',
    normalizationConfig: {
      strategy: 'THRESHOLD_BANDS',
      bands: [
        { upTo: 70, health: 0 },
        { upTo: 80, health: 35 },
        { upTo: 90, health: 65 },
        { upTo: 95, health: 85 },
        { upTo: null, health: 100 },
      ],
    },
    triggers: [
      {
        kind: 'THRESHOLD',
        id: 'sla_abaixo_de_70',
        name: 'Cumprimento de SLA abaixo de 70 %',
        field: 'value',
        operator: 'lt',
        threshold: 70,
        severity: 'high',
        priorityFloor: 80,
        message:
          'Cumprimento de SLA em {value} %, abaixo do mínimo aceitável. Contato imediato com a operação.',
      },
    ],
    playbook: 'Revisar as causas do estouro de prazo e apresentar plano de recuperação ao cliente.',
  },

  // 5 — 10 % — §11 do documento
  {
    slug: 'reopened_tickets',
    name: 'Chamados reabertos',
    description:
      'Proporção de chamados que voltaram a ser abertos, sinal de solução incompleta. Origem: chamados_reabertos sobre chamados_abertos.',
    category: 'Atendimento',
    metricType: 'PERCENTAGE',
    unit: '%',
    direction: 'HIGHER_IS_WORSE',
    sourceType: 'XLSX',
    periodicity: 'MONTHLY',
    weight: weightOf('reopened_tickets'),
    sortOrder: orderOf('reopened_tickets'),
    normalizationStrategy: 'THRESHOLD_BANDS',
    normalizationConfig: {
      strategy: 'THRESHOLD_BANDS',
      bands: [
        { upTo: 5, health: 100 },
        { upTo: 10, health: 80 },
        { upTo: 20, health: 55 },
        { upTo: 35, health: 25 },
        { upTo: null, health: 0 },
      ],
    },
    playbook: 'Fazer análise de causa raiz dos chamados reincidentes com o time técnico.',
  },

  // 6 — 9 % — §12 do documento
  {
    slug: 'formal_complaints',
    name: 'Reclamações formais',
    description:
      'Reclamações registradas formalmente no mês. Uma já é relevante; meses seguidos com reclamação indicam relação deteriorada. Origem: reclamacoes_formais.',
    category: 'Relacionamento',
    metricType: 'QUANTITY',
    unit: 'reclamações',
    direction: 'HIGHER_IS_WORSE',
    sourceType: 'XLSX',
    periodicity: 'MONTHLY',
    weight: weightOf('formal_complaints'),
    sortOrder: orderOf('formal_complaints'),
    normalizationStrategy: 'THRESHOLD_BANDS',
    normalizationConfig: {
      strategy: 'THRESHOLD_BANDS',
      bands: [
        { upTo: 0, health: 100 },
        { upTo: 1, health: 55 },
        { upTo: 2, health: 25 },
        { upTo: null, health: 0 },
      ],
    },
    triggers: [
      {
        kind: 'STREAK',
        id: 'reclamacoes_seguidas',
        name: 'Reclamações em meses seguidos',
        operator: 'gte',
        threshold: 1,
        consecutivePeriods: 2,
        severity: 'high',
        priorityFloor: 80,
        message: 'Reclamação formal em {periods} meses seguidos. Acionar o time de relacionamento.',
      },
    ],
    playbook: 'Contato de relacionamento para tratar as reclamações e registrar o compromisso.',
  },

  // 7 — 7 % — §13 do documento
  {
    slug: 'open_tickets',
    name: 'Chamados abertos',
    description:
      'Volume de chamados do mês comparado ao padrão histórico do próprio cliente — nunca a um número absoluto universal. Média de 4 por mês saltando para 13 é o sinal, não o valor em si. Origem: chamados_abertos.',
    category: 'Atendimento',
    metricType: 'QUANTITY',
    unit: 'chamados',
    direction: 'HIGHER_IS_WORSE',
    sourceType: 'XLSX',
    periodicity: 'MONTHLY',
    weight: weightOf('open_tickets'),
    sortOrder: orderOf('open_tickets'),
    normalizationStrategy: 'BASELINE_DEVIATION',
    normalizationConfig: {
      strategy: 'BASELINE_DEVIATION',
      window: 6,
      minHistory: 2,
      method: 'auto',
      tolerancePct: 30,
      maxDeviationPct: 200,
    },
    playbook: 'Revisar a fila de chamados abertos com o suporte e identificar o que os concentra.',
  },

  // 8 — 6 % — §14 do documento
  {
    slug: 'payment_delay',
    name: 'Atraso de pagamento',
    description:
      'Dias de atraso no pagamento do mês. Atraso recorrente costuma anteceder o cancelamento. Origem: dias_atraso_pagamento.',
    category: 'Financeiro',
    metricType: 'QUANTITY',
    unit: 'dias',
    direction: 'HIGHER_IS_WORSE',
    sourceType: 'XLSX',
    periodicity: 'MONTHLY',
    weight: weightOf('payment_delay'),
    sortOrder: orderOf('payment_delay'),
    normalizationStrategy: 'THRESHOLD_BANDS',
    normalizationConfig: {
      strategy: 'THRESHOLD_BANDS',
      bands: [
        { upTo: 0, health: 100 },
        { upTo: 5, health: 85 },
        { upTo: 15, health: 55 },
        { upTo: 30, health: 25 },
        { upTo: null, health: 0 },
      ],
    },
    triggers: [
      {
        kind: 'THRESHOLD',
        id: 'atraso_acima_de_30_dias',
        name: 'Atraso de pagamento acima de 30 dias',
        field: 'value',
        operator: 'gt',
        threshold: 30,
        severity: 'high',
        priorityFloor: 75,
        message: 'Pagamento com {value} dias de atraso. Acionar o financeiro e a diretoria.',
      },
    ],
    playbook: 'Contato do financeiro com a diretoria do cliente e negociação de plano de retenção.',
  },

  // 9 — 5 % — §15 do documento
  {
    slug: 'missed_meetings',
    name: 'Reuniões não realizadas',
    description:
      'Percentual de reuniões previstas que não aconteceram. Quando nenhuma reunião foi prevista no mês, o resultado é "não se aplica" — nunca conta como saudável. Origem: reunioes_previstas e reunioes_realizadas.',
    category: 'Relacionamento',
    metricType: 'PERCENTAGE',
    unit: '%',
    direction: 'HIGHER_IS_WORSE',
    sourceType: 'XLSX',
    periodicity: 'MONTHLY',
    weight: weightOf('missed_meetings'),
    sortOrder: orderOf('missed_meetings'),
    normalizationStrategy: 'LINEAR_RANGE',
    normalizationConfig: {
      strategy: 'LINEAR_RANGE',
      min: 0,
      max: 100,
    },
    playbook: 'Reagendar o acompanhamento com prioridade e envolver o patrocinador da conta.',
  },

  // 10 — 3 % — §16 do documento
  {
    slug: 'nps_dissatisfaction',
    name: 'Insatisfação / NPS',
    description:
      'Nota da pesquisa de satisfação (0 a 10), trimestral. Quando o cliente foi convidado e não respondeu, o resultado é "não respondeu" — não vira nota zero nem é tratado como dado faltante comum; a sequência sem resposta é analisada à parte. Origem: nota_nps e respondeu.',
    category: 'Satisfação',
    metricType: 'SCORE',
    unit: 'nota de 0 a 10',
    direction: 'HIGHER_IS_BETTER',
    sourceType: 'XLSX',
    periodicity: 'QUARTERLY',
    weight: weightOf('nps_dissatisfaction'),
    sortOrder: orderOf('nps_dissatisfaction'),
    normalizationStrategy: 'LINEAR_RANGE',
    normalizationConfig: {
      strategy: 'LINEAR_RANGE',
      min: 0,
      max: 10,
    },
    playbook:
      'Contato de relacionamento para entender a queda de satisfação e registrar o retorno.',
  },
];

/** Soma dos pesos do preset — precisa ser 1,0000 para a versão poder ser ativada (§41 da spec). */
export const GLOBALSYS_V1_TOTAL_WEIGHT = Number(
  GLOBALSYS_V1_METRICS.reduce((total, metric) => total + metric.weight, 0).toFixed(4),
);

export const GLOBALSYS_V1_MODEL_NAME = 'GlobalSys v1';
