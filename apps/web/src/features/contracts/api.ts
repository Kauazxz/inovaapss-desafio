/**
 * Chamadas e hooks (TanStack Query) de /api/v1/plans e /api/v1/contracts (§37 Contracts / Plans).
 * Os tipos espelham a resposta da API (apps/api/src/modules/contracts/types.ts).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ContractStatus,
  CreateContractInput,
  CreatePlanInput,
  UpdateContractInput,
  UpdatePlanInput,
} from '@inovaapss/validation';

import { clientKeys } from '@/features/clients/api';
import { apiFetch } from '@/lib/api';

export interface Plan {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  organizationId: string;
  portfolioClientId: string;
  planId: string | null;
  planName: string | null;
  monthlyValue: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  status: ContractStatus;
  contractedSlaHours: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractsPage {
  items: Contract[];
  page: number;
  pageSize: number;
  total: number;
}

// ---------- Planos ----------

export function fetchPlans(): Promise<{ items: Plan[]; total: number }> {
  return apiFetch<{ items: Plan[]; total: number }>('/api/v1/plans');
}

export function createPlan(input: CreatePlanInput): Promise<{ plan: Plan }> {
  return apiFetch<{ plan: Plan }>('/api/v1/plans', { method: 'POST', json: input });
}

export function updatePlan(planId: string, input: UpdatePlanInput): Promise<{ plan: Plan }> {
  return apiFetch<{ plan: Plan }>(`/api/v1/plans/${planId}`, { method: 'PATCH', json: input });
}

export const planKeys = {
  all: ['plans'] as const,
  list: () => ['plans', 'list'] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: planKeys.list(),
    queryFn: fetchPlans,
    select: (data) => data.items,
    staleTime: 60_000,
  });
}

function useInvalidatePlans() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: planKeys.all });
    // O nome do plano aparece na lista de clientes e nos filtros.
    await queryClient.invalidateQueries({ queryKey: clientKeys.all });
  };
}

export function useCreatePlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({ mutationFn: createPlan, onSuccess: invalidate });
}

export function useUpdatePlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: ({ planId, input }: { planId: string; input: UpdatePlanInput }) =>
      updatePlan(planId, input),
    onSuccess: invalidate,
  });
}

// ---------- Contratos ----------

export function fetchClientContracts(clientId: string): Promise<ContractsPage> {
  const params = new URLSearchParams({
    clientId,
    pageSize: '100',
    sort: 'startDate',
    order: 'desc',
  });
  return apiFetch<ContractsPage>(`/api/v1/contracts?${params}`);
}

export function createContract(input: CreateContractInput): Promise<{ contract: Contract }> {
  return apiFetch<{ contract: Contract }>('/api/v1/contracts', { method: 'POST', json: input });
}

export function updateContract(
  contractId: string,
  input: UpdateContractInput,
): Promise<{ contract: Contract }> {
  return apiFetch<{ contract: Contract }>(`/api/v1/contracts/${contractId}`, {
    method: 'PATCH',
    json: input,
  });
}

export const contractKeys = {
  all: ['contracts'] as const,
  byClient: (clientId: string) => ['contracts', 'client', clientId] as const,
};

export function useClientContracts(clientId: string) {
  return useQuery({
    queryKey: contractKeys.byClient(clientId),
    queryFn: () => fetchClientContracts(clientId),
    select: (data) => data.items,
  });
}

function useInvalidateContracts() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: contractKeys.all });
    // O contrato ativo aparece na lista e no detalhe do cliente.
    await queryClient.invalidateQueries({ queryKey: clientKeys.all });
  };
}

export function useCreateContract() {
  const invalidate = useInvalidateContracts();
  return useMutation({ mutationFn: createContract, onSuccess: invalidate });
}

export function useUpdateContract() {
  const invalidate = useInvalidateContracts();
  return useMutation({
    mutationFn: ({ contractId, input }: { contractId: string; input: UpdateContractInput }) =>
      updateContract(contractId, input),
    onSuccess: invalidate,
  });
}
