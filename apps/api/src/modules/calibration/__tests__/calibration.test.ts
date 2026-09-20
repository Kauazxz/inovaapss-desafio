/**
 * Rotas /calibration com dublês (token, repositório de calibração e de métricas em memória).
 *
 * O que está travado aqui: quem pode rodar, o que a execução guarda, o número bater com o
 * cancelamento sintético plantado na série e — o mais importante — aceitar sugestão criar um
 * RASCUNHO sem encostar na versão ativa (§32).
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CalibrationClientSeries } from '@inovaapss/engine';
import type { OrganizationRole } from '@inovaapss/shared';

import {
  createFakeCalibrationRepository,
  type FakeCalibrationRepository,
} from './fake-repository.js';
import { createApp } from '../../../app.js';
import { parseApiEnv } from '../../../config/env.js';
import {
  createFakeMetricsRepository,
  type FakeMetricsRepository,
} from '../../metrics/__tests__/fake-repository.js';
import {
  createFakeOrganizationsRepository,
  type FakeOrganizationsRepository,
} from '../../organizations/__tests__/fake-repository.js';

import type { DbClient } from '../../../infrastructure/db/index.js';
import type { SupabaseClients } from '../../../infrastructure/supabase.js';
import type { AuthUser } from '../../../middleware/auth.js';

const env = parseApiEnv({ NODE_ENV: 'test' });

const ANA: AuthUser = { userId: '11111111-1111-4111-8111-111111111111', email: 'ana@example.com' };
const CAIO: AuthUser = {
  userId: '33333333-3333-4333-8333-333333333333',
  email: 'caio@example.com',
};
const USERS: Record<string, AuthUser> = { ana: ANA, caio: CAIO };
const getUser = async (token: string): Promise<AuthUser | null> =>
  USERS[token.replace(/^token-/, '')] ?? null;

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MODELO = 'mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm';
const SINAL = 'ssssssss-ssss-4sss-8sss-ssssssssssss';
const RUIDO = 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr';

const db: DbClient = {
  isConfigured: false,
  getDb: () => {
    throw new Error('o repositório em memória não usa o banco');
  },
  ping: async () => {},
  close: async () => {},
};

const supabase: SupabaseClients = {
  isConfigured: true,
  getAdmin: () => {
    throw new Error('não usado');
  },
  getAnon: () => {
    throw new Error('não usado: getUser é um dublê');
  },
};

const MESES = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'];

function serie(
  clientId: string,
  sinal: readonly number[],
  ruido: readonly number[],
  churnPeriodEnd: string | null = null,
): CalibrationClientSeries {
  return {
    clientId,
    clientName: clientId,
    churnPeriodEnd,
    periods: sinal.map((valor, index) => ({
      periodEnd: MESES[index] as string,
      metricHealth: { [SINAL]: valor, [RUIDO]: ruido[index] ?? null },
      commercialImpactScore: 50,
    })),
  };
}

/** Dois cancelamentos anunciados pela métrica "sinal"; "ruido" é alto para todo mundo. */
const CARTEIRA: CalibrationClientSeries[] = [
  serie('saiu-1', [50, 30, 15, 8], [92, 91, 90, 93], '2026-05-31'),
  serie('saiu-2', [48, 28, 14, 7], [90, 93, 92, 91], '2026-05-31'),
  serie('ficou-1', [88, 90, 87, 89], [91, 90, 92, 90]),
  serie('ficou-2', [91, 89, 92, 90], [92, 91, 90, 93]),
  serie('ficou-3', [86, 88, 90, 87], [90, 92, 91, 90]),
];

let organizations: FakeOrganizationsRepository;
let metrics: FakeMetricsRepository;
let calibration: FakeCalibrationRepository;

function member(user: AuthUser, role: OrganizationRole) {
  organizations.members.push({
    id: `m-${user.userId}`,
    organizationId: ORG,
    authUserId: user.userId,
    email: user.email,
    role,
    createdAt: new Date().toISOString(),
  });
}

function app() {
  return createApp(env, {
    db,
    supabase,
    apiV1: {
      getUser,
      organizationsRepository: organizations,
      metricsRepository: metrics,
      calibrationRepository: calibration,
    },
  });
}

const as = (name: string) => ({ Authorization: `Bearer token-${name}` });

const LINEAR = { strategy: 'LINEAR_RANGE', min: 0, max: 100 } as const;

