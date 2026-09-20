/**
 * Repositórios em memória de planos e contratos para os testes das rotas. Usam o mesmo
 * `ClientsStore` do dublê de clientes. Simulam a violação de unique (nome do plano e o índice
 * parcial de contrato ativo).
 */
import { randomUUID } from 'node:crypto';

import {
  type ClientsStore,
  uniqueViolation,
} from '../../portfolio-clients/__tests__/fake-repository.js';

import type { ContractsRepository, PlansRepository } from '../repository.js';
import type { Contract, Plan } from '../types.js';

export function createFakePlansRepository(store: ClientsStore): PlansRepository {
  return {
    async list(organizationId) {
      return store.plans
        .filter((p) => p.organizationId === organizationId)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async findById(organizationId, planId) {
      return (
        store.plans.find((p) => p.organizationId === organizationId && p.id === planId) ?? null
      );
    },

    async findByName(organizationId, name) {
      return (
        store.plans.find(
          (p) => p.organizationId === organizationId && p.name.toLowerCase() === name.toLowerCase(),
        ) ?? null
      );
    },

    async create(organizationId, input) {
      if (store.plans.some((p) => p.organizationId === organizationId && p.name === input.name)) {
        throw uniqueViolation();
      }
      const now = new Date().toISOString();
      const plan: Plan = {
        id: randomUUID(),
        organizationId,
        name: input.name,
        description: input.description ?? null,
        createdAt: now,
        updatedAt: now,
      };
      store.plans.push(plan);
      return plan;
    },

    async update(organizationId, planId, patch) {
      const plan = store.plans.find((p) => p.organizationId === organizationId && p.id === planId);
      if (!plan) return null;
      if (patch.name !== undefined) plan.name = patch.name;
      if (patch.description !== undefined) plan.description = patch.description;
      plan.updatedAt = new Date().toISOString();
      return plan;
    },
  };
}

function withPlanName(store: ClientsStore, contract: Contract): Contract {
  return {
    ...contract,
    planName: store.plans.find((p) => p.id === contract.planId)?.name ?? null,
  };
}

function endActive(
  store: ClientsStore,
  organizationId: string,
  clientId: string,
  newStartDate: string,
  exceptId?: string,
): void {
  for (const contract of store.contracts) {
    if (
      contract.organizationId === organizationId &&
      contract.portfolioClientId === clientId &&
      contract.status === 'active' &&
      contract.id !== exceptId
    ) {
      contract.status = 'ended';
      contract.endDate =
        contract.endDate === null || contract.endDate > newStartDate
          ? newStartDate
          : contract.endDate;
      contract.updatedAt = new Date().toISOString();
    }
  }
}

export function createFakeContractsRepository(store: ClientsStore): ContractsRepository {
  return {
    async list(organizationId, query) {
      const rows = store.contracts
        .filter((c) => c.organizationId === organizationId)
        .filter((c) => query.clientId === undefined || c.portfolioClientId === query.clientId)
        .filter((c) => query.status === undefined || c.status === query.status)
        .map((c) => withPlanName(store, c));
      const factor = query.order === 'desc' ? -1 : 1;
      rows.sort((a, b) => {
        const left = a[query.sort];
        const right = b[query.sort];
        // Nulos sempre no fim, em qualquer direção (o Drizzle usa `nulls last`).
        if (left === null) return right === null ? 0 : 1;
        if (right === null) return -1;
        if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
        return String(left).localeCompare(String(right)) * factor;
      });
      const start = (query.page - 1) * query.pageSize;
      return {
        items: rows.slice(start, start + query.pageSize),
        page: query.page,
        pageSize: query.pageSize,
        total: rows.length,
      };
    },

    async findById(organizationId, contractId) {
      const contract = store.contracts.find(
        (c) => c.organizationId === organizationId && c.id === contractId,
      );
      return contract ? withPlanName(store, contract) : null;
    },

    async findActiveByClient(organizationId, clientId) {
      const contract = store.contracts.find(
        (c) =>
          c.organizationId === organizationId &&
          c.portfolioClientId === clientId &&
          c.status === 'active',
      );
      return contract ? withPlanName(store, contract) : null;
    },

    async createActivating(organizationId, input) {
      const status = input.status ?? 'active';
      if (status === 'active') {
        endActive(store, organizationId, input.portfolioClientId, input.startDate);
      }
      const now = new Date().toISOString();
      const contract: Contract = {
        id: randomUUID(),
        organizationId,
        portfolioClientId: input.portfolioClientId,
        planId: input.planId ?? null,
        planName: null,
        monthlyValue: input.monthlyValue,
        currency: input.currency ?? 'BRL',
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        status,
        contractedSlaHours: input.contractedSlaHours ?? null,
        createdAt: now,
        updatedAt: now,
      };
      store.contracts.push(contract);
      return withPlanName(store, contract);
    },

    async updateActivating(organizationId, contractId, patch) {
      const contract = store.contracts.find(
        (c) => c.organizationId === organizationId && c.id === contractId,
      );
      if (!contract) return null;
      if (patch.status === 'active' && contract.status !== 'active') {
        endActive(
          store,
          organizationId,
          contract.portfolioClientId,
          patch.startDate ?? contract.startDate,
          contractId,
        );
      }
      if (patch.planId !== undefined) contract.planId = patch.planId;
      if (patch.monthlyValue !== undefined) contract.monthlyValue = patch.monthlyValue;
      if (patch.currency !== undefined) contract.currency = patch.currency;
      if (patch.startDate !== undefined) contract.startDate = patch.startDate;
      if (patch.endDate !== undefined) contract.endDate = patch.endDate;
      if (patch.status !== undefined) contract.status = patch.status;
      if (patch.contractedSlaHours !== undefined) {
        contract.contractedSlaHours = patch.contractedSlaHours;
      }
      contract.updatedAt = new Date().toISOString();
      return withPlanName(store, contract);
    },
  };
}
