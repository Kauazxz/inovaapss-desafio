/**
 * Gráfico de forecast priorizado (ajuste A2) — estrutura de dados de docs/DATAVIZ.md §5.4.
 *
 * É o campo `forecast` da resposta de `GET /dashboard/risk`. O cálculo da projeção é puro e
 * vive no motor (`packages/engine`, Etapa 4); aqui ficam só os tipos que API e web compartilham.
 */
import { HEALTH_CLASSES, type HealthClass, type PriorityClass } from '../scoring.js';

/** Confiança da projeção por tendência (DATAVIZ.md §5.2). */
export const PROJECTION_CONFIDENCES = ['low', 'medium', 'high'] as const;
export type ProjectionConfidence = (typeof PROJECTION_CONFIDENCES)[number];

/** Rótulos em português para a interface. */
export const PROJECTION_CONFIDENCE_LABELS: Readonly<Record<ProjectionConfidence, string>> = {
  low: 'baixa',
  medium: 'média',
  high: 'alta',
};

/** Thresholds vigentes do health (§7): a classe vale a partir do valor (inclusive). */
export interface HealthThresholds {
  /** Normal a partir daqui (padrão 80). */
  readonly attention: number;
  /** Atenção a partir daqui (padrão 60). */
  readonly risk: number;
  /** Risco a partir daqui (padrão 40); abaixo é Crítico. */
  readonly critical: number;
}

/** Uma linha do gráfico de forecast priorizado (um cliente). */
export interface ForecastRow {
  clientId: string;
  clientName: string;
  /** Valor mensal do contrato (MRR), na moeda abaixo. */
  mrr: number;
  currency: string;

  /** Ordena a lista (decrescente). 0–100. */
  priorityScore: number;
  priorityClass: PriorityClass;

  /** Health atual (0–100) e sua classe pelos thresholds vigentes. */
  healthCurrent: number;
  currentClass: HealthClass;

  /** Health projetado para o próximo período. `null` = histórico insuficiente. */
  healthProjected: number | null;
  projectedClass: HealthClass | null;

  /** Inclinação usada (pontos de health por período). `null` quando não há projeção. */
  slopePerPeriod: number | null;
  /** Janela configurada (N) e quantos períodos existiam de fato. */
  trendWindow: number;
  periodsAvailable: number;

  /** analysis_confidence do último snapshot (0–100). */
  confidence: number;
  projectionConfidence: ProjectionConfidence;

  /** true quando a classe projetada é Risco ou Crítico e é pior que a atual. É o que recebe cor. */
  crossesDown: boolean;

  /** human_explanation do driver com maior contribuição negativa. */
  topEvidence: string;
  /** period_end do snapshot atual (ISO 8601). */
  periodEnd: string;
}

/** Payload do gráfico: linhas + o que o título precisa. */
export interface ForecastChartData {
  rows: ForecastRow[];
  /** Thresholds vigentes, para desenhar as linhas de referência. */
  thresholds: HealthThresholds; // padrão 80 / 60 / 40
  trendWindow: number;
  /** Ex.: "mês". */
  periodLabel: string;
  /** Quantas linhas têm crossesDown = true (vira o título). */
  crossingCount: number;
}

/**
 * Ordem de gravidade das classes (0 = Normal … 3 = Crítico), derivada da lista oficial do §7.
 * Serve para comparar classes ("a projetada é pior que a atual?") sem repetir a ordem em cada tela.
 */
export function healthClassSeverity(healthClass: HealthClass): number {
  return HEALTH_CLASSES.indexOf(healthClass);
}

/** `true` quando `candidate` é uma classe pior (mais grave) que `reference`. */
export function isWorseHealthClass(candidate: HealthClass, reference: HealthClass): boolean {
  return healthClassSeverity(candidate) > healthClassSeverity(reference);
}

/**
 * Regra de destaque do gráfico (DATAVIZ.md §5.1): só quem cruza para Risco ou Crítico vindo de
 * uma classe melhor recebe cor. Quem já está em Crítico e continua caindo fica em cinza.
 */
export function crossesDownTo(current: HealthClass, projected: HealthClass | null): boolean {
  if (projected === null) return false;
  if (projected !== 'RISK' && projected !== 'CRITICAL') return false;
  return isWorseHealthClass(projected, current);
}
