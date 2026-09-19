/**
 * DADOS DE EXEMPLO (MOCK) do dashboard — Etapa 8.
 *
 * Nada aqui vem do banco. São 24 clientes fictícios com 6 períodos de histórico, desenhados para
 * o gráfico de forecast priorizado ter todos os casos (DATAVIZ.md §5): quem cruza para Risco ou
 * Crítico no próximo período, quem já está em Crítico e continua caindo, quem melhora, quem não
 * tem histórico suficiente e quem está saudável. Os dados reais chegam pela planilha (Etapa 7) e
 * pelo motor de scoring (Etapa 4); então `features/dashboard/api.ts` troca este arquivo por
 * `GET /dashboard/risk` e `GET /dashboard/general` e ele some.
 *
 * A projeção aqui é a mesma heurística de DATAVIZ.md §5.2 (regressão linear nos últimos N
 * períodos), só para o mock ser coerente. A implementação oficial vive em
 * `packages/engine/src/scoring/forecast.ts` (Etapa 4).
 */
import {
  classifyHealth,
  classifyPriority,
  clampScore,
  crossesDownTo,
  DEFAULT_PRIORITY_WEIGHTS,
  DEFAULT_TREND_WINDOW_PERIODS,
  riskFromHealth,
  type ClassDistributionItem,
  type DashboardFilterOptions,
  type DashboardFilters,
  type DimensionHealth,
  type ForecastRow,
  type GeneralDashboardData,
  type HealthClass,
  type HealthThresholds,
  type HealthTimePoint,
  type HealthTrend,
  type KpiValue,
  type ProjectionConfidence,
  type RankingRow,
  type RiskDashboardData,
} from '@inovaapss/shared';

export const MOCK_CURRENCY = 'BRL';
export const MOCK_THRESHOLDS: HealthThresholds = { attention: 80, risk: 60, critical: 40 };
export const MOCK_TREND_WINDOW = DEFAULT_TREND_WINDOW_PERIODS;
export const MOCK_PERIOD_LABEL = 'mês';

/** Os 6 períodos do histórico, do mais antigo ao mais recente. */
export const MOCK_PERIODS: readonly { periodEnd: string; label: string }[] = [
  { periodEnd: '2026-04-30', label: 'abr/26' },
  { periodEnd: '2026-05-31', label: 'mai/26' },
  { periodEnd: '2026-06-30', label: 'jun/26' },
  { periodEnd: '2026-07-31', label: 'jul/26' },
  { periodEnd: '2026-08-31', label: 'ago/26' },
  { periodEnd: '2026-09-30', label: 'set/26' },
];

/** Dimensões da aba "Geral" (DATAVIZ.md §4.2), na ordem das colunas de `dimensions` abaixo. */
export const MOCK_DIMENSIONS: readonly { key: string; label: string }[] = [
  { key: 'support', label: 'Atendimento' },
  { key: 'sla', label: 'SLA' },
  { key: 'usage', label: 'Uso' },
  { key: 'nps', label: 'NPS' },
  { key: 'financial', label: 'Financeiro' },
  { key: 'meetings', label: 'Reuniões' },
];

export type MockClientStatus = 'Ativo' | 'Cancelado';

/** Um cliente fictício com o histórico de overall_health (alinhado à direita: o último é set/26). */
export interface MockClient {
  id: string;
  name: string;
  plan: string;
  segment: string;
  size: string;
  status: MockClientStatus;
  /** Índice em MOCK_PERIODS em que o cliente cancelou (só para status Cancelado). */
  cancelledAtPeriod?: number;
  mrr: number;
  /** commercial_impact_score (§28), 0–100. */
  commercialImpact: number;
  /** overall_health por período, do mais antigo ao mais recente; pode ter menos de 6 pontos. */
  history: number[];
  /** analysis_confidence do último snapshot (§25). */
  confidence: number;
  /** Saúde por dimensão (mesma ordem de MOCK_DIMENSIONS); `null` = sem dado (N/A). */
  dimensions: (number | null)[];
  /** human_explanation dos drivers, do maior para o menor impacto (§29). */
  evidences: string[];
  /** Playbook do driver principal (§30). */
  suggestedAction: string;
}

