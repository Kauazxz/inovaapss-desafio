/**
 * Busca de dados do dashboard (§39) via TanStack Query.
 *
 * Hoje devolve o MOCK (`@/lib/mock/dashboard`). Quando a API existir (Etapas 4 + 6), cada
 * `fetch*` troca uma linha pela chamada real — o comentário em cada função mostra qual — e o
 * resto da tela não muda, porque os tipos já são os de `@inovaapss/shared`.
 */
import { useQuery } from '@tanstack/react-query';

import type { GeneralDashboardData, RiskDashboardData } from '@inovaapss/shared';

import { apiFetch } from '@/lib/api';
import { buildMockGeneralDashboard, buildMockRiskDashboard } from '@/lib/mock/dashboard';

/**
 * De onde os dados vêm. Controlado por VITE_DATA_SOURCE (padrão 'api'); com 'mock' a tela usa os
 * dados de exemplo e mostra uma pílula avisando. Trocar não exige alterar código.
 */
export const DASHBOARD_DATA_SOURCE: 'mock' | 'api' =
  import.meta.env.VITE_DATA_SOURCE === 'mock' ? 'mock' : 'api';

export async function fetchRiskDashboard(): Promise<RiskDashboardData> {
  if (DASHBOARD_DATA_SOURCE === 'api') {
    return apiFetch<RiskDashboardData>('/api/v1/dashboard/risk');
  }
  await Promise.resolve();
  return buildMockRiskDashboard();
}

export async function fetchGeneralDashboard(): Promise<GeneralDashboardData> {
  if (DASHBOARD_DATA_SOURCE === 'api') {
    return apiFetch<GeneralDashboardData>('/api/v1/dashboard/general');
  }
  await Promise.resolve();
  return buildMockGeneralDashboard();
}

export const dashboardKeys = {
  all: ['dashboard'] as const,
  risk: () => ['dashboard', 'risk'] as const,
  general: () => ['dashboard', 'general'] as const,
};

export function useRiskDashboard() {
  return useQuery({
    queryKey: dashboardKeys.risk(),
    queryFn: fetchRiskDashboard,
  });
}

export function useGeneralDashboard() {
  return useQuery({
    queryKey: dashboardKeys.general(),
    queryFn: fetchGeneralDashboard,
  });
}
