/**
 * Filtros do dashboard (§61 — os mesmos de /clients): health_class, priority_class, plan,
 * segment, size, status. A API recebe cada um como query string; a web guarda no estado da tela.
 */
import type { HealthClass, PriorityClass } from '../scoring.js';

export interface DashboardFilters {
  /** `health_class` — classe de saúde atual. */
  healthClass?: HealthClass;
  /** `priority_class` — classe de prioridade atual. */
  priorityClass?: PriorityClass;
  /** `plan` — nome do plano do contrato ativo. */
  plan?: string;
  /** `segment` — segmento do cliente. */
  segment?: string;
  /** `size` — porte do cliente. */
  size?: string;
  /** `status` — status do cliente (ex.: ativo, cancelado). */
  status?: string;
}

/** Nome do parâmetro de query (§61) de cada filtro. */
export const DASHBOARD_FILTER_QUERY_KEYS: Readonly<Record<keyof DashboardFilters, string>> = {
  healthClass: 'health_class',
  priorityClass: 'priority_class',
  plan: 'plan',
  segment: 'segment',
  size: 'size',
  status: 'status',
};

/** Valores disponíveis para os filtros de texto livre (vêm dos dados da organização). */
export interface DashboardFilterOptions {
  plans: string[];
  segments: string[];
  sizes: string[];
  statuses: string[];
}

/** Monta a query string (`?health_class=RISK&plan=Enterprise`) a partir dos filtros preenchidos. */
export function dashboardFiltersToSearchParams(filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(DASHBOARD_FILTER_QUERY_KEYS) as (keyof DashboardFilters)[]) {
    const value = filters[key];
    if (value !== undefined && value !== '') params.set(DASHBOARD_FILTER_QUERY_KEYS[key], value);
  }
  return params;
}

/** `true` quando nenhum filtro está preenchido. */
export function isEmptyDashboardFilters(filters: DashboardFilters): boolean {
  return Object.values(filters).every((value) => value === undefined || value === '');
}
