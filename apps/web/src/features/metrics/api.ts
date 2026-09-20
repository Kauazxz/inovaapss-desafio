/**
 * Chamadas de /api/v1/metrics (§37) com TanStack Query. Os tipos são os DTOs de
 * @inovaapss/shared — os mesmos que a API devolve.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  MetricDefinitionDetailDto,
  MetricDefinitionDto,
  MetricDefinitionListItemDto,
  MetricDirection,
  MetricSource,
  MetricType,
} from '@inovaapss/shared';
import type { CreateMetricDefinitionInput, PreviewScoreInput } from '@inovaapss/validation';

import { apiFetch } from '@/lib/api';

export interface MetricsListQuery {
  page: number;
  pageSize: number;
  search: string;
  type: MetricType | '';
  direction: MetricDirection | '';
  source: MetricSource | '';
  /** '' = todas, 'true' = só ativas, 'false' = só inativas. */
  isActive: '' | 'true' | 'false';
}

export const DEFAULT_METRICS_QUERY: MetricsListQuery = {
  page: 1,
  // Traz até o limite da API para a ordem do modelo ativo abranger a lista inteira na maioria
  // das organizações.
  pageSize: 100,
  search: '',
  type: '',
  direction: '',
  source: '',
  isActive: '',
};

export interface MetricsListResponse {
  items: MetricDefinitionListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** Parte do `MetricScore` do motor que a tela de simulação mostra (SCORING.md §6). */
export interface PreviewScore {
  metricId: string;
  metricName: string;
  metricHealth: number | null;
  currentHealth: number | null;
  trendHealth: number | null;
  persistenceHealth: number | null;
  confidence: number;
  currentValue: number | null;
  previousValue: number | null;
  components: {
    weightsUsed: { current: number; trend: number; persistence: number };
  };
  normalization: { baseline: number | null; deviationPct: number | null; reason: string | null };
  trend: { changePercent: number | null; periodsUsed: number; reason: string | null };
  persistence: { unhealthyPeriods: number; evaluatedPeriods: number; reason: string | null };
  triggers: { hits: { name: string; message: string; priorityFloor: number | null }[] };
  explanation: { summary: string; components: string[]; notes: string[] };
}

export function metricsSearchParams(query: MetricsListQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.search.trim() !== '') params.set('search', query.search.trim());
  if (query.type !== '') params.set('type', query.type);
  if (query.direction !== '') params.set('direction', query.direction);
  if (query.source !== '') params.set('source', query.source);
  if (query.isActive !== '') params.set('is_active', query.isActive);
  return params;
}

export function fetchMetrics(query: MetricsListQuery): Promise<MetricsListResponse> {
  return apiFetch<MetricsListResponse>(`/api/v1/metrics?${metricsSearchParams(query)}`);
}

export function createMetricDefinition(
  body: CreateMetricDefinitionInput,
): Promise<{ definition: MetricDefinitionDto }> {
  return apiFetch<{ definition: MetricDefinitionDto }>('/api/v1/metrics', {
    method: 'POST',
    json: body,
  });
}

export function fetchMetric(id: string): Promise<MetricDefinitionDetailDto> {
  return apiFetch<MetricDefinitionDetailDto>(`/api/v1/metrics/${id}`);
}

export function previewMetricScore(
  id: string,
  body: PreviewScoreInput,
): Promise<{ score: PreviewScore }> {
  return apiFetch<{ score: PreviewScore }>(`/api/v1/metrics/${id}/preview-score`, {
    method: 'POST',
    json: body,
  });
}

export const metricsKeys = {
  all: ['metrics'] as const,
  list: (query: MetricsListQuery) => ['metrics', 'list', query] as const,
  detail: (id: string) => ['metrics', 'detail', id] as const,
};

export function useMetrics(query: MetricsListQuery) {
  return useQuery({
    queryKey: metricsKeys.list(query),
    queryFn: () => fetchMetrics(query),
    // Ao mudar filtro, mantém a lista anterior visível em vez de piscar um skeleton.
    placeholderData: (previous) => previous,
  });
}

export function useMetric(id: string | undefined) {
  return useQuery({
    queryKey: metricsKeys.detail(id ?? ''),
    queryFn: () => fetchMetric(id as string),
    enabled: id !== undefined,
  });
}

export function usePreviewScore(id: string) {
  return useMutation({
    mutationFn: (body: PreviewScoreInput) => previewMetricScore(id, body),
  });
}

/** POST /metrics (owner/admin). Invalida a lista para a nova métrica aparecer na tabela. */
export function useCreateMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMetricDefinition,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: metricsKeys.all }),
  });
}