/** Modelo com duas métricas, 50/50 — o preço de cada uma é o que a calibração vai discutir. */
async function seedModelo() {
  metrics.models.push({
    id: MODELO,
    organizationId: ORG,
    name: 'GlobalSys',
    mode: 'ASSISTED',
    isActive: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  });
  const ativa = await metrics.createVersion(ORG, {
    metricModelId: MODELO,
    version: 1,
    status: 'active',
    effectiveFrom: null,
    items: [SINAL, RUIDO].map((metricDefinitionId, index) => ({
      metricDefinitionId,
      weight: 0.5,
      currentWeight: 0.45,
      trendWeight: 0.35,
      persistenceWeight: 0.2,
      normalizationConfig: LINEAR,
      thresholdConfig: null,
      criticalTriggerConfig: null,
      formulaConfig: null,
      sortOrder: index,
    })),
  });

  calibration.versions.push({
    metricModelId: MODELO,
    metricModelName: 'GlobalSys',
    metricModelVersionId: ativa.id,
    version: 1,
    status: 'active',
    snapshotCount: 20,
    weights: [
      { metricId: SINAL, metricName: 'Métrica que avisa', weight: 0.5 },
      { metricId: RUIDO, metricName: 'Métrica que não avisa', weight: 0.5 },
    ],
  });
  calibration.seriesByVersion.set(ativa.id, CARTEIRA);
  return ativa;
}

beforeEach(() => {
  organizations = createFakeOrganizationsRepository({
    organizations: [
      { id: ORG, name: 'Alfa', slug: 'alfa', createdAt: '2026-09-19', updatedAt: '2026-09-19' },
    ],
  });
  member(ANA, 'owner');
  member(CAIO, 'viewer');
  metrics = createFakeMetricsRepository();
  calibration = createFakeCalibrationRepository();
});

describe('calibração — acesso', () => {
  it('exige login', async () => {
    expect((await request(app()).get('/api/v1/calibration/runs')).status).toBe(401);
  });

  it('viewer lê, mas não roda backtest nem cria versão', async () => {
    await seedModelo();
    const a = app();
    expect((await request(a).get('/api/v1/calibration/runs').set(as('caio'))).status).toBe(200);
    const res = await request(a).post('/api/v1/calibration/runs').set(as('caio')).send({});
    expect(res.status).toBe(403);
  });
});

