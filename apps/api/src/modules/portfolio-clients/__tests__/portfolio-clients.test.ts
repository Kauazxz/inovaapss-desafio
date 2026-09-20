/**
 * Rotas /api/v1/clients com dublês (token e repositórios em memória): CRUD, filtros §61,
 * paginação, ordenação, arquivamento, RBAC e isolamento entre organizações.
 * O contrato com o banco real fica em portfolio-clients.integration.test.ts.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { ALFA_ID, as, BETA_ID, createTestApp } from './test-app.js';

import type { Contract, Plan } from '../../contracts/types.js';
import type { PortfolioClient } from '../types.js';

const NOW = '2026-09-19T00:00:00.000Z';

function client(
  organizationId: string,
  id: string,
  name: string,
  extra: Partial<PortfolioClient> = {},
): PortfolioClient {
  return {
    id,
    organizationId,
    externalCode: null,
    name,
    segment: null,
    size: null,
    status: 'active',
    strategicImportance: 3,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

const PLAN_PREMIUM: Plan = {
  id: 'p1p1p1p1-0000-4000-8000-000000000001',
  organizationId: ALFA_ID,
  name: 'Premium',
  description: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const C1 = '0c000000-0000-4000-8000-000000000001';
const C2 = '0c000000-0000-4000-8000-000000000002';
const C3 = '0c000000-0000-4000-8000-000000000003';
const C4 = '0c000000-0000-4000-8000-000000000004';
const CB = '0c000000-0000-4000-8000-0000000000bb';

function contract(id: string, clientId: string, extra: Partial<Contract> = {}): Contract {
  return {
    id,
    organizationId: ALFA_ID,
    portfolioClientId: clientId,
    planId: PLAN_PREMIUM.id,
    planName: null,
    monthlyValue: 1500,
    currency: 'BRL',
    startDate: '2026-01-01',
    endDate: null,
    status: 'active',
    contractedSlaHours: 24,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function seededApp() {
  return createTestApp({
    clients: [
      client(ALFA_ID, C1, 'Alfa Tech', { externalCode: 'CLI-001', segment: 'Varejo', size: 'PME' }),
      client(ALFA_ID, C2, 'Beta Log', {
        externalCode: 'CLI-002',
        segment: 'Logística',
        size: 'Grande',
      }),
      client(ALFA_ID, C3, 'Gama Saúde', {
        externalCode: 'CLI-003',
        segment: 'Saúde',
        size: 'PME',
        strategicImportance: 5,
      }),
      client(ALFA_ID, C4, 'Delta Antiga', { externalCode: 'CLI-004', status: 'archived' }),
      client(BETA_ID, CB, 'Cliente da Beta', { externalCode: 'CLI-001' }),
    ],
    plans: [PLAN_PREMIUM],
    contracts: [
      contract('c0000000-0000-4000-8000-000000000001', C1, { monthlyValue: 1500 }),
      contract('c0000000-0000-4000-8000-000000000002', C2, { monthlyValue: 9000, planId: null }),
    ],
  });
}

describe('guardas', () => {
  it('GET /clients sem token responde 401', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/clients');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('viewer lê mas não escreve (403 FORBIDDEN)', async () => {
    const { app } = seededApp();
    const list = await request(app).get('/api/v1/clients').set(as('caio'));
    expect(list.status).toBe(200);

    const create = await request(app)
      .post('/api/v1/clients')
      .set(as('caio'))
      .send({ name: 'Novo' });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('FORBIDDEN');

    const patch = await request(app)
      .patch(`/api/v1/clients/${C1}`)
      .set(as('caio'))
      .send({ name: 'Outro' });
    expect(patch.status).toBe(403);

    const del = await request(app).delete(`/api/v1/clients/${C1}`).set(as('caio'));
    expect(del.status).toBe(403);
  });

  it('analyst escreve', async () => {
    const { app } = seededApp();
    const res = await request(app)
      .post('/api/v1/clients')
      .set(as('dani'))
      .send({ name: 'Criado pela analista' });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/v1/clients', () => {
  it('lista os clientes da organização com o contrato ativo e o plano, escondendo arquivados', async () => {
    const { app } = seededApp();
    const res = await request(app).get('/api/v1/clients').set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 3 });
    const names = res.body.items.map((c: { name: string }) => c.name);
    expect(names).toEqual(['Alfa Tech', 'Beta Log', 'Gama Saúde']);
    const alfa = res.body.items[0];
    expect(alfa.activeContract).toMatchObject({
      planName: 'Premium',
      monthlyValue: 1500,
      currency: 'BRL',
      contractedSlaHours: 24,
    });
    expect(res.body.items[2].activeContract).toBeNull();
  });

  it('não mistura organizações (§5)', async () => {
    const { app } = seededApp();
    const res = await request(app).get('/api/v1/clients').set(as('bia'));
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].name).toBe('Cliente da Beta');
  });

  it('busca por nome ou código', async () => {
    const { app } = seededApp();
    const byName = await request(app).get('/api/v1/clients?search=gama').set(as('ana'));
    expect(byName.body.items.map((c: { name: string }) => c.name)).toEqual(['Gama Saúde']);
    const byCode = await request(app).get('/api/v1/clients?search=CLI-002').set(as('ana'));
    expect(byCode.body.items.map((c: { name: string }) => c.name)).toEqual(['Beta Log']);
  });

  it('filtra por status, segmento, porte, plano e importância estratégica (§61)', async () => {
    const { app } = seededApp();
    const archived = await request(app).get('/api/v1/clients?status=archived').set(as('ana'));
    expect(archived.body.items.map((c: { name: string }) => c.name)).toEqual(['Delta Antiga']);

    const segment = await request(app).get('/api/v1/clients?segment=Saúde').set(as('ana'));
    expect(segment.body.total).toBe(1);

    const size = await request(app).get('/api/v1/clients?size=PME').set(as('ana'));
    expect(size.body.total).toBe(2);

    const plan = await request(app).get('/api/v1/clients?plan=Premium').set(as('ana'));
    expect(plan.body.items.map((c: { name: string }) => c.name)).toEqual(['Alfa Tech']);

    const importance = await request(app)
      .get('/api/v1/clients?strategic_importance=5')
      .set(as('ana'));
    expect(importance.body.items.map((c: { name: string }) => c.name)).toEqual(['Gama Saúde']);
  });

  it('pagina e ordena', async () => {
    const { app } = seededApp();
    const page2 = await request(app).get('/api/v1/clients?page=2&pageSize=2').set(as('ana'));
    expect(page2.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(page2.body.items).toHaveLength(1);

    const byValue = await request(app)
      .get('/api/v1/clients?sort=monthlyValue&order=desc')
      .set(as('ana'));
    expect(byValue.body.items.map((c: { name: string }) => c.name)).toEqual([
      'Beta Log',
      'Alfa Tech',
      'Gama Saúde',
    ]);
  });

  it('recusa query inválida com 400', async () => {
    const { app } = seededApp();
    const res = await request(app).get('/api/v1/clients?sort=drop_table').set(as('ana'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /clients/filter-options devolve os valores da organização', async () => {
    const { app } = seededApp();
    const res = await request(app).get('/api/v1/clients/filter-options').set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      segments: ['Logística', 'Saúde', 'Varejo'],
      sizes: ['Grande', 'PME'],
      plans: ['Premium'],
      statuses: ['active', 'archived'],
    });
  });
});

describe('POST /api/v1/clients', () => {
  it('cria com os padrões (status active, importância 3) e devolve o cliente sem contrato', async () => {
    const { app, store } = createTestApp();
    const res = await request(app)
      .post('/api/v1/clients')
      .set(as('ana'))
      .send({ name: '  Nova Empresa ', externalCode: 'X-1', segment: '' });
    expect(res.status).toBe(201);
    expect(res.body.client).toMatchObject({
      name: 'Nova Empresa',
      externalCode: 'X-1',
      segment: null,
      status: 'active',
      strategicImportance: 3,
      organizationId: ALFA_ID,
      activeContract: null,
    });
    expect(store.clients).toHaveLength(1);
  });

  it('valida nome e importância com 400', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/v1/clients')
      .set(as('ana'))
      .send({ name: 'A', strategicImportance: 9 });
    expect(res.status).toBe(400);
    const paths = (res.body.error.details as { path: string[] }[]).map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['name', 'strategicImportance']));
  });

  it('recusa código externo repetido na mesma organização (409), mas aceita em outra', async () => {
    const { app } = seededApp();
    const dup = await request(app)
      .post('/api/v1/clients')
      .set(as('ana'))
      .send({ name: 'Repetido', externalCode: 'CLI-001' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EXTERNAL_CODE_TAKEN');

    const other = await request(app)
      .post('/api/v1/clients')
      .set(as('bia'))
      .send({ name: 'Na Beta', externalCode: 'CLI-003' });
    expect(other.status).toBe(201);
  });
});

describe('GET, PATCH e DELETE /api/v1/clients/:id', () => {
  it('devolve o cliente com contrato ativo e plano', async () => {
    const { app } = seededApp();
    const res = await request(app).get(`/api/v1/clients/${C1}`).set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.client.name).toBe('Alfa Tech');
    expect(res.body.client.activeContract.planName).toBe('Premium');
  });

  it('responde 404 para cliente de outra organização ou inexistente', async () => {
    const { app } = seededApp();
    const foreign = await request(app).get(`/api/v1/clients/${CB}`).set(as('ana'));
    expect(foreign.status).toBe(404);
    const missing = await request(app)
      .get('/api/v1/clients/00000000-0000-4000-8000-000000000000')
      .set(as('ana'));
    expect(missing.status).toBe(404);
    const invalid = await request(app).get('/api/v1/clients/abc').set(as('ana'));
    expect(invalid.status).toBe(400);
  });

  it('PATCH edita campos e recusa corpo vazio', async () => {
    const { app } = seededApp();
    const res = await request(app)
      .patch(`/api/v1/clients/${C1}`)
      .set(as('ana'))
      .send({ segment: 'Tecnologia', strategicImportance: 4, status: 'inactive' });
    expect(res.status).toBe(200);
    expect(res.body.client).toMatchObject({
      segment: 'Tecnologia',
      strategicImportance: 4,
      status: 'inactive',
    });

    const empty = await request(app).patch(`/api/v1/clients/${C1}`).set(as('ana')).send({});
    expect(empty.status).toBe(400);
  });

  it('PATCH não deixa alterar cliente de outra organização', async () => {
    const { app, store } = seededApp();
    const res = await request(app)
      .patch(`/api/v1/clients/${CB}`)
      .set(as('ana'))
      .send({ name: 'Invadido' });
    expect(res.status).toBe(404);
    expect(store.clients.find((c) => c.id === CB)?.name).toBe('Cliente da Beta');
  });

  it('DELETE arquiva (status archived) sem apagar; some da lista padrão', async () => {
    const { app, store } = seededApp();
    const res = await request(app).delete(`/api/v1/clients/${C1}`).set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.client.status).toBe('archived');
    expect(store.clients.find((c) => c.id === C1)).toBeDefined();

    const list = await request(app).get('/api/v1/clients').set(as('ana'));
    expect(list.body.items.map((c: { id: string }) => c.id)).not.toContain(C1);

    const again = await request(app).delete(`/api/v1/clients/${C1}`).set(as('ana'));
    expect(again.status).toBe(200);
    expect(again.body.client.status).toBe('archived');
  });
});
