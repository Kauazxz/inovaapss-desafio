/**
 * Chamadas e hooks (TanStack Query) de /api/v1/clients (§37 Clients, §61).
 * Os tipos espelham a resposta da API (apps/api/src/modules/portfolio-clients/types.ts).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ClientSortField,
  ContractStatus,
  CreatePortfolioClientInput,
  PortfolioClientStatus,
  SortOrder,
  UpdatePortfolioClientInput,
} from '@inovaapss/validation';

import { apiFetch } from '@/lib/api';

export interface ActiveContractSummary {
  id: string;
  planId: string | null;
  planName: string | null;
  monthlyValue: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  status: ContractStatus;
  contractedSlaHours: number | null;
}

export interface PortfolioClient {
  id: string;
  organizationId: string;
  externalCode: string | null;
  name: string;
  segment: string | null;
  size: string | null;
  status: PortfolioClientStatus;
  strategicImportance: number;
  createdAt: string;
  updatedAt: string;
  activeContract: ActiveContractSummary | null;
}

export interface ClientsPage {
  items: PortfolioClient[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ClientFilterOptions {
  segments: string[];
  sizes: string[];
  plans: string[];
  statuses: PortfolioClientStatus[];
}

/** Filtros §61 da tela de clientes (query string da API). */
export interface ClientFilters {
  status?: PortfolioClientStatus | undefined;
  segment?: string | undefined;
  size?: string | undefined;
  plan?: string | undefined;
  strategicImportance?: number | undefined;
}

export interface ClientsQuery {
  page: number;
  pageSize: number;
  search: string;
  sort: ClientSortField;
  order: SortOrder;
  filters: ClientFilters;
}

export function isEmptyClientFilters(filters: ClientFilters): boolean {
  return Object.values(filters).every((value) => value === undefined || value === '');
}

export function clientsQueryToSearchParams(query: ClientsQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  params.set('sort', query.sort);
  params.set('order', query.order);
  if (query.search.trim() !== '') params.set('search', query.search.trim());
  const { status, segment, size, plan, strategicImportance } = query.filters;
  if (status) params.set('status', status);
  if (segment) params.set('segment', segment);
  if (size) params.set('size', size);
  if (plan) params.set('plan', plan);
  if (strategicImportance !== undefined) {
    params.set('strategic_importance', String(strategicImportance));
  }
  return params;
}

export function fetchClients(query: ClientsQuery): Promise<ClientsPage> {
  return apiFetch<ClientsPage>(`/api/v1/clients?${clientsQueryToSearchParams(query)}`);
}

export function fetchClient(clientId: string): Promise<{ client: PortfolioClient }> {
  return apiFetch<{ client: PortfolioClient }>(`/api/v1/clients/${clientId}`);
}

export function fetchClientFilterOptions(): Promise<ClientFilterOptions> {
  return apiFetch<ClientFilterOptions>('/api/v1/clients/filter-options');
}

export function createClient(
  input: CreatePortfolioClientInput,
): Promise<{ client: PortfolioClient }> {
  return apiFetch<{ client: PortfolioClient }>('/api/v1/clients', { method: 'POST', json: input });
}

export function updateClient(
  clientId: string,
  input: UpdatePortfolioClientInput,
): Promise<{ client: PortfolioClient }> {
  return apiFetch<{ client: PortfolioClient }>(`/api/v1/clients/${clientId}`, {
    method: 'PATCH',
    json: input,
  });
}

/** DELETE = arquivar (status archived); o cliente nunca é apagado. */
export function archiveClient(clientId: string): Promise<{ client: PortfolioClient }> {
  return apiFetch<{ client: PortfolioClient }>(`/api/v1/clients/${clientId}`, {
    method: 'DELETE',
  });
}

export const clientKeys = {
  all: ['clients'] as const,
  list: (query: ClientsQuery) => ['clients', 'list', query] as const,
  detail: (clientId: string) => ['clients', 'detail', clientId] as const,
  filterOptions: () => ['clients', 'filter-options'] as const,
};

export function useClients(query: ClientsQuery) {
  return useQuery({
    queryKey: clientKeys.list(query),
    queryFn: () => fetchClients(query),
    // Ao mudar página ou filtro, mantém a lista anterior visível em vez de piscar um skeleton.
    placeholderData: (previous) => previous,
  });
}

export function useClient(clientId: string) {
  return useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: () => fetchClient(clientId),
    select: (data) => data.client,
  });
}

export function useClientFilterOptions() {
  return useQuery({
    queryKey: clientKeys.filterOptions(),
    queryFn: fetchClientFilterOptions,
    staleTime: 60_000,
  });
}

function useInvalidateClients() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: clientKeys.all });
}

export function useCreateClient() {
  const invalidate = useInvalidateClients();
  return useMutation({ mutationFn: createClient, onSuccess: invalidate });
}

export function useUpdateClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: ({ clientId, input }: { clientId: string; input: UpdatePortfolioClientInput }) =>
      updateClient(clientId, input),
    onSuccess: invalidate,
  });
}

export function useArchiveClient() {
  const invalidate = useInvalidateClients();
  return useMutation({ mutationFn: archiveClient, onSuccess: invalidate });
}
