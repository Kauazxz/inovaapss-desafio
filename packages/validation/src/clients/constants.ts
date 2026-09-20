/**
 * Vocabulário da Etapa 2 (§4, §36): status do cliente monitorado e do contrato.
 *
 * Fica no pacote de validação (e não em @inovaapss/shared) porque nasce junto com os schemas
 * Zod que o usam; API e web importam daqui.
 */

// ---------- §36 portfolio_clients.status ----------
export const PORTFOLIO_CLIENT_STATUSES = ['active', 'inactive', 'cancelled', 'archived'] as const;
export type PortfolioClientStatus = (typeof PORTFOLIO_CLIENT_STATUSES)[number];
export const PortfolioClientStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived',
} as const satisfies Record<string, PortfolioClientStatus>;

// ---------- §36 contracts.status ----------
export const CONTRACT_STATUSES = ['active', 'ended', 'suspended'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const ContractStatus = {
  ACTIVE: 'active',
  ENDED: 'ended',
  SUSPENDED: 'suspended',
} as const satisfies Record<string, ContractStatus>;

/** §36 portfolio_clients.strategic_importance: 1 (baixa) a 5 (altíssima), padrão 3. */
export const STRATEGIC_IMPORTANCE_MIN = 1;
export const STRATEGIC_IMPORTANCE_MAX = 5;
export const STRATEGIC_IMPORTANCE_DEFAULT = 3;

/** Campos aceitos em `sort` na listagem de clientes (§61). */
export const CLIENT_SORT_FIELDS = [
  'name',
  'externalCode',
  'segment',
  'size',
  'status',
  'strategicImportance',
  'planName',
  'monthlyValue',
  'createdAt',
] as const;
export type ClientSortField = (typeof CLIENT_SORT_FIELDS)[number];

/** Campos aceitos em `sort` na listagem de contratos. */
export const CONTRACT_SORT_FIELDS = [
  'startDate',
  'endDate',
  'monthlyValue',
  'status',
  'createdAt',
] as const;
export type ContractSortField = (typeof CONTRACT_SORT_FIELDS)[number];

/** Moeda padrão dos contratos (§36 contracts.currency). */
export const DEFAULT_CURRENCY = 'BRL';
