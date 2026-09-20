/**
 * Alertas (§22 e §27 de DEFINICOES_METRICAS.md; SPEC §36 `alerts`).
 *
 * Um alerta nasce de um gatilho crítico — não do peso. Ele diz: qual cliente, o que disparou,
 * por quê, quanto está em jogo e o que fazer. É a fila de "olhe isto agora".
 */
import type { HealthClass, PriorityClass } from '../scoring.js';

export const ALERT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_SEVERITY_LABELS: Readonly<Record<AlertSeverity, string>> = {
  INFO: 'Informativo',
  WARNING: 'Atenção',
  CRITICAL: 'Crítico',
};

export const ALERT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const ALERT_STATUS_LABELS: Readonly<Record<AlertStatus, string>> = {
  open: 'Aberto',
  acknowledged: 'Reconhecido',
  resolved: 'Resolvido',
};

export interface AlertDto {
  id: string;
  /** Identificador do gatilho no modelo (ex.: `sla_abaixo_de_70`). */
  triggerId: string;
  severity: AlertSeverity;
  status: AlertStatus;
  /** Nome do gatilho ("Cumprimento de SLA abaixo de 70 %"). */
  title: string;
  /** Mensagem do gatilho, já com os valores substituídos. */
  description: string;
  clientId: string;
  clientName: string;
  clientExternalCode: string | null;
  /** Valor mensal do contrato — quanto está em jogo. */
  mrr: number;
  currency: string;
  metricId: string | null;
  metricName: string | null;
  /** Estado do cliente quando o alerta foi gerado. */
  healthScore: number | null;
  healthClass: HealthClass | null;
  priorityScore: number | null;
  priorityClass: PriorityClass | null;
  /** Piso de prioridade que o gatilho impôs (§27). */
  priorityFloor: number | null;
  /** Ação sugerida pelo playbook da métrica (§30). */
  suggestedAction: string | null;
  /** period_end do snapshot que gerou o alerta (ISO 8601). */
  periodEnd: string;
  triggeredAt: string;
  resolvedAt: string | null;
}

export interface AlertsResponse {
  items: AlertDto[];
  /** Quantos alertas abertos existem, por severidade. */
  openBySeverity: Record<AlertSeverity, number>;
  /** Soma do valor mensal dos clientes com alerta aberto. */
  mrrAtRisk: number;
  currency: string;
  generatedAt: string;
}

/** Resumo para o e-mail e para a notificação. */
export interface AlertDigest {
  organizationName: string;
  periodEnd: string;
  totalOpen: number;
  criticalCount: number;
  mrrAtRisk: number;
  currency: string;
  /** Os mais graves primeiro, já prontos para virar linhas do e-mail. */
  highlights: {
    clientName: string;
    healthScore: number | null;
    healthClass: HealthClass | null;
    priorityClass: PriorityClass | null;
    mrr: number;
    reason: string;
    action: string | null;
    clientUrl: string;
  }[];
  dashboardUrl: string;
}
