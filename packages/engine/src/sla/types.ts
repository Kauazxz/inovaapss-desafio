import type { OperationalTargetType, TicketStatus } from '@inovaapss/shared';

/** Política de SLA (§14, §36 `sla_policies`). Campo `null` = vale para qualquer valor (coringa). */
export interface SlaPolicy {
  id: string;
  planId: string | null;
  severityId: string | null;
  ticketTypeId: string | null;
  contractualSlaMinutes: number;
  operationalTargetType: OperationalTargetType;
  /** Percentual (0–100) quando PERCENT_OF_SLA; minutos quando ABSOLUTE_MINUTES. */
  operationalTargetValue: number;
  isActive?: boolean;
  /** Validade (ISO 8601). `null`/ausente = sem limite. */
  validFrom?: string | null;
  validTo?: string | null;
}

/** O que identifica o SLA aplicável a um chamado (§14). */
export interface SlaLookup {
  planId: string | null;
  severityId: string | null;
  ticketTypeId: string | null;
  /** Instante de referência para a validade (normalmente `opened_at`). */
  at?: string;
}

/** Chamado para avaliação de SLA (§14, §36 `tickets`). */
export interface SlaTicket {
  id: string;
  status: TicketStatus;
  openedAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
  planId?: string | null;
  severityId?: string | null;
  ticketTypeId?: string | null;
}

/** Pesos do health por chamado (§14): padrão 60 % contratual, 40 % meta operacional. */
export interface TicketSlaWeights {
  contract: number;
  operational: number;
}

export interface TicketSlaOptions {
  /** Instante atual para chamados abertos (ISO 8601). Obrigatório quando houver chamado aberto. */
  now?: string;
  weights?: Partial<TicketSlaWeights>;
}

export interface TicketSlaResult {
  ticketId: string;
  status: TicketStatus;
  /** `null` quando não há política aplicável. */
  policyId: string | null;
  contractualSlaMinutes: number | null;
  operationalTargetMinutes: number | null;
  /** `null` para chamado cancelado ou sem datas válidas. */
  elapsedMinutes: number | null;
  contractSlaConsumption: number | null;
  operationalTargetConsumption: number | null;
  /** 0–100 (100 = dentro de toda folga) ou `null` quando não avaliável. */
  health: number | null;
  breachedContract: boolean;
  breachedOperationalTarget: boolean;
  isOpen: boolean;
  reason: string | null;
}

export type SlaAggregationMethod = 'AVERAGE' | 'WORST';

export interface ClientSlaAggregateOptions {
  /** `AVERAGE` (padrão) ou `WORST` (pior chamado). */
  method?: SlaAggregationMethod;
  /** Só chamados abertos entram (padrão false: todos os avaliáveis). */
  openOnly?: boolean;
}

export interface ClientSlaAggregate {
  health: number | null;
  method: SlaAggregationMethod;
  evaluatedTickets: number;
  skippedTickets: number;
  breachedContractCount: number;
  breachedOperationalCount: number;
  /** Chamado com o menor health. */
  worstTicketId: string | null;
  worstTicketHealth: number | null;
}
