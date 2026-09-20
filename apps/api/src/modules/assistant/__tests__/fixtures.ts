/** Um relatório pequeno e realista, para os testes do Agente não dependerem de banco. */
import type { GeneralDashboardData, RankingRow, RiskDashboardData } from '@inovaapss/shared';

export function makeRankingRow(overrides: Partial<RankingRow> = {}): RankingRow {
  return {
    clientId: 'c1',
    clientName: 'Alfa Ltda',
    mrr: 12000,
    currency: 'BRL',
    priorityScore: 87.4,
    priorityClass: 'P0',
    healthCurrent: 38.2,
    currentClass: 'CRITICAL',
    healthProjected: 31.5,
    projectedClass: 'CRITICAL',
    slopePerPeriod: -3.4,
    trendWindow: 3,
    periodsAvailable: 6,
    confidence: 82,
    projectionConfidence: 'high',
    crossesDown: false,
    topEvidence: 'Tempo de resolução 3x acima do SLA contratado.',
    periodEnd: '2026-06-30',
    position: 1,
    riskScore: 61.8,
    trend: 'down',
    suggestedAction: 'Agendar call com o patrocinador e revisar o plano de ação de SLA.',
    evidences: [
      'Tempo de resolução 3x acima do SLA contratado.',
      'NPS caiu de 8 para 4 no último trimestre.',
    ],
    plan: 'Enterprise',
    segment: 'Indústria',
    size: 'Grande',
    status: 'active',
    ...overrides,
  };
}

export function makeRisk(overrides: Partial<RiskDashboardData> = {}): RiskDashboardData {
  return {
    kpis: {
      activeClients: { value: 58, delta: -2 },
      criticalClients: { value: 2, delta: 1 },
      riskClients: { value: 10, delta: -3 },
      mrrAtRisk: { value: 154000, delta: 12000 },
      currency: 'BRL',
    },
    forecast: {
      rows: [],
      thresholds: { attention: 80, risk: 60, critical: 40 },
      trendWindow: 3,
      periodLabel: 'mês',
      crossingCount: 1,
    },
    priorityWeights: { risk: 0.6, impact: 0.4 },
    ranking: [makeRankingRow()],
    classCounts: { NORMAL: 30, ATTENTION: 16, RISK: 10, CRITICAL: 2 },
    generatedAt: '2026-06-30',
    ...overrides,
  };
}

export function makeGeneral(overrides: Partial<GeneralDashboardData> = {}): GeneralDashboardData {
  return {
    kpis: {
      mrr: { value: 707998, delta: -9800 },
      activeClients: { value: 58, delta: -2 },
      cancelledClients: { value: 22, delta: 2 },
      currency: 'BRL',
    },
    distribution: [
      { healthClass: 'CRITICAL', count: 2, share: 0.0345, mrr: 21000 },
      { healthClass: 'RISK', count: 10, share: 0.1724, mrr: 133000 },
      { healthClass: 'ATTENTION', count: 16, share: 0.2759, mrr: 210000 },
      { healthClass: 'NORMAL', count: 30, share: 0.5172, mrr: 343998 },
    ],
    targetBand: { min: 80, max: 100 },
    dimensions: [
      { key: 'SLA', label: 'SLA', health: 54.3, clientCount: 58 },
      { key: 'Satisfação', label: 'NPS', health: 71.2, clientCount: 41 },
    ],
    timeline: {
      portfolio: [
        { periodEnd: '2026-05-31', label: 'mai/26', health: 68.1 },
        { periodEnd: '2026-06-30', label: 'jun/26', health: 66.4 },
      ],
      client: null,
      clientOptions: [],
    },
    thresholds: { attention: 80, risk: 60, critical: 40 },
    generatedAt: '2026-06-30',
    ...overrides,
  };
}
