/**
 * Visão individual do cliente (§40) — resposta de `GET /clients/:id`.
 * Cabeçalho (nome, plano, contrato, MRR) + resumo do último `client_score_snapshot` (§36),
 * sempre com contexto: score, classe, tendência, confiança e principais motivos (§57, §58).
 */
import type { HealthThresholds, ProjectionConfidence } from '../dashboard/forecast.js';
import type { HealthTimePoint } from '../dashboard/general.js';
import type { HealthTrend } from '../dashboard/risk.js';
import type { HealthClass, PriorityClass } from '../scoring.js';
import type { EvidenceDto } from './evidence.js';

/** Dados cadastrais do portfolio client (§36 `portfolio_clients`). */
export interface ClientSummaryDto {
  id: string;
  name: string;
  externalCode: string | null;
  segment: string | null;
  size: string | null;
  /** Ex.: "Ativo", "Cancelado". */
  status: string;
  /** Quando cancelou (ISO 8601), só para status cancelado. */
  cancelledAt: string | null;
  /** Importância estratégica 0–100 (entra no impacto comercial, §28). */
  strategicImportance: number | null;
}

export interface PlanSummaryDto {
  id: string;
  name: string;
}

/** Contrato vigente (§36 `contracts`). */
export interface ContractSummaryDto {
  id: string;
  /** Código curto para a tela (ex.: "CT-2024-031"). */
  code: string;
  startDate: string;
  endDate: string | null;
  /** Ex.: "Vigente", "Encerrado". */
  status: string;
  monthlyValue: number;
  currency: string;
  /** SLA contratado em horas (coluna `sla_contratado_h` do dataset), quando conhecido. */
  contractedSlaHours: number | null;
}

/** Resumo do último snapshot (§24–§28) com o que o cabeçalho e o resumo §58 precisam. */
export interface ClientScoreSummaryDto {
  /** period_end do snapshot (ISO 8601). */
  periodEnd: string;
  /** Versão do modelo usada (§31). */
  modelVersion: string;
  overallHealth: number | null;
  healthClass: HealthClass | null;
  /** overall_health do snapshot anterior, para a variação em texto. */
  previousHealth: number | null;
  trend: HealthTrend;
  /** `100 − overallHealth` (§26). */
  riskScore: number | null;
  /** 0–100 (§25). */
  analysisConfidence: number;
  commercialImpactScore: number | null;
  priorityScore: number | null;
  priorityClass: PriorityClass | null;
  /** Piso de prioridade vindo de gatilho (§27), quando houver. */
  priorityFloor: number | null;
  /** Projeção por tendência para o próximo período (DATAVIZ.md §5.2). */
  healthProjected: number | null;
  projectedClass: HealthClass | null;
  projectionConfidence: ProjectionConfidence;
  /** Quantas métricas do modelo puderam ser avaliadas. */
  metricsAvailable: number;
  metricsTotal: number;
}

export interface ClientHealthOverview {
  client: ClientSummaryDto;
  plan: PlanSummaryDto | null;
  contract: ContractSummaryDto | null;
  /** Valor mensal do contrato vigente (0 sem contrato). */
  mrr: number;
  currency: string;
  /** `null` quando o cliente ainda não tem snapshot. */
  score: ClientScoreSummaryDto | null;
  thresholds: HealthThresholds;
  /** Nome do período para os textos ("mês"). */
  periodLabel: string;
  /** Principais drivers (1–4), já ordenados por contribuição (§58). */
  topDrivers: EvidenceDto[];
  /** overall_health por período (do mais antigo ao mais recente). */
  healthHistory: HealthTimePoint[];
  /** Média da carteira nos mesmos períodos. */
  portfolioHistory: HealthTimePoint[];
  generatedAt: string;
}
