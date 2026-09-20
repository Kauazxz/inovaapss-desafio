/**
 * Busca de dados do dashboard (§39) via TanStack Query.
 *
 * Hoje devolve o MOCK (`@/lib/mock/dashboard`). Quando a API existir (Etapas 4 + 6), cada
 * `fetch*` troca uma linha pela chamada real — o comentário em cada função mostra qual — e o
 * resto da tela não muda, porque os tipos já são os de `@inovaapss/shared`.
 */
import { useQuery } from '@tanstack/react-query';

import {
  type DashboardFilterOptions,
  type DashboardFilters,
  type GeneralDashboardData,
  type RiskDashboardData,
} from '@inovaapss/shared';

import { apiFetch } from '@/lib/api';
import {
  buildMockGeneralDashboard,
  buildMockRiskDashboard,
  mockFilterOptions,
} from '@/lib/mock/dashboard';

/**
 * De onde os dados vêm. Controlado por VITE_DATA_SOURCE (padrão 'api'); com 'mock' a tela usa os
 * dados de exemplo e mostra uma pílula avisando. Trocar não exige alterar código.
 */
export const DASHBOARD_DATA_SOURCE: 'mock' | 'api' =
  import.meta.env.VITE_DATA_SOURCE === 'mock' ? 'mock' : 'api';

export interface RiskDashboardQuery {
  filters: DashboardFilters;
  search: string;
}

export interface GeneralDashboardQuery {
  filters: DashboardFilters;
  selectedClientId: string | null;
}

export async function fetchRiskDashboard(query: RiskDashboardQuery): Promise<RiskDashboardData> {
  if (DASHBOARD_DATA_SOURCE === 'api') {
    return apiFetch<RiskDashboardData>('/api/v1/dashboard/risk');
  }
  await Promise.resolve();
  return buildMockRiskDashboard({ filters: query.filters, search: query.search });
}

export async function fetchGeneralDashboard(
  query: GeneralDashboardQuery,
): Promise<GeneralDashboardData> {
  // API real: return apiFetch<GeneralDashboardData>(`/api/v1/dashboard/general?${generalParams(query)}`);
  await Promise.resolve();
  return buildMockGeneralDashboard({
    filters: query.filters,
    selectedClientId: query.selectedClientId ?? undefined,
  });
}

export async function fetchDashboardFilterOptions(): Promise<DashboardFilterOptions> {
  // API real: return apiFetch<DashboardFilterOptions>('/api/v1/dashboard/filters');
  await Promise.resolve();
  return mockFilterOptions();
}

export const dashboardKeys = {
  all: ['dashboard'] as const,
  risk: (query: RiskDashboardQuery) => ['dashboard', 'risk', query] as const,
  general: (query: GeneralDashboardQuery) => ['dashboard', 'general', query] as const,
  filterOptions: () => ['dashboard', 'filter-options'] as const,
};

export function useRiskDashboard(query: RiskDashboardQuery) {
  return useQuery({
    queryKey: dashboardKeys.risk(query),
    queryFn: () => fetchRiskDashboard(query),
    // Ao mudar filtro, mantém o resultado anterior visível (a 60 %) em vez de piscar um skeleton.
    placeholderData: (previous) => previous,
  });
}

export function useGeneralDashboard(query: GeneralDashboardQuery) {
  return useQuery({
    queryKey: dashboardKeys.general(query),
    queryFn: () => fetchGeneralDashboard(query),
    placeholderData: (previous) => previous,
  });
}

export function useDashboardFilterOptions() {
  return useQuery({
    queryKey: dashboardKeys.filterOptions(),
    queryFn: fetchDashboardFilterOptions,
    staleTime: 5 * 60_000,
  });
}
