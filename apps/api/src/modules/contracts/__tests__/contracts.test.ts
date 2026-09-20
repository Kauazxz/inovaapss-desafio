/**
 * Rotas /api/v1/plans e /api/v1/contracts com dublês: CRUD de planos, contratos por cliente,
 * regra do contrato único ativo, encerramento, RBAC e isolamento entre organizações.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { ALFA_ID, as, BETA_ID, createTestApp } from '../../portfolio-clients/__tests__/test-app.js';

import type { PortfolioClient } from '../../portfolio-clients/types.js';

const NOW = '2026-09-19T00:00:00.000Z';
const C1 = '0c000000-0000-4000-8000-000000000001';
const CB = '0c000000-0000-4000-8000-0000000000bb';

function client(organizationId: string, id: string, name: string): PortfolioClient {
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
  };
}

function seededApp() {
  return createTestApp({
    clients: [client(ALFA_ID, C1, 'Alfa Tech'), client(BETA_ID, CB, 'Cliente da Beta')],
  });
}

async function createPlan(app: ReturnType<typeof seededApp>['app'], name: string) {
  const res = await request(app).post('/api/v1/plans').set(as('ana')).send({ name });
  expect(res.status).toBe(201);
  return res.body.plan as { id: string; name: string };
}

describe('/api/v1/plans', () => {
  it('exige token e organização', async () => {
    const { app } = seededApp();
    expect((await request(app).get('/api/v1/plans')).status).toBe(401);
  });

  it('cria, lista (só da organização) e edita planos', async () => {
    const { app } = seededApp();
    const created = await request(app)
      .post('/api/v1/plans')
      .set(as('ana'))
      .send({ name: 'Premium', description: 'Atendimento prioritário' });
    expect(created.status).toBe(201);
    expect(created.body.plan).toMatchObject({
      name: 'Premium',
      description: 'Atendimento prioritário',
      organizationId: ALFA_ID,
    });
    await createPlan(app, 'Básico');

    const ana = await request(app).get('/api/v1/plans').set(as('ana'));
    expect(ana.status).toBe(200);
    expect(ana.body.total).toBe(2);
    expect(ana.body.items.map((p: { name: string }) => p.name)).toEqual(['Básico', 'Premium']);

    const bia = await request(app).get('/api/v1/plans').set(as('bia'));
    expect(bia.body.total).toBe(0);

    const edited = await request(app)
      .patch(`/api/v1/plans/${created.body.plan.id}`)
      .set(as('ana'))
      .send({ description: '' });
    expect(edited.status).toBe(200);
    expect(edited.body.plan.description).toBeNull();

    const foreign = await request(app)
      .patch(`/api/v1/plans/${created.body.plan.id}`)
      .set(as('bia'))
      .send({ name: 'Invadido' });
    expect(foreign.status).toBe(404);
  });

  it('recusa nome repetido (409 PLAN_NAME_TAKEN, sem diferenciar maiúsculas)', async () => {
    const { app } = seededApp();
    await createPlan(app, 'Premium');
    const dup = await request(app).post('/api/v1/plans').set(as('ana')).send({ name: 'premium' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('PLAN_NAME_TAKEN');
  });

  it('viewer não cria plano', async () => {
    const { app } = seededApp();
    const res = await request(app).post('/api/v1/plans').set(as('caio')).send({ name: 'X' });
    expect(res.status).toBe(403);
  });
});

describe('/api/v1/contracts', () => {
  const base = { portfolioClientId: C1, monthlyValue: 1200.5, startDate: '2026-01-01' };

  it('cria um contrato ativo para o cliente e ele aparece em GET /clients/:id', async () => {
    const { app } = seededApp();
    const plan = await createPlan(app, 'Premium');
    const res = await request(app)
      .post('/api/v1/contracts')
      .set(as('ana'))
      .send({ ...base, planId: plan.id, contractedSlaHours: 8 });
    expect(res.status).toBe(201);
    expect(res.body.contract).toMatchObject({
      portfolioClientId: C1,
      planId: plan.id,
      planName: 'Premium',
      monthlyValue: 1200.5,
      currency: 'BRL',
      status: 'active',
      endDate: null,
      contractedSlaHours: 8,
    });

    const detail = await request(app).get(`/api/v1/clients/${C1}`).set(as('ana'));
    expect(detail.body.client.activeContract).toMatchObject({
      id: res.body.contract.id,
      planName: 'Premium',
      monthlyValue: 1200.5,
    });
  });

  it('só um contrato ativo por cliente: criar outro encerra o anterior', async () => {
    const { app, store } = seededApp();
    const first = await request(app).post('/api/v1/contracts').set(as('ana')).send(base);
    const second = await request(app)
      .post('/api/v1/contracts')
      .set(as('ana'))
      .send({ ...base, monthlyValue: 2000, startDate: '2026-06-01' });
    expect(second.status).toBe(201);

    const previous = store.contracts.find((c) => c.id === first.body.contract.id);
    expect(previous).toMatchObject({ status: 'ended', endDate: '2026-06-01' });

    const active = await request(app)
      .get(`/api/v1/contracts?clientId=${C1}&status=active`)
      .set(as('ana'));
    expect(active.body.total).toBe(1);
    expect(active.body.items[0].id).toBe(second.body.contract.id);

    const all = await request(app).get(`/api/v1/contracts?clientId=${C1}`).set(as('ana'));
    expect(all.body.total).toBe(2);
    // Ordem padrão: startDate desc.
    expect(all.body.items.map((c: { startDate: string }) => c.startDate)).toEqual([
      '2026-06-01',
      '2026-01-01',
    ]);
  });

  it('reativar um contrato encerrado encerra o ativo atual', async () => {
    const { app, store } = seededApp();
    const first = await request(app).post('/api/v1/contracts').set(as('ana')).send(base);
    const second = await request(app)
      .post('/api/v1/contracts')
      .set(as('ana'))
      .send({ ...base, startDate: '2026-06-01' });

    const reactivated = await request(app)
      .patch(`/api/v1/contracts/${first.body.contract.id}`)
      .set(as('ana'))
      .send({ status: 'active', endDate: null });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.contract.status).toBe('active');
    expect(store.contracts.find((c) => c.id === second.body.contract.id)?.status).toBe('ended');
  });

  it('PATCH encerra um contrato (status ended + endDate) e valida datas', async () => {
    const { app } = seededApp();
    const created = await request(app).post('/api/v1/contracts').set(as('ana')).send(base);
    const id = created.body.contract.id as string;

    const invalid = await request(app)
      .patch(`/api/v1/contracts/${id}`)
      .set(as('ana'))
      .send({ status: 'ended', startDate: '2026-05-01', endDate: '2026-04-30' });
    expect(invalid.status).toBe(400);

    const ended = await request(app)
      .patch(`/api/v1/contracts/${id}`)
      .set(as('ana'))
      .send({ status: 'ended', endDate: '2026-09-19' });
    expect(ended.status).toBe(200);
    expect(ended.body.contract).toMatchObject({ status: 'ended', endDate: '2026-09-19' });

    const detail = await request(app).get(`/api/v1/clients/${C1}`).set(as('ana'));
    expect(detail.body.client.activeContract).toBeNull();
  });

  it('valida corpo: cliente obrigatório, valor não negativo, moeda de 3 letras', async () => {
    const { app } = seededApp();
    const res = await request(app)
      .post('/api/v1/contracts')
      .set(as('ana'))
      .send({ monthlyValue: -1, currency: 'reais', startDate: '01/01/2026' });
    expect(res.status).toBe(400);
    const paths = (res.body.error.details as { path: string[] }[]).map((i) => i.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['portfolioClientId', 'monthlyValue', 'currency', 'startDate']),
    );
  });

  it('não cria contrato para cliente de outra organização nem com plano de outra', async () => {
    const { app } = seededApp();
    const foreignClient = await request(app)
      .post('/api/v1/contracts')
      .set(as('ana'))
      .send({ ...base, portfolioClientId: CB });
    expect(foreignClient.status).toBe(404);

    const biaPlan = await request(app)
      .post('/api/v1/plans')
      .set(as('bia'))
      .send({ name: 'Beta Plus' });
    const foreignPlan = await request(app)
      .post('/api/v1/contracts')
      .set(as('ana'))
      .send({ ...base, planId: biaPlan.body.plan.id });
    expect(foreignPlan.status).toBe(404);
    expect(foreignPlan.body.error.code).toBe('PLAN_NOT_FOUND');
  });

  it('lista só os contratos da organização e responde 404 para contrato alheio', async () => {
    const { app } = seededApp();
    const created = await request(app).post('/api/v1/contracts').set(as('ana')).send(base);
    const bia = await request(app).get('/api/v1/contracts').set(as('bia'));
    expect(bia.body.total).toBe(0);
    const foreign = await request(app)
      .get(`/api/v1/contracts/${created.body.contract.id}`)
      .set(as('bia'));
    expect(foreign.status).toBe(404);
  });

  it('viewer lê, mas não cria nem edita', async () => {
    const { app } = seededApp();
    const created = await request(app).post('/api/v1/contracts').set(as('ana')).send(base);
    expect((await request(app).get('/api/v1/contracts').set(as('caio'))).status).toBe(200);
    expect((await request(app).post('/api/v1/contracts').set(as('caio')).send(base)).status).toBe(
      403,
    );
    const patch = await request(app)
      .patch(`/api/v1/contracts/${created.body.contract.id}`)
      .set(as('caio'))
      .send({ status: 'suspended' });
    expect(patch.status).toBe(403);
  });
});
