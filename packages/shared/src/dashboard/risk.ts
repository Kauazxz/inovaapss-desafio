/**
 * Aba "Em risco" do dashboard (§39) — resposta de `GET /dashboard/risk`.
 * Responde: com quem falar, por quê, em que ordem e o que fazer.
 */
import type { HealthClass, PriorityWeights } from '../scoring.js';
import type { ForecastChartData, ForecastRow } from './forecast.js';

/** Um número em texto simples com a variação vs. período anterior (DATAVIZ.md §4.1). */
export interface KpiValue {
  value: number;
  /** Diferença absoluta em relação ao período anterior; `null` quando não há período anterior. */
  delta: number | null;
}

/** Os 4 números da linha de cima da aba "Em risco". */
export interface RiskKpis {
  activeClients: KpiValue;
  criticalClients: KpiValue;
  riskClients: KpiValue;
  /** MRR somado dos clientes em Risco + Crítico. */
  mrrAtRisk: KpiValue;
  currency: string;
}

/** Direção da tendência do health nos últimos períodos (§57: score sempre com tendência). */
export type HealthTrend = 'up' | 'down' | 'stable' | 'unknown';

/**
 * Uma linha da tabela de ranking (§39): Prioridade, Cliente, Health, Risco, Confiança,
 * Valor mensal, Principal evidência, Ação. Estende a linha do forecast porque a tabela é o
 * "irmão" do gráfico (DATAVIZ.md §5.1) e ganha as colunas "Health projetado" e "Confiança da projeção".
 */
export interface RankingRow extends ForecastRow {
  /** Posição no ranking (1 = primeiro a ligar). */
  position: number;
  /** `100 - healthCurrent` (§26). */
  riskScore: number;
  trend: HealthTrend;
  /** Recomendação do playbook do driver principal (§30). */
  suggestedAction: string;
  /** Os principais motivos, do maior para o menor impacto (§58). Inclui `topEvidence`. */
  evidences: string[];
  /** Dimensões de filtro (§61). */
  plan: string;
  segment: string;
  size: string;
  status: string;
}

export interface RiskDashboardData {
  kpis: RiskKpis;
  /** Inclui `thresholds` (faixas vigentes, §7): a UI deriva daí todo texto de faixa. */
  forecast: ForecastChartData;
  /** Pesos vigentes da prioridade (§28, configuráveis por organização — §65). */
  priorityWeights: PriorityWeights;
  /** Ordenado por `priorityScore` decrescente. */
  ranking: RankingRow[];
  /** Classe de saúde de cada cliente do ranking, para quem só precisa contar. */
  classCounts: Record<HealthClass, number>;
  /** Quando os snapshots foram gerados (ISO 8601). */
  generatedAt: string;
}
