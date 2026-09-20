import type {
  ContractStatus,
  ListPortfolioClientsQuery,
  PortfolioClientStatus,
} from '@inovaapss/validation';

/** Cliente monitorado (§36 portfolio_clients), como a API devolve. */
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
}

/** Resumo do contrato ativo que acompanha o cliente na lista e no detalhe. */
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

export interface PortfolioClientWithContract extends PortfolioClient {
  /** null quando o cliente não tem contrato `active`. */
  activeContract: ActiveContractSummary | null;
}

export type ListClientsQuery = ListPortfolioClientsQuery;

export interface PaginatedResult<TItem> {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CreatePortfolioClientInput {
  name: string;
  externalCode?: string | null | undefined;
  segment?: string | null | undefined;
  size?: string | null | undefined;
  status?: PortfolioClientStatus | undefined;
  strategicImportance?: number | undefined;
}

export interface UpdatePortfolioClientInput {
  name?: string | undefined;
  externalCode?: string | null | undefined;
  segment?: string | null | undefined;
  size?: string | null | undefined;
  status?: PortfolioClientStatus | undefined;
  strategicImportance?: number | undefined;
}

/** Valores distintos da organização para preencher os filtros da tela (§61). */
export interface ClientFilterOptions {
  segments: string[];
  sizes: string[];
  plans: string[];
  statuses: PortfolioClientStatus[];
}
