/**
 * Histórico e timeline do cliente (§40 aba "Histórico") — resposta de `GET /clients/:id/history`.
 * A linha do overall_health vem de `client_score_snapshots`; os eventos vêm de `alerts`,
 * `import_jobs`, `client_recommendations`, `metric_model_versions` e das mudanças de classe
 * entre snapshots consecutivos (DATAVIZ.md §4.3).
 */
import type { HealthThresholds } from '../dashboard/forecast.js';
import type { HealthTimePoint } from '../dashboard/general.js';
import type { HealthClass } from '../scoring.js';

export const TIMELINE_EVENT_TYPES = [
  'CLASS_CHANGE',
  'ALERT',
  'IMPORT',
  'RECOMMENDATION_DONE',
  'MODEL_VERSION',
  'CONTRACT',
  'CANCELLATION',
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];
export const TimelineEventType = {
  CLASS_CHANGE: 'CLASS_CHANGE',
  ALERT: 'ALERT',
  IMPORT: 'IMPORT',
  RECOMMENDATION_DONE: 'RECOMMENDATION_DONE',
  MODEL_VERSION: 'MODEL_VERSION',
  CONTRACT: 'CONTRACT',
  CANCELLATION: 'CANCELLATION',
} as const satisfies Record<string, TimelineEventType>;

export const TIMELINE_EVENT_TYPE_LABELS: Readonly<Record<TimelineEventType, string>> = {
  CLASS_CHANGE: 'Mudança de classe',
  ALERT: 'Alerta',
  IMPORT: 'Importação',
  RECOMMENDATION_DONE: 'Recomendação concluída',
  MODEL_VERSION: 'Versão do modelo',
  CONTRACT: 'Contrato',
  CANCELLATION: 'Cancelamento',
};

export type TimelineEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface TimelineEventDto {
  id: string;
  type: TimelineEventType;
  severity: TimelineEventSeverity;
  /** Quando aconteceu (ISO 8601). */
  occurredAt: string;
  /** period_end do snapshot a que o evento se refere, quando houver (para o marcador na linha). */
  periodEnd: string | null;
  title: string;
  description: string | null;
  /** overall_health no momento do evento, para o marcador na linha do tempo. */
  healthAt: number | null;
  /** Só em CLASS_CHANGE. */
  fromClass: HealthClass | null;
  toClass: HealthClass | null;
  metricId: string | null;
  metricName: string | null;
}

/** Resposta de `GET /clients/:id/history`. */
export interface ClientHistoryResponse {
  clientId: string;
  /** overall_health por período, do mais antigo ao mais recente. */
  health: HealthTimePoint[];
  /** Média da carteira nos mesmos períodos (linha cinza). */
  portfolio: HealthTimePoint[];
  thresholds: HealthThresholds;
  /** Do mais recente ao mais antigo. */
  events: TimelineEventDto[];
}
