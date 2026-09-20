/**
 * Montagem do app para os testes da Etapa 2 com dublês: token de teste, organizações e
 * membros em memória e o `ClientsStore` compartilhado entre clientes, planos e contratos.
 *
 * Organizações: Alfa (ana = owner, caio = viewer, dani = analyst) e Beta (bia = owner).
 * Tokens: "token-<nome>".
 */
import type { OrganizationRole } from '@inovaapss/shared';

import { createClientsStore, createFakePortfolioClientsRepository } from './fake-repository.js';
import { createApp } from '../../../app.js';
import { parseApiEnv } from '../../../config/env.js';
import {
  createFakeContractsRepository,
  createFakePlansRepository,
} from '../../contracts/__tests__/fake-repository.js';
import { createFakeOrganizationsRepository } from '../../organizations/__tests__/fake-repository.js';

import type { ClientsStore } from './fake-repository.js';
import type { DbClient } from '../../../infrastructure/db/index.js';
import type { SupabaseClients } from '../../../infrastructure/supabase.js';
import type { AuthUser } from '../../../middleware/auth.js';
import type { ApiV1Dependencies } from '../../../routes/api-v1.js';

const env = parseApiEnv({ NODE_ENV: 'test' });

export const ALFA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const BETA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const USERS: Record<string, AuthUser & { organizationId: string; role: OrganizationRole }> = {
  ana: {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'ana@example.com',
    organizationId: ALFA_ID,
    role: 'owner',
  },
  bia: {
    userId: '22222222-2222-4222-8222-222222222222',
    email: 'bia@example.com',
    organizationId: BETA_ID,
    role: 'owner',
  },
  caio: {
    userId: '33333333-3333-4333-8333-333333333333',
    email: 'caio@example.com',
    organizationId: ALFA_ID,
    role: 'viewer',
  },
  dani: {
    userId: '44444444-4444-4444-8444-444444444444',
    email: 'dani@example.com',
    organizationId: ALFA_ID,
    role: 'analyst',
  },
};

const getUser = async (token: string): Promise<AuthUser | null> => {
  const user = USERS[token.replace(/^token-/, '')];
  return user ? { userId: user.userId, email: user.email } : null;
};

const db: DbClient = {
  isConfigured: false,
  getDb: () => {
    throw new Error('os repositórios em memória não usam o banco');
  },
  ping: async () => {},
  close: async () => {},
};

const supabase: SupabaseClients = {
  isConfigured: true,
  getAdmin: () => {
    throw new Error('não usado nos testes da Etapa 2');
  },
  getAnon: () => {
    throw new Error('não usado: getUser é um dublê');
  },
};

/** Cabeçalho Authorization de um usuário de teste. */
export const as = (name: keyof typeof USERS) => ({ Authorization: `Bearer token-${name}` });

export interface TestApp {
  app: ReturnType<typeof createApp>;
  store: ClientsStore;
}

export function createTestApp(seed: Partial<ClientsStore> = {}): TestApp {
  const now = '2026-09-19T00:00:00.000Z';
  const organizationsRepository = createFakeOrganizationsRepository({
    organizations: [
      { id: ALFA_ID, name: 'Alfa', slug: 'alfa', createdAt: now, updatedAt: now },
      { id: BETA_ID, name: 'Beta', slug: 'beta', createdAt: now, updatedAt: now },
    ],
    members: Object.values(USERS).map((user, index) => ({
      id: `member-${index}`,
      organizationId: user.organizationId,
      authUserId: user.userId,
      email: user.email,
      role: user.role,
      createdAt: now,
    })),
  });
  const store = createClientsStore(seed);
  const apiV1: Partial<ApiV1Dependencies> = {
    getUser,
    organizationsRepository,
    portfolioClientsRepository: createFakePortfolioClientsRepository(store),
    plansRepository: createFakePlansRepository(store),
    contractsRepository: createFakeContractsRepository(store),
  };
  return { app: createApp(env, { db, supabase, apiV1 }), store };
}
