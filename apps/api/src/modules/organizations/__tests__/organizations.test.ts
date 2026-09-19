/**
 * Rotas de sessão e organizações com dublês: validação de token e persistência em memória.
 * O contrato com o banco real fica em organizations.integration.test.ts.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFakeOrganizationsRepository,
  type FakeOrganizationsRepository,
} from './fake-repository.js';
import { createApp } from '../../../app.js';
import { parseApiEnv } from '../../../config/env.js';

import type { DbClient } from '../../../infrastructure/db/index.js';
import type { SupabaseClients } from '../../../infrastructure/supabase.js';
import type { AuthUser } from '../../../middleware/auth.js';

const env = parseApiEnv({ NODE_ENV: 'test' });

const ANA: AuthUser = { userId: '11111111-1111-4111-8111-111111111111', email: 'ana@example.com' };
const BIA: AuthUser = { userId: '22222222-2222-4222-8222-222222222222', email: 'bia@example.com' };
const CAIO: AuthUser = {
  userId: '33333333-3333-4333-8333-333333333333',
  email: 'caio@example.com',
};

/** Tokens de teste: "token-<nome>" resolve para o usuário correspondente. */
const USERS: Record<string, AuthUser> = { ana: ANA, bia: BIA, caio: CAIO };
const getUser = async (token: string): Promise<AuthUser | null> =>
  USERS[token.replace(/^token-/, '')] ?? null;

const db: DbClient = {
  isConfigured: false,
  getDb: () => {
    throw new Error('o repositório em memória não usa o banco');
  },
  ping: async () => {},
  close: async () => {},
};

const inviteUserByEmail = vi.fn();
const createUser = vi.fn();
const supabase: SupabaseClients = {
  isConfigured: true,
  getAdmin: () => ({ auth: { admin: { inviteUserByEmail, createUser } } }) as never,
  getAnon: () => {
    throw new Error('não usado: getUser é um dublê');
  },
};

let repository: FakeOrganizationsRepository;

function app() {
  return createApp(env, { db, supabase, apiV1: { getUser, organizationsRepository: repository } });
}

const as = (name: string) => ({ Authorization: `Bearer token-${name}` });

beforeEach(() => {
  repository = createFakeOrganizationsRepository({
    authUsers: [
      { id: ANA.userId, email: ANA.email ?? '' },
      { id: BIA.userId, email: BIA.email ?? '' },
      { id: CAIO.userId, email: CAIO.email ?? '' },
    ],
  });
  inviteUserByEmail.mockReset();
  createUser.mockReset();
});

describe('GET /api/v1/me', () => {
  it('responde 401 sem token', async () => {
    const res = await request(app()).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('responde organization null para quem ainda não tem organização', async () => {
    const res = await request(app()).get('/api/v1/me').set('Authorization', 'Bearer token-ana');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: ANA.userId, email: ANA.email },
      organization: null,
      role: null,
    });
  });

  it('responde a organização e o papel depois do onboarding', async () => {
    await request(app())
      .post('/api/v1/organizations')
      .set('Authorization', 'Bearer token-ana')
      .send({ name: 'Alfa', slug: 'alfa' });

    const res = await request(app()).get('/api/v1/me').set('Authorization', 'Bearer token-ana');
    expect(res.status).toBe(200);
    expect(res.body.organization).toMatchObject({ name: 'Alfa', slug: 'alfa' });
    expect(res.body.role).toBe('owner');
  });
});