export const MOCK_CLIENTS: readonly MockClient[] = [
  {
    id: 'mock-alfa',
    name: 'Alfa Tecnologia Ltda',
    plan: 'Enterprise',
    segment: 'Saúde',
    size: 'Grande',
    status: 'Ativo',
    mrr: 12_000,
    commercialImpact: 92,
    history: [58, 52, 47, 41, 36, 31],
    confidence: 88,
    dimensions: [18, 34, 41, 30, 62, 50],
    evidences: [
      'Chamados críticos +180 % em 3 meses',
      'Cumprimento de SLA caiu 21 p.p.',
      'Uso 24 % abaixo do baseline',
    ],
    suggestedAction: 'Abrir sala de crise com o time técnico e revisar os chamados críticos',
  },
  {
    id: 'mock-beta',
    name: 'Beta Logística S.A.',
    plan: 'Business',
    segment: 'Logística',
    size: 'Médio',
    status: 'Ativo',
    mrr: 8_500,
    commercialImpact: 70,
    history: [79, 77, 74, 70, 66, 61],
    confidence: 91,
    dimensions: [64, 38, 70, 60, 85, 75],
    evidences: ['SLA caiu 24 p.p.', 'Tempo de resolução 1,6× acima da meta operacional'],
    suggestedAction: 'Revisar as causas de estouro de SLA com o gestor da conta',
  },
  {
    id: 'mock-gama',
    name: 'Gama Educacional ME',
    plan: 'Essencial',
    segment: 'Educação',
    size: 'Pequeno',
    status: 'Ativo',
    mrr: 3_200,
    commercialImpact: 40,
    history: [64, 60, 55, 51, 46, 42],
    confidence: 76,
    dimensions: [30, 48, 44, 40, 70, null],
    evidences: ['Taxa de reabertura dobrou', 'Chamados abertos 1,8× acima do baseline'],
    suggestedAction: 'Análise de causa raiz dos chamados reabertos',
  },
  {
    id: 'mock-delta',
    name: 'Delta Varejo Corp',
    plan: 'Enterprise',
    segment: 'Varejo',
    size: 'Grande',
    status: 'Ativo',
    mrr: 20_000,
    commercialImpact: 95,
    history: [70, 62, 58, 60, 63, 66],
    confidence: 83,
    dimensions: [68, 72, 60, 70, 90, 33],
    evidences: ['2 reuniões previstas não ocorreram', 'Uso recuperou 8 % no último mês'],
    suggestedAction: 'Reagendar o acompanhamento mensal com o patrocinador',
  },
  {
    id: 'mock-epsilon',
    name: 'Épsilon Serviços',
    plan: 'Business',
    segment: 'Serviços',
    size: 'Médio',
    status: 'Ativo',
    mrr: 6_100,
    commercialImpact: 60,
    history: [94, 93, 92, 95, 84, 71],
    confidence: 79,
    dimensions: [78, 80, 42, 65, 88, 100],
    evidences: ['Uso caiu 19 % em relação ao baseline', 'NPS caiu de 9 para 6'],
    suggestedAction: 'Revisar a adoção da plataforma com o time do cliente',
  },
  {
    id: 'mock-omega',
    name: 'Ômega Consultoria',
    plan: 'Essencial',
    segment: 'Serviços',
    size: 'Pequeno',
    status: 'Ativo',
    mrr: 1_100,
    commercialImpact: 15,
    history: [88],
    confidence: 40,
    dimensions: [90, null, 85, null, 95, null],
    evidences: ['Primeiro período com dados — sem tendência ainda'],
    suggestedAction: 'Completar o cadastro de métricas para elevar a confiança',
  },
  {
    id: 'mock-nordeste',
    name: 'Nordeste Distribuidora',
    plan: 'Enterprise',
    segment: 'Varejo',
    size: 'Grande',
    status: 'Ativo',
    mrr: 15_800,
    commercialImpact: 90,
    history: [40, 33, 28, 24, 19, 14],
    confidence: 93,
    dimensions: [22, 30, 15, 10, 8, 40],
    evidences: [
      'Atraso de pagamento de 47 dias, 3 meses seguidos',
      'Uso 41 % abaixo do baseline',
      '2 reclamações formais no mês',
    ],
    suggestedAction: 'Contato imediato da diretoria e plano de retenção',
  },
  {
    id: 'mock-horizonte',
    name: 'Horizonte Saúde',
    plan: 'Business',
    segment: 'Saúde',
    size: 'Médio',
    status: 'Ativo',
    mrr: 7_400,
    commercialImpact: 65,
    history: [82, 81, 83, 80, 81, 82],
    confidence: 90,
    dimensions: [84, 80, 78, 90, 92, 75],
    evidences: ['Sem desvio relevante nos últimos 3 meses'],
    suggestedAction: 'Manter o acompanhamento de rotina',
  },
  {
    id: 'mock-vertice',
    name: 'Vértice Financeira',
    plan: 'Enterprise',
    segment: 'Financeiro',
    size: 'Grande',
    status: 'Ativo',
    mrr: 18_500,
    commercialImpact: 88,
    history: [86, 84, 80, 74, 68, 62],
    confidence: 85,
    dimensions: [50, 66, 72, 55, 95, 60],
    evidences: ['Taxa de reabertura dobrou', 'Chamados críticos +60 % em 2 meses'],
    suggestedAction: 'Análise de causa raiz dos chamados reabertos',
  },
  {
    id: 'mock-litoral',
    name: 'Litoral Transportes',
    plan: 'Essencial',
    segment: 'Logística',
    size: 'Pequeno',
    status: 'Ativo',
    mrr: 2_400,
    commercialImpact: 30,
    history: [45, 43, 42, 42, 41, 41],
    confidence: 72,
    dimensions: [44, 52, 39, 30, 60, null],
    evidences: ['3 reclamações formais em 2 meses', 'Uso 15 % abaixo do baseline'],
    suggestedAction: 'Contato de relacionamento para tratar as reclamações',
  },
  {
    id: 'mock-serra',
    name: 'Serra Indústria',
    plan: 'Business',
    segment: 'Indústria',
    size: 'Médio',
    status: 'Ativo',
    mrr: 9_200,
    commercialImpact: 72,
    history: [75, 73, 72, 70, 69, 68],
    confidence: 80,
    dimensions: [70, 74, 58, 70, 80, 66],
    evidences: ['Uso 9 % abaixo do baseline'],
    suggestedAction: 'Revisar a adoção da plataforma com o time do cliente',
  },
  {
    id: 'mock-planalto',
    name: 'Planalto Engenharia',
    plan: 'Business',
    segment: 'Indústria',
    size: 'Grande',
    status: 'Ativo',
    mrr: 11_000,
    commercialImpact: 80,
    history: [66, 70],
    confidence: 55,
    dimensions: [72, 68, null, null, 85, 60],
    evidences: ['Segundo período com dados — tendência ainda pouco confiável'],
    suggestedAction: 'Completar o cadastro de métricas para elevar a confiança',
  },
  {
    id: 'mock-aurora',
    name: 'Aurora Cosméticos',
    plan: 'Essencial',
    segment: 'Varejo',
    size: 'Pequeno',
    status: 'Ativo',
    mrr: 1_900,
    commercialImpact: 20,
    history: [92, 91, 93, 92, 94, 93],
    confidence: 95,
    dimensions: [95, 92, 90, 100, 96, 90],
    evidences: ['Sem desvio relevante nos últimos 3 meses'],
    suggestedAction: 'Manter o acompanhamento de rotina',
  },
  {
    id: 'mock-cerrado',
    name: 'Cerrado Agro',
    plan: 'Enterprise',
    segment: 'Indústria',
    size: 'Grande',
    status: 'Ativo',
    mrr: 24_000,
    commercialImpact: 97,
    history: [78, 76, 72, 69, 64, 60],
    confidence: 89,
    dimensions: [62, 45, 66, 60, 90, 50],
    evidences: ['Cumprimento de SLA caiu 15 p.p.', '1 reunião prevista não ocorreu'],
    suggestedAction: 'Revisar as causas de estouro de SLA com o gestor da conta',
  },
  {
    id: 'mock-mare',
    name: 'Maré Alta Turismo',
    plan: 'Essencial',
    segment: 'Serviços',
    size: 'Pequeno',
    status: 'Cancelado',
    cancelledAtPeriod: 5,
    mrr: 1_500,
    commercialImpact: 10,
    history: [45, 38, 30, 25, 20, 16],
    confidence: 60,
    dimensions: [20, 25, 10, 0, 30, null],
    evidences: ['Cliente cancelou em set/26'],
    suggestedAction: 'Registrar o motivo do cancelamento para a calibração',
  },
  {
    id: 'mock-pampa',
    name: 'Pampa Móveis',
    plan: 'Business',
    segment: 'Varejo',
    size: 'Médio',
    status: 'Cancelado',
    cancelledAtPeriod: 3,
    mrr: 4_300,
    commercialImpact: 35,
    history: [60, 52, 47, 40],
    confidence: 70,
    dimensions: [40, 42, 30, 20, 50, 40],
    evidences: ['Cliente cancelou em jul/26'],
    suggestedAction: 'Registrar o motivo do cancelamento para a calibração',
  },
  {
    id: 'mock-sertao',
    name: 'Sertão Energia',
    plan: 'Enterprise',
    segment: 'Indústria',
    size: 'Grande',
    status: 'Ativo',
    mrr: 16_000,
    commercialImpact: 90,
    history: [84, 85, 83, 86, 84, 85],
    confidence: 92,
    dimensions: [88, 86, 80, 90, 95, 80],
    evidences: ['Sem desvio relevante nos últimos 3 meses'],
    suggestedAction: 'Manter o acompanhamento de rotina',
  },
  {
    id: 'mock-ipe',
    name: 'Ipê Educação',
    plan: 'Business',
    segment: 'Educação',
    size: 'Médio',
    status: 'Ativo',
    mrr: 5_600,
    commercialImpact: 55,
    history: [70, 68, 67, 65, 64, 63],
    confidence: 78,
    dimensions: [66, 70, 55, 60, 75, 50],
    evidences: ['Uso 11 % abaixo do baseline', '1 reunião prevista não ocorreu'],
    suggestedAction: 'Revisar a adoção da plataforma com o time do cliente',
  },
  {
    id: 'mock-mangue',
    name: 'Mangue Pescados',
    plan: 'Essencial',
    segment: 'Indústria',
    size: 'Pequeno',
    status: 'Ativo',
    mrr: 2_100,
    commercialImpact: 25,
    history: [50, 49, 51, 48, 50, 49],
    confidence: 66,
    dimensions: [40, 55, 52, null, 60, null],
    evidences: ['Chamados abertos 2× acima do baseline há 4 meses'],
    suggestedAction: 'Revisar a fila de chamados abertos com o suporte',
  },
  {
    id: 'mock-cristal',
    name: 'Cristal Clínicas',
    plan: 'Business',
    segment: 'Saúde',
    size: 'Médio',
    status: 'Ativo',
    mrr: 6_800,
    commercialImpact: 62,
    history: [89, 86, 84, 81, 78, 76],
    confidence: 87,
    dimensions: [80, 78, 70, 75, 85, 66],
    evidences: ['NPS caiu de 9 para 7', 'Uso 6 % abaixo do baseline'],
    suggestedAction: 'Contato de relacionamento para entender a queda do NPS',
  },
  {
    id: 'mock-rotasul',
    name: 'Rota Sul Fretes',
    plan: 'Essencial',
    segment: 'Logística',
    size: 'Pequeno',
    status: 'Ativo',
    mrr: 2_700,
    commercialImpact: 28,
    history: [62, 64, 66, 68, 70, 72],
    confidence: 74,
    dimensions: [70, 75, 74, 70, 80, null],
    evidences: ['SLA subiu 12 p.p. em 3 meses'],
    suggestedAction: 'Manter o acompanhamento de rotina',
  },
  {
    id: 'mock-bastiao',
    name: 'Bastião Segurança',
    plan: 'Business',
    segment: 'Serviços',
    size: 'Médio',
    status: 'Ativo',
    mrr: 5_200,
    commercialImpact: 58,
    history: [40, 42, 39, 41, 40, 38],
    confidence: 81,
    dimensions: [36, 45, 48, 30, 55, 0],
    evidences: ['Reunião mensal não realizada 2 vezes seguidas', 'NPS 4 sem resposta há 2 meses'],
    suggestedAction: 'Reagendar o acompanhamento mensal com o patrocinador',
  },
  {
    id: 'mock-quilha',
    name: 'Quilha Náutica',
    plan: 'Essencial',
    segment: 'Varejo',
    size: 'Pequeno',
    status: 'Ativo',
    mrr: 1_300,
    commercialImpact: 12,
    history: [77],
    confidence: 35,
    dimensions: [null, 80, null, null, 75, null],
    evidences: ['Primeiro período com dados — sem tendência ainda'],
    suggestedAction: 'Completar o cadastro de métricas para elevar a confiança',
  },
  {
    id: 'mock-valeverde',
    name: 'Vale Verde Fintech',
    plan: 'Enterprise',
    segment: 'Financeiro',
    size: 'Grande',
    status: 'Ativo',
    mrr: 13_500,
    commercialImpact: 86,
    history: [72, 70, 71, 69, 70, 68],
    confidence: 90,
    dimensions: [66, 70, 64, 70, 92, 60],
    evidences: ['Chamados críticos +25 % no mês'],
    suggestedAction: 'Revisar os chamados críticos com o time técnico',
  },
];

