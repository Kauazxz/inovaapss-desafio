/**
 * Casos de uso de clientes da carteira (§4, §37 Clients, docs/CLIENTS.md):
 * listar com filtros §61, criar, ver, editar e ARQUIVAR (nunca apagar).
 */
import { ConflictError } from '../../middleware/http-errors.js';
import { NotFoundError } from '../../shared/errors.js';

import type { PortfolioClientsRepository } from './repository.js';
import type {
  ClientFilterOptions,
  CreatePortfolioClientInput,
  ListClientsQuery,
  PaginatedResult,
  PortfolioClientWithContract,
  UpdatePortfolioClientInput,
} from './types.js';
import type { TenantContext } from '../../middleware/tenant.js';

export interface PortfolioClientsService {
  list(
    tenant: TenantContext,
    query: ListClientsQuery,
  ): Promise<PaginatedResult<PortfolioClientWithContract>>;
  get(tenant: TenantContext, clientId: string): Promise<PortfolioClientWithContract>;
  create(
    tenant: TenantContext,
    input: CreatePortfolioClientInput,
  ): Promise<PortfolioClientWithContract>;
  update(
    tenant: TenantContext,
    clientId: string,
    patch: UpdatePortfolioClientInput,
  ): Promise<PortfolioClientWithContract>;
  /** DELETE /clients/:id: muda o status para `archived`; o histórico do cliente fica. */
  archive(tenant: TenantContext, clientId: string): Promise<PortfolioClientWithContract>;
  filterOptions(tenant: TenantContext): Promise<ClientFilterOptions>;
}

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

function externalCodeTaken(): ConflictError {
  return new ConflictError(
    'Já existe um cliente com este código nesta organização.',
    'EXTERNAL_CODE_TAKEN',
  );
}

function notFound(): NotFoundError {
  return new NotFoundError('Cliente não encontrado.');
}

export function createPortfolioClientsService(
  repository: PortfolioClientsRepository,
): PortfolioClientsService {
  async function getOrThrow(
    organizationId: string,
    clientId: string,
  ): Promise<PortfolioClientWithContract> {
    const client = await repository.findById(organizationId, clientId);
    if (client === null) throw notFound();
    return client;
  }

  return {
    async list(tenant, query) {
      return repository.list(tenant.organizationId, query);
    },

    async get(tenant, clientId) {
      return getOrThrow(tenant.organizationId, clientId);
    },

    async create(tenant, input) {
      if (input.externalCode !== undefined && input.externalCode !== null) {
        const existing = await repository.findByExternalCode(
          tenant.organizationId,
          input.externalCode,
        );
        if (existing !== null) throw externalCodeTaken();
      }
      try {
        const created = await repository.create(tenant.organizationId, input);
        return getOrThrow(tenant.organizationId, created.id);
      } catch (err) {
        if (isUniqueViolation(err)) throw externalCodeTaken();
        throw err;
      }
    },

    async update(tenant, clientId, patch) {
      await getOrThrow(tenant.organizationId, clientId);
      if (patch.externalCode !== undefined && patch.externalCode !== null) {
        const other = await repository.findByExternalCode(
          tenant.organizationId,
          patch.externalCode,
        );
        if (other !== null && other.id !== clientId) throw externalCodeTaken();
      }
      try {
        const updated = await repository.update(tenant.organizationId, clientId, patch);
        if (updated === null) throw notFound();
        return getOrThrow(tenant.organizationId, clientId);
      } catch (err) {
        if (isUniqueViolation(err)) throw externalCodeTaken();
        throw err;
      }
    },

    async archive(tenant, clientId) {
      const client = await getOrThrow(tenant.organizationId, clientId);
      if (client.status === 'archived') return client;
      const updated = await repository.update(tenant.organizationId, clientId, {
        status: 'archived',
      });
      if (updated === null) throw notFound();
      return getOrThrow(tenant.organizationId, clientId);
    },

    async filterOptions(tenant) {
      return repository.filterOptions(tenant.organizationId);
    },
  };
}