describe('POST /api/v1/organizations (onboarding)', () => {
  it('cria a organização e o vínculo owner', async () => {
    const res = await request(app())
      .post('/api/v1/organizations')
      .set('Authorization', 'Bearer token-ana')
      .send({ name: '  Alfa Ltda ', slug: 'alfa-ltda' });
    expect(res.status).toBe(201);
    expect(res.body.organization).toMatchObject({ name: 'Alfa Ltda', slug: 'alfa-ltda' });
    expect(res.body.role).toBe('owner');
    expect(repository.members).toHaveLength(1);
    expect(repository.members[0]).toMatchObject({ authUserId: ANA.userId, role: 'owner' });
  });

  it('valida name e slug com 400 VALIDATION_ERROR', async () => {
    const res = await request(app())
      .post('/api/v1/organizations')
      .set('Authorization', 'Bearer token-ana')
      .send({ name: 'A', slug: 'Alfa Ltda' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = (res.body.error.details as { path: string[] }[]).map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['name', 'slug']));
  });

  it('recusa slug repetido com 409 SLUG_TAKEN', async () => {
    const first = await request(app())
      .post('/api/v1/organizations')
      .set('Authorization', 'Bearer token-ana')
      .send({ name: 'Alfa', slug: 'alfa' });
    expect(first.status).toBe(201);

    const res = await request(app())
      .post('/api/v1/organizations')
      .set('Authorization', 'Bearer token-bia')
      .send({ name: 'Outra Alfa', slug: 'alfa' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLUG_TAKEN');
  });

  it('recusa um segundo onboarding do mesmo usuário', async () => {
    const a = app();
    await request(a)
      .post('/api/v1/organizations')
      .set(as('ana'))
      .send({ name: 'Alfa', slug: 'alfa' });
    const res = await request(a)
      .post('/api/v1/organizations')
      .set(as('ana'))
      .send({ name: 'Beta', slug: 'beta' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_IN_ORGANIZATION');
  });
});

describe('/api/v1/organizations/current', () => {
  it('responde 403 NO_ORGANIZATION sem vínculo', async () => {
    const res = await request(app()).get('/api/v1/organizations/current').set(as('ana'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NO_ORGANIZATION');
  });

  it('PATCH exige owner/admin', async () => {
    const a = app();
    await request(a)
      .post('/api/v1/organizations')
      .set(as('ana'))
      .send({ name: 'Alfa', slug: 'alfa' });
    const org = repository.organizations[0]!;
    repository.members.push({
      id: 'm-caio',
      organizationId: org.id,
      authUserId: CAIO.userId,
      email: null,
      role: 'viewer',
      createdAt: new Date().toISOString(),
    });

    const denied = await request(a)
      .patch('/api/v1/organizations/current')
      .set(as('caio'))
      .send({ name: 'Alfa 2' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    const allowed = await request(a)
      .patch('/api/v1/organizations/current')
      .set(as('ana'))
      .send({ name: 'Alfa 2' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.organization.name).toBe('Alfa 2');
  });

  it('PATCH sem campos responde 400', async () => {
    const a = app();
    await request(a)
      .post('/api/v1/organizations')
      .set(as('ana'))
      .send({ name: 'Alfa', slug: 'alfa' });
    const res = await request(a).patch('/api/v1/organizations/current').set(as('ana')).send({});
    expect(res.status).toBe(400);
  });
});

describe('isolamento entre organizações (§5)', () => {
  it('cada usuário só vê a própria organização e os próprios membros', async () => {
    const a = app();
    await request(a)
      .post('/api/v1/organizations')
      .set(as('ana'))
      .send({ name: 'Alfa', slug: 'alfa' });
    await request(a)
      .post('/api/v1/organizations')
      .set(as('bia'))
      .send({ name: 'Beta', slug: 'beta' });

    const anaOrg = await request(a).get('/api/v1/organizations/current').set(as('ana'));
    const biaOrg = await request(a).get('/api/v1/organizations/current').set(as('bia'));
    expect(anaOrg.body.organization.slug).toBe('alfa');
    expect(biaOrg.body.organization.slug).toBe('beta');

    const anaUsers = await request(a).get('/api/v1/organizations/current/users').set(as('ana'));
    expect(anaUsers.status).toBe(200);
    expect(anaUsers.body.total).toBe(1);
    expect(anaUsers.body.items[0]).toMatchObject({ authUserId: ANA.userId, email: ANA.email });
    expect(anaUsers.body.items.map((m: { authUserId: string }) => m.authUserId)).not.toContain(
      BIA.userId,
    );
  });
});

describe('POST /api/v1/organizations/current/users', () => {
  async function withOwner() {
    const a = app();
    await request(a)
      .post('/api/v1/organizations')
      .set(as('ana'))
      .send({ name: 'Alfa', slug: 'alfa' });
    return a;
  }

  it('vincula um usuário que já existe no Auth (outcome linked) sem chamar o admin', async () => {
    const a = await withOwner();
    const res = await request(a)
      .post('/api/v1/organizations/current/users')
      .set(as('ana'))
      .send({ email: 'BIA@example.com', role: 'analyst' });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe('linked');
    expect(res.body.member).toMatchObject({ authUserId: BIA.userId, role: 'analyst' });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('convida por e-mail quando o usuário não existe (outcome invited)', async () => {
    inviteUserByEmail.mockResolvedValue({
      data: { user: { id: '44444444-4444-4444-8444-444444444444' } },
      error: null,
    });
    const a = await withOwner();
    const res = await request(a)
      .post('/api/v1/organizations/current/users')
      .set(as('ana'))
      .send({ email: 'nova@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe('invited');
    expect(res.body.member.role).toBe('viewer');
    expect(inviteUserByEmail).toHaveBeenCalledWith('nova@example.com');
  });

  it('cria com senha temporária quando ela vem no corpo (outcome created)', async () => {
    createUser.mockResolvedValue({
      data: { user: { id: '55555555-5555-4555-8555-555555555555' } },
      error: null,
    });
    const a = await withOwner();
    const res = await request(a)
      .post('/api/v1/organizations/current/users')
      .set(as('ana'))
      .send({ email: 'temp@example.com', role: 'admin', password: 'Senha-temporaria-1' });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe('created');
    expect(createUser).toHaveBeenCalledWith({
      email: 'temp@example.com',
      password: 'Senha-temporaria-1',
      email_confirm: true,
    });
  });

  it('responde 409 ALREADY_MEMBER para quem já está na organização', async () => {
    const a = await withOwner();
    const res = await request(a)
      .post('/api/v1/organizations/current/users')
      .set(as('ana'))
      .send({ email: 'ana@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MEMBER');
  });

  it('só o owner pode atribuir o papel owner', async () => {
    const a = await withOwner();
    const org = repository.organizations[0]!;
    repository.members.push({
      id: 'm-caio',
      organizationId: org.id,
      authUserId: CAIO.userId,
      email: null,
      role: 'admin',
      createdAt: new Date().toISOString(),
    });
    const res = await request(a)
      .post('/api/v1/organizations/current/users')
      .set(as('caio'))
      .send({ email: 'bia@example.com', role: 'owner' });
    expect(res.status).toBe(403);
  });

  it('viewer não convida (403 FORBIDDEN)', async () => {
    const a = await withOwner();
    const org = repository.organizations[0]!;
    repository.members.push({
      id: 'm-caio',
      organizationId: org.id,
      authUserId: CAIO.userId,
      email: null,
      role: 'viewer',
      createdAt: new Date().toISOString(),
    });
    const res = await request(a)
      .post('/api/v1/organizations/current/users')
      .set(as('caio'))
      .send({ email: 'bia@example.com' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('sem Supabase configurado', () => {
  it('rotas autenticadas respondem 503 SUPABASE_NOT_CONFIGURED em vez de quebrar', async () => {
    const a = createApp(env, { db, apiV1: { organizationsRepository: repository } });
    const res = await request(a).get('/api/v1/me').set('Authorization', 'Bearer qualquer');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SUPABASE_NOT_CONFIGURED');
  });
});
