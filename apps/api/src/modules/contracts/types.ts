import type { ContractStatus, ListContractsQuery } from '@inovaapss/validation';

/** Plano / nível de atendimento (§36 plans). */
export interface Plan {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Contrato de um cliente monitorado (§36 contracts), com o nome do plano já resolvido. */
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

export interface CreatePlanInput {
  name: string;
  description?: string | null | undefined;
}

export interface UpdatePlanInput {
  name?: string | undefined;
  description?: string | null | undefined;
}

export interface CreateContractInput {
  portfolioClientId: string;
  planId?: string | null | undefined;
  monthlyValue: number;
  currency?: string | undefined;
  startDate: string;
  endDate?: string | null | undefined;
  status?: ContractStatus | undefined;
  contractedSlaHours?: number | null | undefined;
}

export interface UpdateContractInput {
  planId?: string | null | undefined;
  monthlyValue?: number | undefined;
  currency?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | null | undefined;
  status?: ContractStatus | undefined;
  contractedSlaHours?: number | null | undefined;
}

export type { ListContractsQuery };

export interface PaginatedContracts {
  items: Contract[];
  page: number;
  pageSize: number;
  total: number;
}
