/**
 * Dublê da API da Etapa 2 para os testes do front: um `fetch` em memória que responde
 * /api/v1/clients, /plans e /contracts com as mesmas regras básicas da API (filtros, paginação,
 * arquivamento, contrato único ativo). Sem Supabase: a página não depende de sessão.
 */
import { vi } from 'vitest';

import type { PortfolioClient } from '../api';
import type { Contract, Plan } from '@/features/contracts/api';

export interface FakeApiStore {
  clients: PortfolioClient[];
  plans: Plan[];
  contracts: Contract[];
}

const NOW = '2026-09-19T00:00:00.000Z';

export function makeClient(overrides: Partial<PortfolioClient> & { id: string; name: string }) {
  const client: PortfolioClient = {
    organizationId: 'org-1',
    externalCode: null,
    segment: null,
    size: null,
    status: 'active',
    strategicImportance: 3,
    createdAt: NOW,
    updatedAt: NOW,
    activeContract: null,
    ...overrides,
  };
  return client;
}

export function makePlan(overrides: Partial<Plan> & { id: string; name: string }): Plan {
  return {
    organizationId: 'org-1',
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeContract(
  overrides: Partial<Contract> & { id: string; portfolioClientId: string },
): Contract {
  return {
    organizationId: 'org-1',
    planId: null,
    planName: null,
    monthlyValue: 1000,
    currency: 'BRL',
    startDate: '2026-01-01',
    endDate: null,
    status: 'active',
    contractedSlaHours: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message, requestId: 'test' } });
}

let nextId = 1;
const newId = (prefix: string) => `${prefix}-${nextId++}`;

