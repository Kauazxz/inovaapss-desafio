/**
 * Dublê da API das configurações: um `fetch` em memória que responde /organizations/current,
 * /organizations/current/users (com as mesmas proteções do service: só owner nomeia owner,
 * ninguém se remove, a organização nunca fica sem owner), /plans e /contracts.
 */
import { vi } from 'vitest';

import type { OrganizationRole } from '@inovaapss/shared';

import type { OrganizationMember } from '../api';
import type { Contract, Plan } from '@/features/contracts/api';

const NOW = '2026-09-20T00:00:00.000Z';

export interface FakeSettingsStore {
  organization: { id: string; name: string; slug: string; createdAt: string; updatedAt: string };
  members: OrganizationMember[];
  plans: Plan[];
  contracts: Contract[];
  /** Quem está usando a tela (o `me` do AuthProvider). */
  currentUserId: string;
  currentRole: OrganizationRole;
}

export function makeMember(
  overrides: Partial<OrganizationMember> & { id: string; authUserId: string },
): OrganizationMember {
  return {
    organizationId: 'org-1',
    email: null,
    role: 'viewer',
    createdAt: NOW,
    ...overrides,
  };
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

function fail(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message, requestId: 'test' } });
}

export interface FakeSettingsApi {
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
  store: FakeSettingsStore;
  /** Chamadas que não são GET, para os testes conferirem o corpo enviado. */
  writes: () => { method: string; url: string; body: unknown }[];
}

let nextId = 1;

export function createFakeSettingsApi(seed: Partial<FakeSettingsStore> = {}): FakeSettingsApi {
  const store: FakeSettingsStore = {
    organization: seed.organization ?? {
      id: 'org-1',
      name: 'GlobalSys',
      slug: 'globalsys',
      createdAt: NOW,
      updatedAt: NOW,
    },
    members: [...(seed.members ?? [])],
    plans: [...(seed.plans ?? [])],
    contracts: [...(seed.contracts ?? [])],
    currentUserId: seed.currentUserId ?? 'user-owner',
    currentRole: seed.currentRole ?? 'owner',
  };
  const writes: { method: string; url: string; body: unknown }[] = [];

  const owners = () => store.members.filter((m) => m.role === 'owner').length;

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (method !== 'GET') writes.push({ method, url: url.pathname, body });
    const path = url.pathname;

    // ---------- organização ----------
    if (path === '/api/v1/organizations/current' && method === 'GET') {
      return json(200, { organization: store.organization, role: store.currentRole });
    }
    if (path === '/api/v1/organizations/current' && method === 'PATCH') {
      if (typeof body.slug === 'string' && body.slug === 'ocupado') {
        return fail(409, 'SLUG_TAKEN', 'Já existe uma organização com este slug.');
      }
      Object.assign(store.organization, body, { updatedAt: NOW });
      return json(200, { organization: store.organization, role: store.currentRole });
    }

    // ---------- usuários ----------
    if (path === '/api/v1/organizations/current/users' && method === 'GET') {
      return json(200, { items: store.members, total: store.members.length });
    }
    if (path === '/api/v1/organizations/current/users' && method === 'POST') {
      const email = String(body.email);
      const role = (body.role as OrganizationRole) ?? 'viewer';
      if (role === 'owner' && store.currentRole !== 'owner') {
        return fail(403, 'FORBIDDEN', 'Somente o owner pode atribuir o papel "owner".');
      }
      if (store.members.some((m) => m.email === email)) {
        return fail(409, 'ALREADY_MEMBER', 'Este usuário já faz parte da organização.');
      }
      const member = makeMember({
        id: `member-${nextId++}`,
        authUserId: `auth-${nextId++}`,
        email,
        role,
      });
      store.members.push(member);
      return json(201, { member });
    }

    const memberMatch = /^\/api\/v1\/organizations\/current\/users\/([^/]+)$/.exec(path);
    if (memberMatch) {
      const authUserId = memberMatch[1]!;
      const member = store.members.find((m) => m.authUserId === authUserId);
      if (!member) {
        return fail(404, 'NOT_FOUND', 'Este usuário não faz parte da organização.');
      }
      if (method === 'PATCH') {
        const role = body.role as OrganizationRole;
        if (role === 'owner' && store.currentRole !== 'owner') {
          return fail(403, 'FORBIDDEN', 'Somente o owner pode atribuir o papel "owner".');
        }
        if (member.role === 'owner') {
          if (store.currentRole !== 'owner') {
            return fail(403, 'FORBIDDEN', 'Somente o owner pode mudar o papel de outro owner.');
          }
          if (role !== 'owner' && owners() <= 1) {
            return fail(
              409,
              'LAST_OWNER',
              'A organização precisa de pelo menos um owner. Promova outra pessoa a owner antes.',
            );
          }
        }
        member.role = role;
        return json(200, { member });
      }
      if (method === 'DELETE') {
        if (authUserId === store.currentUserId) {
          return fail(
            403,
            'CANNOT_CHANGE_SELF',
            'Você não pode remover o seu próprio acesso. Peça a outro owner ou admin.',
          );
        }
        if (member.role === 'owner') {
          if (store.currentRole !== 'owner') {
            return fail(403, 'FORBIDDEN', 'Somente o owner pode remover outro owner.');
          }
          if (owners() <= 1) {
            return fail(
              409,
              'LAST_OWNER',
              'A organização precisa de pelo menos um owner. Promova outra pessoa a owner antes.',
            );
          }
        }
        store.members = store.members.filter((m) => m.authUserId !== authUserId);
        return new Response(null, { status: 204 });
      }
    }

    // ---------- planos e contratos ----------
    if (path === '/api/v1/plans' && method === 'GET') {
      const items = [...store.plans].sort((a, b) => a.name.localeCompare(b.name));
      return json(200, { items, total: items.length });
    }
    if (path === '/api/v1/contracts' && method === 'GET') {
      const page = Number(url.searchParams.get('page') ?? '1');
      const pageSize = Number(url.searchParams.get('pageSize') ?? '100');
      const start = (page - 1) * pageSize;
      return json(200, {
        items: store.contracts.slice(start, start + pageSize),
        page,
        pageSize,
        total: store.contracts.length,
      });
    }

    return fail(404, 'NOT_FOUND', `Rota ${method} ${path} não encontrada.`);
  });

  return { fetch: fetchMock, store, writes: () => writes };
}