describe('POST /calibration/runs', () => {
  it('recusa janela fora de 30/60/90', async () => {
    await seedModelo();
    const res = await request(app())
      .post('/api/v1/calibration/runs')
      .set(as('ana'))
      .send({ windowDays: 45 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_WINDOW');
  });

  it('avisa quando não há versão de modelo para calibrar', async () => {
    const res = await request(app()).post('/api/v1/calibration/runs').set(as('ana')).send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MODEL_VERSION_NOT_FOUND');
  });

  it('avisa quando a versão ainda não tem histórico calculado', async () => {
    const ativa = await seedModelo();
    calibration.seriesByVersion.set(ativa.id, []);
    const res = await request(app()).post('/api/v1/calibration/runs').set(as('ana')).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_HISTORY');
    expect(calibration.runs[0]?.status).toBe('failed');
  });

  it('roda o backtest, guarda o resultado e pega os dois cancelamentos plantados', async () => {
    await seedModelo();
    const res = await request(app())
      .post('/api/v1/calibration/runs')
      .set(as('ana'))
      .send({ windowDays: 60 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('done');
    expect(res.body.windowDays).toBe(60);
    expect(res.body.results.baseline.churnsAnalyzed).toBe(2);
    expect(res.body.results.baseline.churnsCaught).toBe(2);
    expect(res.body.results.baseline.churnDetectionRate).toBe(1);
    expect(res.body.results.baseline.leadTime.meanPeriods).toBeGreaterThan(0);
    expect(res.body.results.baseline.topN.map((t: { n: number }) => t.n)).toEqual([5, 10]);
    expect(res.body.results.model).toMatchObject({ metricModelName: 'GlobalSys', version: 1 });
    expect(res.body.parameters).toMatchObject({ windowDays: 60, windowPeriods: 2 });
  });

  it('sugere mais peso para a métrica que antecipou as saídas, somando 1,0000', async () => {
    await seedModelo();
    const res = await request(app()).post('/api/v1/calibration/runs').set(as('ana')).send({});
    const sugestoes = res.body.results.suggestions as {
      metricId: string;
      currentWeight: number;
      suggestedWeight: number;
    }[];

    const sinal = sugestoes.find((s) => s.metricId === SINAL);
    expect(sinal?.suggestedWeight ?? 0).toBeGreaterThan(sinal?.currentWeight ?? 1);
    expect(sugestoes.reduce((acc, s) => acc + s.suggestedWeight, 0)).toBe(1);
  });

  it('o resultado aparece no histórico e pode ser lido de novo', async () => {
    await seedModelo();
    const a = app();
    const criada = await request(a).post('/api/v1/calibration/runs').set(as('ana')).send({});
    const lista = await request(a).get('/api/v1/calibration/runs').set(as('ana'));
    const detalhe = await request(a)
      .get(`/api/v1/calibration/runs/${criada.body.id}`)
      .set(as('ana'));

    expect(lista.body.items).toHaveLength(1);
    expect(lista.body.items[0]).toMatchObject({ id: criada.body.id, status: 'done' });
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.results.suggestions).toHaveLength(2);
  });

  it('404 em execução de outra organização ou inexistente', async () => {
    const res = await request(app())
      .get('/api/v1/calibration/runs/99999999-9999-4999-8999-999999999999')
      .set(as('ana'));
    expect(res.status).toBe(404);
  });
});

describe('GET /calibration/versions', () => {
  it('lista só as versões com histórico gravado', async () => {
    await seedModelo();
    calibration.versions.push({
      metricModelId: MODELO,
      metricModelName: 'GlobalSys',
      metricModelVersionId: 'sem-historico',
      version: 2,
      status: 'draft',
      snapshotCount: 0,
      weights: [],
    });
    const res = await request(app()).get('/api/v1/calibration/versions').set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ version: 1, status: 'active' });
  });
});

describe('POST /calibration/runs/:id/apply-suggestions', () => {
  async function rodar(a: ReturnType<typeof app>) {
    const res = await request(a).post('/api/v1/calibration/runs').set(as('ana')).send({});
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it('cria um RASCUNHO e deixa a versão ativa intacta (§32)', async () => {
    const ativa = await seedModelo();
    const a = app();
    const run = await rodar(a);

    const res = await request(a)
      .post(`/api/v1/calibration/runs/${run.id}/apply-suggestions`)
      .set(as('ana'))
      .send({ acceptedMetricIds: [SINAL, RUIDO] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ version: 2, status: 'draft' });
    expect(res.body.message).toContain('ativar');

    const depois = await metrics.findVersion(ORG, MODELO, 1);
    expect(depois?.status).toBe('active');
    expect(depois?.id).toBe(ativa.id);
    expect(depois?.items.map((i) => i.weight)).toEqual([0.5, 0.5]);
  });

  it('os pesos do rascunho somam exatamente 1,0000 e respeitam o que foi aceito', async () => {
    await seedModelo();
    const a = app();
    const run = await rodar(a);
    const res = await request(a)
      .post(`/api/v1/calibration/runs/${run.id}/apply-suggestions`)
      .set(as('ana'))
      .send({ acceptedMetricIds: [SINAL, RUIDO] });

    const soma = (res.body.weights as { weight: number }[]).reduce((acc, w) => acc + w.weight, 0);
    expect(soma).toBe(1);

    const rascunho = await metrics.findVersion(ORG, MODELO, 2);
    expect(rascunho?.items.reduce((acc, item) => acc + item.weight, 0)).toBeCloseTo(1, 4);
  });

  it('aceitar só uma métrica redistribui o resto sem estourar os 100 %', async () => {
    await seedModelo();
    const a = app();
    const run = await rodar(a);
    const detalhe = await request(a).get(`/api/v1/calibration/runs/${run.id}`).set(as('ana'));
    const sugerido = (
      detalhe.body.results.suggestions as { metricId: string; suggestedWeight: number }[]
    ).find((s) => s.metricId === SINAL);

    const res = await request(a)
      .post(`/api/v1/calibration/runs/${run.id}/apply-suggestions`)
      .set(as('ana'))
      .send({ acceptedMetricIds: [SINAL] });

    const pesos = res.body.weights as { metricId: string; weight: number }[];
    expect(pesos.find((w) => w.metricId === SINAL)?.weight).toBeCloseTo(
      sugerido?.suggestedWeight ?? 0,
      3,
    );
    expect(pesos.reduce((acc, w) => acc + w.weight, 0)).toBe(1);
  });

  it('recusa lista vazia e corpo malformado', async () => {
    await seedModelo();
    const a = app();
    const run = await rodar(a);

    const vazia = await request(a)
      .post(`/api/v1/calibration/runs/${run.id}/apply-suggestions`)
      .set(as('ana'))
      .send({ acceptedMetricIds: [] });
    expect(vazia.status).toBe(400);
    expect(vazia.body.error.code).toBe('NO_SUGGESTION_ACCEPTED');

    const errada = await request(a)
      .post(`/api/v1/calibration/runs/${run.id}/apply-suggestions`)
      .set(as('ana'))
      .send({ acceptedMetricIds: 'tudo' });
    expect(errada.status).toBe(400);
    expect(errada.body.error.code).toBe('INVALID_ACCEPTED_METRICS');
  });

  it('não aplica sugestão de execução que não terminou', async () => {
    await seedModelo();
    const a = app();
    const run = await rodar(a);
    const registro = calibration.runs.find((r) => r.id === run.id);
    if (registro) {
      registro.status = 'running';
      registro.resultsJson = null;
    }

    const res = await request(a)
      .post(`/api/v1/calibration/runs/${run.id}/apply-suggestions`)
      .set(as('ana'))
      .send({ acceptedMetricIds: [SINAL] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RUN_NOT_READY');
  });
});