function withActiveContract(store: FakeApiStore, client: PortfolioClient): PortfolioClient {
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

export interface FakeApi {
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
  store: FakeApiStore;
  /** Chamadas que não são GET, para os testes conferirem o corpo enviado. */
  writes: () => { method: string; url: string; body: unknown }[];
}

export function createFakeApi(seed: Partial<FakeApiStore> = {}): FakeApi {
  const store: FakeApiStore = {
    clients: [...(seed.clients ?? [])],
    plans: [...(seed.plans ?? [])],
    contracts: [...(seed.contracts ?? [])],
  };
  const writes: { method: string; url: string; body: unknown }[] = [];

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (method !== 'GET') writes.push({ method, url: url.pathname, body });
    const path = url.pathname;

    // ---------- clientes ----------
    if (path === '/api/v1/clients/filter-options') {
      return json(200, {
        segments: [...new Set(store.clients.flatMap((c) => (c.segment ? [c.segment] : [])))],
        sizes: [...new Set(store.clients.flatMap((c) => (c.size ? [c.size] : [])))],
        plans: store.plans.map((p) => p.name),
        statuses: [...new Set(store.clients.map((c) => c.status))],
      });
    }
    if (path === '/api/v1/clients' && method === 'GET') {
      const params = url.searchParams;
      const search = params.get('search')?.toLowerCase();
      const status = params.get('status');
      const segment = params.get('segment');
      const plan = params.get('plan');
      const page = Number(params.get('page') ?? '1');
      const pageSize = Number(params.get('pageSize') ?? '20');
      const sort = params.get('sort') ?? 'name';
      const order = params.get('order') ?? 'asc';
      let rows = store.clients
        .map((c) => withActiveContract(store, c))
        .filter((c) => (status ? c.status === status : c.status !== 'archived'))
        .filter((c) => !segment || c.segment === segment)
        .filter((c) => !plan || c.activeContract?.planName === plan)
        .filter(
          (c) =>
            !search ||
            c.name.toLowerCase().includes(search) ||
            (c.externalCode ?? '').toLowerCase().includes(search),
        );
      const factor = order === 'desc' ? -1 : 1;
      rows = rows.sort((a, b) => {
        if (sort === 'monthlyValue') {
          return (
            ((a.activeContract?.monthlyValue ?? -1) - (b.activeContract?.monthlyValue ?? -1)) *
            factor
          );
        }
        return a.name.localeCompare(b.name) * factor;
      });
      const start = (page - 1) * pageSize;
      return json(200, {
        items: rows.slice(start, start + pageSize),
        page,
        pageSize,
        total: rows.length,
      });
    }
    if (path === '/api/v1/clients' && method === 'POST') {
      if (
        typeof body.externalCode === 'string' &&
        store.clients.some((c) => c.externalCode === body.externalCode)
      ) {
        return error(409, 'EXTERNAL_CODE_TAKEN', 'Já existe um cliente com este código.');
      }
      const client = makeClient({
        id: newId('client'),
        name: String(body.name),
        externalCode: (body.externalCode as string | null) ?? null,
        segment: (body.segment as string | null) ?? null,
        size: (body.size as string | null) ?? null,
        status: (body.status as PortfolioClient['status']) ?? 'active',
        strategicImportance: (body.strategicImportance as number) ?? 3,
      });
      store.clients.push(client);
      return json(201, { client: withActiveContract(store, client) });
    }
    const clientMatch = /^\/api\/v1\/clients\/([^/]+)$/.exec(path);
    if (clientMatch) {
      const client = store.clients.find((c) => c.id === clientMatch[1]);
      if (!client) return error(404, 'NOT_FOUND', 'Cliente não encontrado.');
      if (method === 'GET') return json(200, { client: withActiveContract(store, client) });
      if (method === 'PATCH') {
        Object.assign(client, body);
        return json(200, { client: withActiveContract(store, client) });
      }
      if (method === 'DELETE') {
        client.status = 'archived';
        return json(200, { client: withActiveContract(store, client) });
      }
    }

    // ---------- planos ----------
    if (path === '/api/v1/plans' && method === 'GET') {
      const items = [...store.plans].sort((a, b) => a.name.localeCompare(b.name));
      return json(200, { items, total: items.length });
    }
    if (path === '/api/v1/plans' && method === 'POST') {
      if (store.plans.some((p) => p.name.toLowerCase() === String(body.name).toLowerCase())) {
        return error(409, 'PLAN_NAME_TAKEN', 'Já existe um plano com este nome.');
      }
      const plan = makePlan({
        id: newId('plan'),
        name: String(body.name),
        description: (body.description as string | null) ?? null,
      });
      store.plans.push(plan);
      return json(201, { plan });
    }
    const planMatch = /^\/api\/v1\/plans\/([^/]+)$/.exec(path);
    if (planMatch && method === 'PATCH') {
      const plan = store.plans.find((p) => p.id === planMatch[1]);
      if (!plan) return error(404, 'NOT_FOUND', 'Plano não encontrado.');
      Object.assign(plan, body);
      return json(200, { plan });
    }

    // ---------- contratos ----------
    const withPlanName = (contract: Contract): Contract => ({
      ...contract,
      planName: store.plans.find((p) => p.id === contract.planId)?.name ?? null,
    });
    if (path === '/api/v1/contracts' && method === 'GET') {
      const clientId = url.searchParams.get('clientId');
      const items = store.contracts
        .filter((c) => !clientId || c.portfolioClientId === clientId)
        .map(withPlanName)
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
      return json(200, { items, page: 1, pageSize: 100, total: items.length });
    }
    if (path === '/api/v1/contracts' && method === 'POST') {
      const clientId = String(body.portfolioClientId);
      for (const existing of store.contracts) {
        if (existing.portfolioClientId === clientId && existing.status === 'active') {
          existing.status = 'ended';
          existing.endDate = String(body.startDate);
        }
      }
      const contract = makeContract({
        id: newId('contract'),
        portfolioClientId: clientId,
        planId: (body.planId as string | null) ?? null,
        monthlyValue: Number(body.monthlyValue),
        currency: (body.currency as string) ?? 'BRL',
        startDate: String(body.startDate),
        endDate: (body.endDate as string | null) ?? null,
        contractedSlaHours: (body.contractedSlaHours as number | null) ?? null,
      });
      store.contracts.push(contract);
      return json(201, { contract: withPlanName(contract) });
    }
    const contractMatch = /^\/api\/v1\/contracts\/([^/]+)$/.exec(path);
    if (contractMatch && method === 'PATCH') {
      const contract = store.contracts.find((c) => c.id === contractMatch[1]);
      if (!contract) return error(404, 'NOT_FOUND', 'Contrato não encontrado.');
      Object.assign(contract, body);
      return json(200, { contract: withPlanName(contract) });
    }

    return error(404, 'NOT_FOUND', `Rota ${method} ${path} não encontrada.`);
  });

  return { fetch: fetchMock, store, writes: () => writes };
}
