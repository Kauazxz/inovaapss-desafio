/**
 * Aba "Geral" do dashboard (§39) — resposta de `GET /dashboard/general`.
 * Distribuição por classe, MRR, ativos, cancelados, saúde por dimensão e evolução no tempo.
 */
import type { HealthClass } from '../scoring.js';
import type { HealthThresholds } from './forecast.js';
import type { KpiValue } from './risk.js';

/** Os 3 números em texto simples da aba (DATAVIZ.md §4.2). */
export interface GeneralKpis {
  /** MRR total da carteira filtrada. */
  mrr: KpiValue;
  activeClients: KpiValue;
  cancelledClients: KpiValue;
  currency: string;
}

/** Uma classe na distribuição Normal / Atenção / Risco / Crítico (barras, nunca pizza — A1). */
export interface ClassDistributionItem {
  healthClass: HealthClass;
  count: number;
  /** Fração do total (0–1). */
  share: number;
  /** MRR somado dos clientes nessa classe. */
  mrr: number;
}

/** Saúde média da carteira em uma dimensão (Atendimento, SLA, Uso, NPS, Financeiro, Reuniões). */
export interface DimensionHealth {
  /** Identificador estável (ex.: `support`, `sla`). */
  key: string;
  /** Nome exibido, em português. */
  label: string;
  /** Média 0–100 dos clientes filtrados; `null` quando nenhuma métrica da dimensão tem dado. */
  health: number | null;
  /** Quantos clientes contribuíram para a média. */
  clientCount: number;
}

/** Um ponto da série temporal. */
export interface HealthTimePoint {
  /** period_end (ISO 8601). */
  periodEnd: string;
  /** Rótulo curto para o eixo (ex.: "mai/26"). */
  label: string;
  /** Health médio; `null` quando não havia snapshot no período. */
  health: number | null;
}

/** Série de um cliente escolhido no filtro, para destacar sobre a média da carteira. */
export interface ClientHealthSeries {
  clientId: string;
  clientName: string;
  points: HealthTimePoint[];
}

export interface HealthTimeline {
  /** Média da carteira filtrada, um ponto por período (do mais antigo ao mais recente). */
  portfolio: HealthTimePoint[];
  /** Cliente destacado, quando o usuário escolheu um. */
  client: ClientHealthSeries | null;
  /** Clientes disponíveis para destacar. */
  clientOptions: { clientId: string; clientName: string }[];
}

export interface GeneralDashboardData {
  kpis: GeneralKpis;
  /** Sempre as 4 classes, mesmo com contagem zero, na ordem Crítico → Normal. */
  distribution: ClassDistributionItem[];
  /** Faixa-alvo (80–100 por padrão) desenhada ao fundo das barras por dimensão. */
  targetBand: { min: number; max: number };
  /** Ordenadas da pior para a melhor. */
  dimensions: DimensionHealth[];
  timeline: HealthTimeline;
  thresholds: HealthThresholds;
  generatedAt: string;
}
