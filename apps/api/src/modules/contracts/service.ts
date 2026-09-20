/**
 * Casos de uso de planos e contratos (§4, §37, docs/CLIENTS.md).
 *
 * Regras:
 * - plano com nome único por organização (409 PLAN_NAME_TAKEN);
 * - contrato só para cliente da própria organização (404 se não existir) e plano da própria
 *   organização (404 PLAN_NOT_FOUND);
 * - UM contrato `active` por cliente: criar/reativar um encerra o anterior (`ended`);
 * - `endContract` = PATCH status `ended` com data de término (padrão: hoje).
 */
import { ConflictError } from '../../middleware/http-errors.js';
import { AppError, NotFoundError } from '../../shared/errors.js';

import type { ContractsRepository, PlansRepository } from './repository.js';
import type {
  Contract,
  CreateContractInput,
  CreatePlanInput,
  ListContractsQuery,
  PaginatedContracts,
  Plan,
  UpdateContractInput,
  UpdatePlanInput,
} from './types.js';
import type { TenantContext } from '../../middleware/tenant.js';

/** O que o módulo precisa saber de clientes: só se o cliente existe na organização. */
export interface ClientLookup {
  findById(organizationId: string, clientId: string): Promise<{ id: string } | null>;
}

export interface PlansService {
  list(tenant: TenantContext): Promise<Plan[]>;
  get(tenant: TenantContext, planId: string): Promise<Plan>;
  create(tenant: TenantContext, input: CreatePlanInput): Promise<Plan>;
  update(tenant: TenantContext, planId: string, patch: UpdatePlanInput): Promise<Plan>;
}

export interface ContractsService {
  list(tenant: TenantContext, query: ListContractsQuery): Promise<PaginatedContracts>;
  get(tenant: TenantContext, contractId: string): Promise<Contract>;
  create(tenant: TenantContext, input: CreateContractInput): Promise<Contract>;
  update(tenant: TenantContext, contractId: string, patch: UpdateContractInput): Promise<Contract>;
}

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

function planNameTaken(): ConflictError {
  return new ConflictError(
    'Já existe um plano com este nome nesta organização.',
    'PLAN_NAME_TAKEN',
  );
}

export function createPlansService(repository: PlansRepository): PlansService {
  async function getOrThrow(organizationId: string, planId: string): Promise<Plan> {
    const plan = await repository.findById(organizationId, planId);
    if (plan === null) throw new NotFoundError('Plano não encontrado.');
    return plan;
  }

  return {
    async list(tenant) {
      return repository.list(tenant.organizationId);
    },

    async get(tenant, planId) {
      return getOrThrow(tenant.organizationId, planId);
    },

    async create(tenant, input) {
      if ((await repository.findByName(tenant.organizationId, input.name)) !== null) {
        throw planNameTaken();
      }
      try {
        return await repository.create(tenant.organizationId, input);
      } catch (err) {
        if (isUniqueViolation(err)) throw planNameTaken();
        throw err;
      }
    },

    async update(tenant, planId, patch) {
      await getOrThrow(tenant.organizationId, planId);
      if (patch.name !== undefined) {
        const other = await repository.findByName(tenant.organizationId, patch.name);
        if (other !== null && other.id !== planId) throw planNameTaken();
      }
      try {
        const updated = await repository.update(tenant.organizationId, planId, patch);
        if (updated === null) throw new NotFoundError('Plano não encontrado.');
        return updated;
      } catch (err) {
        if (isUniqueViolation(err)) throw planNameTaken();
        throw err;
      }
    },
  };
}

export interface ContractsServiceDeps {
  repository: ContractsRepository;
  plans: PlansRepository;
  clients: ClientLookup;
}

export function createContractsService({
  repository,
  plans,
  clients,
}: ContractsServiceDeps): ContractsService {
  async function getOrThrow(organizationId: string, contractId: string): Promise<Contract> {
    const contract = await repository.findById(organizationId, contractId);
    if (contract === null) throw new NotFoundError('Contrato não encontrado.');
    return contract;
  }

  async function assertPlan(organizationId: string, planId: string | null | undefined) {
    if (planId === undefined || planId === null) return;
    if ((await plans.findById(organizationId, planId)) === null) {
      throw new AppError(404, 'PLAN_NOT_FOUND', 'Plano não encontrado nesta organização.');
    }
  }

  return {
    async list(tenant, query) {
      return repository.list(tenant.organizationId, query);
    },

    async get(tenant, contractId) {
      return getOrThrow(tenant.organizationId, contractId);
    },

    async create(tenant, input) {
      const client = await clients.findById(tenant.organizationId, input.portfolioClientId);
      if (client === null) throw new NotFoundError('Cliente não encontrado.');
      await assertPlan(tenant.organizationId, input.planId);
      try {
        return await repository.createActivating(tenant.organizationId, input);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError(
            'Este cliente já tem um contrato ativo. Encerre-o antes de ativar outro.',
            'ACTIVE_CONTRACT_EXISTS',
          );
        }
        throw err;
      }
    },

    async update(tenant, contractId, patch) {
      await getOrThrow(tenant.organizationId, contractId);
      await assertPlan(tenant.organizationId, patch.planId);
      try {
        const updated = await repository.updateActivating(tenant.organizationId, contractId, patch);
        if (updated === null) throw new NotFoundError('Contrato não encontrado.');
        return updated;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError(
            'Este cliente já tem um contrato ativo. Encerre-o antes de ativar outro.',
            'ACTIVE_CONTRACT_EXISTS',
          );
        }
        throw err;
      }
    },
  };
}