// ---------- Projeção por tendência (heurística de DATAVIZ.md §5.2, versão do mock) ----------

interface Projection {
  healthProjected: number | null;
  slopePerPeriod: number | null;
  periodsAvailable: number;
  projectionConfidence: ProjectionConfidence;
}

/** Inclinação da regressão linear simples (pontos por período). Com 2 pontos é o delta. */
function linearSlope(values: number[]): number {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return denominator === 0 ? 0 : numerator / denominator;
}

function projectHealth(history: number[], confidence: number, window: number): Projection {
  const points = history.slice(-window);
  const periodsAvailable = points.length;
  const current = points[points.length - 1];
  if (periodsAvailable < 2 || current === undefined) {
    return {
      healthProjected: null,
      slopePerPeriod: null,
      periodsAvailable,
      projectionConfidence: 'low',
    };
  }
  const slope = linearSlope(points);
  let projectionConfidence: ProjectionConfidence;
  if (periodsAvailable < window) projectionConfidence = 'low';
  else if (confidence >= 70) projectionConfidence = 'high';
  else projectionConfidence = 'medium';
  return {
    healthProjected: Math.round(clampScore(current + slope)),
    slopePerPeriod: Math.round(slope * 10) / 10,
    periodsAvailable,
    projectionConfidence,
  };
}

