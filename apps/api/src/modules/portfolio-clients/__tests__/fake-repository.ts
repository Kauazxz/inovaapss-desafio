/**
 * Repositório em memória de clientes para os testes das rotas: mesma interface do Drizzle,
 * sem banco. Compartilha o `ClientsStore` com os dublês de planos e contratos
 * (contracts/__tests__/fake-repository.ts), porque a lista de clientes traz o contrato ativo.
 * Simula a violação de unique do código externo (23505).
 */
import { randomUUID } from 'node:crypto';

import type { Contract, Plan } from '../../contracts/types.js';
import type { PortfolioClientsRepository } from '../repository.js';
import type { PortfolioClient, PortfolioClientWithContract } from '../types.js';

export interface ClientsStore {
  clients: PortfolioClient[];
  plans: Plan[];
  contracts: Contract[];
}

export function createClientsStore(seed: Partial<ClientsStore> = {}): ClientsStore {
  return {
    clients: [...(seed.clients ?? [])],
    plans: [...(seed.plans ?? [])],
    contracts: [...(seed.contracts ?? [])],
  };
}

export function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });
}

export function withActiveContract(
  store: ClientsStore,
  client: PortfolioClient,
): PortfolioClientWithContract {
  const contract = store.contracts.find(
    (c) => c.portfolioClientId === client.id && c.status === 'active',
  );
  return {
    ...client,
    activeContract: contract
      ? {
          id: contract.id,
          planId: contract.planId,
          planName: store.plans.find((p) => p.id === contract.planId)?.name ?? null,
          monthlyValue: contract.monthlyValue,
          currency: contract.currency,
          startDate: contract.startDate,
          endDate: contract.endDate,
          status: contract.status,
          contractedSlaHours: contract.contractedSlaHours,
        }
      : null,
  };
}

/** Nulos sempre no fim, em qualquer direção (o Drizzle usa `nulls last`). */
function compareValues(
  a: string | number | null,
  b: string | number | null,
  factor: number,
): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor;
  return String(a).localeCompare(String(b)) * factor;
}

export function createFakePortfolioClientsRepository(
  store: ClientsStore,
): PortfolioClientsRepository {
  return {
    async list(organizationId, query) {
      const search = query.search?.toLowerCase();
      let rows = store.clients
        .filter((c) => c.organizationId === organizationId)
        .map((c) => withActiveContract(store, c))
        .filter((c) => (query.status ? c.status === query.status : c.status !== 'archived'))
        .filter((c) => query.segment === undefined || c.segment === query.segment)
        .filter((c) => query.size === undefined || c.size === query.size)
        .filter(
          (c) =>
            query.strategic_importance === undefined ||
            c.strategicImportance === query.strategic_importance,
        )
        .filter((c) => query.plan === undefined || c.activeContract?.planName === query.plan)
        .filter(
          (c) =>
            !search ||
            c.name.toLowerCase().includes(search) ||
            (c.externalCode ?? '').toLowerCase().includes(search),
        );

      const key = (c: PortfolioClientWithContract): string | number | null => {
        switch (query.sort) {
          case 'planName':
            return c.activeContract?.planName ?? null;
          case 'monthlyValue':
            return c.activeContract?.monthlyValue ?? null;
          default:
            return c[query.sort];
        }
      };
      const factor = query.order === 'desc' ? -1 : 1;
      rows = [...rows].sort(
        (a, b) => compareValues(key(a), key(b), factor) || a.name.localeCompare(b.name),
      );

      const start = (query.page - 1) * query.pageSize;
      return {
        items: rows.slice(start, start + query.pageSize),
        page: query.page,
        pageSize: query.pageSize,
        total: rows.length,
      };
    },

    async findById(organizationId, clientId) {
      const client = store.clients.find(
        (c) => c.organizationId === organizationId && c.id === clientId,
      );
      return client ? withActiveContract(store, client) : null;
    },

    async findByExternalCode(organizationId, externalCode) {
      return (
        store.clients.find(
          (c) => c.organizationId === organizationId && c.externalCode === externalCode,
        ) ?? null
      );
    },

    async create(organizationId, input) {
      if (
        input.externalCode &&
        store.clients.some(
          (c) => c.organizationId === organizationId && c.externalCode === input.externalCode,
        )
      ) {
        throw uniqueViolation();
      }
      const now = new Date().toISOString();
      const client: PortfolioClient = {
        id: randomUUID(),
        organizationId,
        externalCode: input.externalCode ?? null,
        name: input.name,
        segment: input.segment ?? null,
        size: input.size ?? null,
        status: input.status ?? 'active',
        strategicImportance: input.strategicImportance ?? 3,
        createdAt: now,
        updatedAt: now,
      };
      store.clients.push(client);
      return client;
    },

    async update(organizationId, clientId, patch) {
      const client = store.clients.find(
        (c) => c.organizationId === organizationId && c.id === clientId,
      );
      if (!client) return null;
      if (
        patch.externalCode &&
        store.clients.some(
          (c) =>
            c.organizationId === organizationId &&
            c.externalCode === patch.externalCode &&
            c.id !== clientId,
        )
      ) {
        throw uniqueViolation();
      }
      if (patch.name !== undefined) client.name = patch.name;
      if (patch.externalCode !== undefined) client.externalCode = patch.externalCode;
      if (patch.segment !== undefined) client.segment = patch.segment;
      if (patch.size !== undefined) client.size = patch.size;
      if (patch.status !== undefined) client.status = patch.status;
      if (patch.strategicImportance !== undefined) {
        client.strategicImportance = patch.strategicImportance;
      }
      client.updatedAt = new Date().toISOString();
      return client;
    },

    async filterOptions(organizationId) {
      const mine = store.clients.filter((c) => c.organizationId === organizationId);
      const distinct = (values: (string | null)[]) =>
        [...new Set(values.filter((v): v is string => v !== null))].sort();
      return {
        segments: distinct(mine.map((c) => c.segment)),
        sizes: distinct(mine.map((c) => c.size)),
        plans: store.plans
          .filter((p) => p.organizationId === organizationId)
          .map((p) => p.name)
          .sort(),
        statuses: [...new Set(mine.map((c) => c.status))].sort(),
      };
    },
  };
}
