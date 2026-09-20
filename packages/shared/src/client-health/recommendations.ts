/**
 * Recomendações (§30) — resposta de `GET /clients/:id/recommendations`.
 * Junta `recommendations` (o playbook configurável da métrica) com `client_recommendations`
 * (a instância para este cliente, com status) — §36.
 */
import type { ClientHealthDimension } from './dimensions.js';

export const RECOMMENDATION_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'DISMISSED'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];
export const RecommendationStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  DISMISSED: 'DISMISSED',
} as const satisfies Record<string, RecommendationStatus>;

export const RECOMMENDATION_STATUS_LABELS: Readonly<Record<RecommendationStatus, string>> = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  DISMISSED: 'Descartada',
};

/** O que disparou a recomendação (coluna `trigger_type` de `recommendations`). */
export type RecommendationTriggerType = 'METRIC_HEALTH' | 'CRITICAL_TRIGGER' | 'CLASS_CHANGE';

export interface RecommendationDto {
  /** id de `client_recommendations`. */
  id: string;
  /** id do playbook em `recommendations`. */
  recommendationId: string;
  metricId: string | null;
  metricName: string | null;
  dimension: ClientHealthDimension | null;
  triggerType: RecommendationTriggerType;
  /** Ação sugerida (§30), ex.: "Revisar as causas de estouro de SLA com o gestor da conta". */
  title: string;
  /** O playbook: o que fazer, passo a passo, em português. */
  description: string;
  /** Prioridade do playbook (1 = primeiro a fazer). */
  priority: number;
  status: RecommendationStatus;
  /** A evidência que motivou (human_explanation), para a tela mostrar o "por quê" ao lado. */
  evidence: string | null;
  /** id do alerta que gerou a recomendação, quando houver (§36 `alert_id`). */
  alertId: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** Resposta de `GET /clients/:id/recommendations`: ordenada por status (abertas primeiro) e prioridade. */
export interface ClientRecommendationsResponse {
  clientId: string;
  items: RecommendationDto[];
}