function trendFromSlope(slope: number | null): HealthTrend {
  if (slope === null) return 'unknown';
  if (slope > 1) return 'up';
  if (slope < -1) return 'down';
  return 'stable';
}

function lastHealth(client: MockClient): number {
  return client.history[client.history.length - 1] ?? 0;
}

function previousHealth(client: MockClient): number | null {
  return client.history.length >= 2 ? (client.history[client.history.length - 2] ?? null) : null;
}

function classifyWith(health: number): HealthClass {
  return classifyHealth(health, [
    { class: 'NORMAL', min: MOCK_THRESHOLDS.attention },
    { class: 'ATTENTION', min: MOCK_THRESHOLDS.risk },
    { class: 'RISK', min: MOCK_THRESHOLDS.critical },
    { class: 'CRITICAL', min: 0 },
  ]);
}

/** Monta a linha completa do ranking (§39) de um cliente — a mesma que alimenta o forecast. */
export function buildRankingRow(client: MockClient): Omit<RankingRow, 'position'> {
  const healthCurrent = lastHealth(client);
  const currentClass = classifyWith(healthCurrent);
  const projection = projectHealth(client.history, client.confidence, MOCK_TREND_WINDOW);
  const projectedClass =
    projection.healthProjected === null ? null : classifyWith(projection.healthProjected);
  const riskScore = riskFromHealth(healthCurrent);
  const priorityScore = Math.round(
    riskScore * DEFAULT_PRIORITY_WEIGHTS.risk +
      client.commercialImpact * DEFAULT_PRIORITY_WEIGHTS.impact,
  );
  const lastPeriod = MOCK_PERIODS[MOCK_PERIODS.length - 1];

  return {
    clientId: client.id,
    clientName: client.name,
    mrr: client.mrr,
    currency: MOCK_CURRENCY,
    priorityScore,
    priorityClass: classifyPriority(priorityScore),
    healthCurrent,
    currentClass,
    healthProjected: projection.healthProjected,
    projectedClass,
    slopePerPeriod: projection.slopePerPeriod,
    trendWindow: MOCK_TREND_WINDOW,
    periodsAvailable: projection.periodsAvailable,
    confidence: client.confidence,
    projectionConfidence: projection.projectionConfidence,
    crossesDown: crossesDownTo(currentClass, projectedClass),
    topEvidence: client.evidences[0] ?? 'Sem evidência registrada',
    periodEnd: lastPeriod?.periodEnd ?? '',
    riskScore,
    trend: trendFromSlope(projection.slopePerPeriod),
    suggestedAction: client.suggestedAction,
    evidences: client.evidences,
    plan: client.plan,
    segment: client.segment,
    size: client.size,
    status: client.status,
  };
}

// ---------- Filtros (§61) e busca, aplicados como a API faria ----------

export interface MockQuery {
  filters?: DashboardFilters;
  /** Busca por nome do cliente (sem acento e sem caixa). */
  search?: string;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Aplica filtros e busca a uma linha. `defaultStatus` vale quando o filtro de status está vazio:
 * a aba "Em risco" usa 'Ativo' (cancelado não é "com quem falar"); a aba "Geral" não usa
 * (é a foto da carteira inteira, com cancelados).
 */
function matchesQuery(
  row: Omit<RankingRow, 'position'>,
  query: MockQuery,
  defaultStatus?: MockClientStatus,
): boolean {
  const filters = query.filters ?? {};
  if (filters.healthClass && row.currentClass !== filters.healthClass) return false;
  if (filters.priorityClass && row.priorityClass !== filters.priorityClass) return false;
  if (filters.plan && row.plan !== filters.plan) return false;
  if (filters.segment && row.segment !== filters.segment) return false;
  if (filters.size && row.size !== filters.size) return false;
  const status = filters.status || defaultStatus;
  if (status && row.status !== status) return false;
  if (query.search && !normalize(row.clientName).includes(normalize(query.search))) return false;
  return true;
}

/** Opções dos filtros de texto livre, tiradas dos próprios dados. */
export function mockFilterOptions(): DashboardFilterOptions {
  const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
  return {
    plans: unique(MOCK_CLIENTS.map((client) => client.plan)),
    segments: unique(MOCK_CLIENTS.map((client) => client.segment)),
    sizes: unique(MOCK_CLIENTS.map((client) => client.size)),
    statuses: unique(MOCK_CLIENTS.map((client) => client.status)),
  };
}

function kpi(value: number, previous: number | null): KpiValue {
  return { value, delta: previous === null ? null : value - previous };
}

const AT_RISK: readonly HealthClass[] = ['RISK', 'CRITICAL'];

// ---------- Aba "Em risco" ----------

/** O que `GET /dashboard/risk` devolverá, calculado sobre o mock. */
export function buildMockRiskDashboard(query: MockQuery = {}): RiskDashboardData {
  const allRows = MOCK_CLIENTS.map(buildRankingRow);
  const ranking: RankingRow[] = allRows
    .filter((row) => matchesQuery(row, query, 'Ativo'))
    .sort((a, b) => b.priorityScore - a.priorityScore || a.clientName.localeCompare(b.clientName))
    .map((row, index) => ({ ...row, position: index + 1 }));

  // KPIs: sobre os clientes filtrados. A variação compara com o período anterior do histórico.
  const clientsById = new Map(MOCK_CLIENTS.map((client) => [client.id, client]));
  const rankedClients = ranking.map((row) => clientsById.get(row.clientId)).filter(isDefined);
  const withPrevious = rankedClients
    .map((client) => ({ client, previous: previousHealth(client) }))
    .filter((item): item is { client: MockClient; previous: number } => item.previous !== null);

  const countNow = (healthClass: HealthClass) =>
    ranking.filter((row) => row.currentClass === healthClass).length;
  const countBefore = (healthClass: HealthClass) =>
    withPrevious.filter((item) => classifyWith(item.previous) === healthClass).length;
  const mrrAtRiskNow = ranking
    .filter((row) => AT_RISK.includes(row.currentClass))
    .reduce((sum, row) => sum + row.mrr, 0);
  const mrrAtRiskBefore = withPrevious
    .filter((item) => AT_RISK.includes(classifyWith(item.previous)))
    .reduce((sum, item) => sum + item.client.mrr, 0);
  const activeBefore = rankedClients.filter(
    (client) => client.status === 'Ativo' || client.cancelledAtPeriod === MOCK_PERIODS.length - 1,
  ).length;

  const forecastRows: ForecastRow[] = ranking.map(stripRankingRow);

  return {
    kpis: {
      activeClients: kpi(ranking.filter((row) => row.status === 'Ativo').length, activeBefore),
      criticalClients: kpi(countNow('CRITICAL'), countBefore('CRITICAL')),
      riskClients: kpi(countNow('RISK'), countBefore('RISK')),
      mrrAtRisk: kpi(mrrAtRiskNow, mrrAtRiskBefore),
      currency: MOCK_CURRENCY,
    },
    forecast: {
      rows: forecastRows,
      thresholds: MOCK_THRESHOLDS,
      trendWindow: MOCK_TREND_WINDOW,
      periodLabel: MOCK_PERIOD_LABEL,
      crossingCount: forecastRows.filter((row) => row.crossesDown).length,
    },
    ranking,
    classCounts: {
      NORMAL: countNow('NORMAL'),
      ATTENTION: countNow('ATTENTION'),
      RISK: countNow('RISK'),
      CRITICAL: countNow('CRITICAL'),
    },
    generatedAt: '2026-09-19T08:00:00.000Z',
  };
}

function stripRankingRow(row: RankingRow): ForecastRow {
  const {
    position: _position,
    riskScore: _riskScore,
    trend: _trend,
    suggestedAction: _suggestedAction,
    evidences: _evidences,
    plan: _plan,
    segment: _segment,
    size: _size,
    status: _status,
    ...forecastRow
  } = row;
  return forecastRow;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

// ---------- Aba "Geral" ----------

export interface MockGeneralQuery extends MockQuery {
  /** Cliente destacado na evolução temporal (DATAVIZ.md §4.2). */
  selectedClientId?: string | undefined;
}

/** O que `GET /dashboard/general` devolverá, calculado sobre o mock. */
export function buildMockGeneralDashboard(query: MockGeneralQuery = {}): GeneralDashboardData {
  const rows = MOCK_CLIENTS.map(buildRankingRow);
  const selected = rows.filter((row) => matchesQuery(row, query));
  const clientsById = new Map(MOCK_CLIENTS.map((client) => [client.id, client]));
  const selectedClients = selected.map((row) => clientsById.get(row.clientId)).filter(isDefined);

  const lastIndex = MOCK_PERIODS.length - 1;
  const active = selectedClients.filter((client) => client.status === 'Ativo');
  const cancelled = selectedClients.filter((client) => client.status === 'Cancelado');
  const cancelledThisPeriod = cancelled.filter((client) => client.cancelledAtPeriod === lastIndex);
  const mrrNow = active.reduce((sum, client) => sum + client.mrr, 0);
  const mrrLost = cancelledThisPeriod.reduce((sum, client) => sum + client.mrr, 0);

  const activeRows = selected.filter((row) => row.status === 'Ativo');
  const distribution: ClassDistributionItem[] = (
    ['CRITICAL', 'RISK', 'ATTENTION', 'NORMAL'] as const
  ).map((healthClass) => {
    const inClass = activeRows.filter((row) => row.currentClass === healthClass);
    return {
      healthClass,
      count: inClass.length,
      share: activeRows.length === 0 ? 0 : inClass.length / activeRows.length,
      mrr: inClass.reduce((sum, row) => sum + row.mrr, 0),
    };
  });

  const dimensions: DimensionHealth[] = MOCK_DIMENSIONS.map((dimension, index) => {
    const values = active
      .map((client) => client.dimensions[index] ?? null)
      .filter((value): value is number => value !== null);
    return {
      key: dimension.key,
      label: dimension.label,
      health:
        values.length === 0
          ? null
          : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      clientCount: values.length,
    };
  }).sort(
    (a, b) => (a.health ?? Number.POSITIVE_INFINITY) - (b.health ?? Number.POSITIVE_INFINITY),
  );

  const portfolio: HealthTimePoint[] = MOCK_PERIODS.map((period, index) => {
    const values = selectedClients
      .map((client) => healthAtPeriod(client, index))
      .filter((value): value is number => value !== null);
    return {
      periodEnd: period.periodEnd,
      label: period.label,
      health:
        values.length === 0
          ? null
          : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    };
  });

  const selectedClient = query.selectedClientId
    ? selectedClients.find((client) => client.id === query.selectedClientId)
    : undefined;

  return {
    kpis: {
      mrr: kpi(mrrNow, mrrNow + mrrLost),
      activeClients: kpi(active.length, active.length + cancelledThisPeriod.length),
      cancelledClients: kpi(cancelled.length, cancelled.length - cancelledThisPeriod.length),
      currency: MOCK_CURRENCY,
    },
    distribution,
    targetBand: { min: MOCK_THRESHOLDS.attention, max: 100 },
    dimensions,
    timeline: {
      portfolio,
      client: selectedClient
        ? {
            clientId: selectedClient.id,
            clientName: selectedClient.name,
            points: MOCK_PERIODS.map((period, index) => ({
              periodEnd: period.periodEnd,
              label: period.label,
              health: healthAtPeriod(selectedClient, index),
            })),
          }
        : null,
      clientOptions: selectedClients
        .map((client) => ({ clientId: client.id, clientName: client.name }))
        .sort((a, b) => a.clientName.localeCompare(b.clientName)),
    },
    thresholds: MOCK_THRESHOLDS,
    generatedAt: '2026-09-19T08:00:00.000Z',
  };
}

/** Health do cliente no período `index` (histórico alinhado à direita); `null` se não existia. */
function healthAtPeriod(client: MockClient, index: number): number | null {
  const offset = MOCK_PERIODS.length - client.history.length;
  if (index < offset) return null;
  if (client.cancelledAtPeriod !== undefined && index > client.cancelledAtPeriod) return null;
  return client.history[index - offset] ?? null;
}
