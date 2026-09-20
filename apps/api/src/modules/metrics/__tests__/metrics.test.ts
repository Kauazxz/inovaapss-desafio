/**
 * Rotas /metrics e /metric-models com dublês (token e repositórios em memória): CRUD, RBAC,
 * isolamento entre organizações, imutabilidade da versão ativa, soma 100 %, rebalance como
 * proposta e preview-score com o motor de verdade. O contrato com o banco real fica em
 * metrics.integration.test.ts.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { OrganizationRole } from '@inovaapss/shared';

import { createFakeMetricsRepository, type FakeMetricsRepository } from './fake-repository.js';
import { createApp } from '../../../app.js';
import { parseApiEnv } from '../../../config/env.js';
import {
  createFakeOrganizationsRepository,
  type FakeOrganizationsRepository,
} from '../../organizations/__tests__/fake-repository.js';

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
const USERS: Record<string, AuthUser> = { ana: ANA, bia: BIA, caio: CAIO };
const getUser = async (token: string): Promise<AuthUser | null> =>
  USERS[token.replace(/^token-/, '')] ?? null;

const ORG_ALFA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_BETA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

let organizations: FakeOrganizationsRepository;
let metrics: FakeMetricsRepository;

function member(organizationId: string, user: AuthUser, role: OrganizationRole) {
  organizations.members.push({
    id: `m-${user.userId}`,
    organizationId,
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
    apiV1: { getUser, organizationsRepository: organizations, metricsRepository: metrics },
  });
}

const as = (name: string) => ({ Authorization: `Bearer token-${name}` });

const LINEAR = { strategy: 'LINEAR_RANGE', min: 0, max: 100 } as const;

async function createDefinition(
  a: ReturnType<typeof app>,
  who: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await request(a)
    .post('/api/v1/metrics')
    .set(as(who))
    .send({ metricType: 'PERCENTAGE', direction: 'HIGHER_IS_BETTER', ...body });
  expect(res.status).toBe(201);
  return res.body.definition.id as string;
}

async function createModel(a: ReturnType<typeof app>, who: string, name = 'GlobalSys') {
  const res = await request(a).post('/api/v1/metric-models').set(as(who)).send({ name });
  expect(res.status).toBe(201);
  return res.body.model.id as string;
}

beforeEach(() => {
  organizations = createFakeOrganizationsRepository({
    organizations: [
      {
        id: ORG_ALFA,
        name: 'Alfa',
        slug: 'alfa',
        createdAt: '2026-09-19',
        updatedAt: '2026-09-19',
      },
      {
        id: ORG_BETA,
        name: 'Beta',
        slug: 'beta',
        createdAt: '2026-09-19',
        updatedAt: '2026-09-19',
      },
    ],
  });
  member(ORG_ALFA, ANA, 'owner');
  member(ORG_ALFA, CAIO, 'viewer');
  member(ORG_BETA, BIA, 'admin');
  metrics = createFakeMetricsRepository();
});

describe('definições de métrica — CRUD (§37)', () => {
  it('exige login e organização', async () => {
    expect((await request(app()).get('/api/v1/metrics')).status).toBe(401);
  });

  it('cria, lista com paginação/filtros, lê, atualiza', async () => {
    const a = app();
    const id = await createDefinition(a, 'ana', {
      name: 'Cumprimento de SLA',
      slug: 'sla_compliance',
      unit: '%',
    });
    await createDefinition(a, 'ana', {
      name: 'Chamados críticos',
      slug: 'critical_tickets',
      metricType: 'QUANTITY',
      direction: 'HIGHER_IS_WORSE',
      isActive: false,
    });

    const list = await request(a).get('/api/v1/metrics').set(as('ana'));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items.map((i: { slug: string }) => i.slug)).toEqual([
      'critical_tickets',
      'sla_compliance',
    ]);
    expect(list.body.items[0].activePlacement).toBeNull();

    const filtered = await request(a)
      .get('/api/v1/metrics?type=PERCENTAGE&is_active=true&search=sla')
      .set(as('ana'));
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].slug).toBe('sla_compliance');

    const byDirection = await request(a)
      .get('/api/v1/metrics?direction=HIGHER_IS_WORSE')
      .set(as('ana'));
    expect(byDirection.body.items).toHaveLength(1);

    const detail = await request(a).get(`/api/v1/metrics/${id}`).set(as('ana'));
    expect(detail.status).toBe(200);
    expect(detail.body.definition).toMatchObject({
      slug: 'sla_compliance',
      periodicity: 'MONTHLY',
      sourceType: 'MANUAL',
    });
    expect(detail.body.activeItem).toBeNull();

    const patched = await request(a)
      .patch(`/api/v1/metrics/${id}`)
      .set(as('ana'))
      .send({ name: 'SLA cumprido', category: 'Atendimento' });
    expect(patched.status).toBe(200);
    expect(patched.body.definition).toMatchObject({
      name: 'SLA cumprido',
      category: 'Atendimento',
    });
  });

  it('valida a entrada (400) e recusa slug repetido (409 SLUG_TAKEN)', async () => {
    const a = app();
    const invalid = await request(a).post('/api/v1/metrics').set(as('ana')).send({
      name: 'X',
      slug: 'Slug Inválido',
      metricType: 'NOPE',
      direction: 'HIGHER_IS_BETTER',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    await createDefinition(a, 'ana', { name: 'Uso', slug: 'platform_usage' });
    const dup = await request(a).post('/api/v1/metrics').set(as('ana')).send({
      name: 'Uso 2',
      slug: 'platform_usage',
      metricType: 'PERCENTAGE',
      direction: 'HIGHER_IS_BETTER',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('SLUG_TAKEN');
  });

  it('viewer lê mas não escreve (403 FORBIDDEN)', async () => {
    const a = app();
    const id = await createDefinition(a, 'ana', { name: 'Uso', slug: 'platform_usage' });
    expect((await request(a).get('/api/v1/metrics').set(as('caio'))).status).toBe(200);
    const denied = await request(a).post('/api/v1/metrics').set(as('caio')).send({
      name: 'Nova',
      slug: 'nova',
      metricType: 'PERCENTAGE',
      direction: 'HIGHER_IS_BETTER',
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    expect(
      (await request(a).patch(`/api/v1/metrics/${id}`).set(as('caio')).send({ name: 'Y' })).status,
    ).toBe(403);
    expect((await request(a).delete(`/api/v1/metrics/${id}`).set(as('caio'))).status).toBe(403);
  });

  it('DELETE apaga quando nunca usada e desativa quando já está numa versão', async () => {
    const a = app();
    const unused = await createDefinition(a, 'ana', { name: 'Solta', slug: 'solta' });
    const used = await createDefinition(a, 'ana', { name: 'Usada', slug: 'usada' });
    const modelId = await createModel(a, 'ana');
    await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions`)
      .set(as('ana'))
      .send({ items: [{ metricDefinitionId: used, weight: 1, normalization: LINEAR }] });

    const deleted = await request(a).delete(`/api/v1/metrics/${unused}`).set(as('ana'));
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ outcome: 'deleted', definition: null });
    expect((await request(a).get(`/api/v1/metrics/${unused}`).set(as('ana'))).status).toBe(404);

    const deactivated = await request(a).delete(`/api/v1/metrics/${used}`).set(as('ana'));
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.outcome).toBe('deactivated');
    expect(deactivated.body.definition.isActive).toBe(false);
    // O histórico continua lá.
    expect(metrics.versions[0]?.items[0]?.metricDefinitionId).toBe(used);
  });
});

describe('isolamento entre organizações (§5)', () => {
  it('a organização B não enxerga nem edita as métricas e modelos de A', async () => {
    const a = app();
    const id = await createDefinition(a, 'ana', { name: 'Uso', slug: 'platform_usage' });
    const modelId = await createModel(a, 'ana');

    const list = await request(a).get('/api/v1/metrics').set(as('bia'));
    expect(list.body.total).toBe(0);
    expect((await request(a).get(`/api/v1/metrics/${id}`).set(as('bia'))).status).toBe(404);
    expect(
      (await request(a).patch(`/api/v1/metrics/${id}`).set(as('bia')).send({ name: 'Outro nome' }))
        .status,
    ).toBe(404);
    expect((await request(a).get(`/api/v1/metric-models/${modelId}`).set(as('bia'))).status).toBe(
      404,
    );

    // B pode usar o mesmo slug: a unicidade é por organização.
    const own = await request(a).post('/api/v1/metrics').set(as('bia')).send({
      name: 'Uso',
      slug: 'platform_usage',
      metricType: 'PERCENTAGE',
      direction: 'HIGHER_IS_BETTER',
    });
    expect(own.status).toBe(201);

    // B não consegue montar uma versão apontando para uma definição de A.
    const modelB = await createModel(a, 'bia', 'Beta v1');
    const cross = await request(a)
      .post(`/api/v1/metric-models/${modelB}/versions`)
      .set(as('bia'))
      .send({ items: [{ metricDefinitionId: id, weight: 1, normalization: LINEAR }] });
    expect(cross.status).toBe(400);
    expect(cross.body.error.code).toBe('UNKNOWN_METRIC_DEFINITION');
  });
});

describe('modelos e versões (§31, §41)', () => {
  it('cria modelo, rascunho, edita, ativa com soma 100 % e arquiva a anterior', async () => {
    const a = app();
    const sla = await createDefinition(a, 'ana', {
      name: 'Cumprimento de SLA',
      slug: 'sla_compliance',
    });
    const uso = await createDefinition(a, 'ana', {
      name: 'Uso da plataforma',
      slug: 'platform_usage',
    });
    const modelId = await createModel(a, 'ana');

    const v1 = await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions`)
      .set(as('ana'))
      .send({
        items: [
          { metricDefinitionId: sla, weight: 0.6, normalization: LINEAR },
          { metricDefinitionId: uso, weight: 0.3, normalization: LINEAR },
        ],
      });
    expect(v1.status).toBe(201);
    expect(v1.body.version).toMatchObject({ version: 1, status: 'draft', effectiveFrom: null });
    expect(v1.body.version.items).toHaveLength(2);
    expect(v1.body.version.items[0]).toMatchObject({
      currentWeight: 0.45,
      trendWeight: 0.35,
      persistenceWeight: 0.2,
      normalizationStrategy: 'LINEAR_RANGE',
      sortOrder: 1,
    });

    // 0,9 ≠ 1: não ativa e diz quanto falta.
    const short = await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions/1/activate`)
      .set(as('ana'));
    expect(short.status).toBe(422);
    expect(short.body.error.code).toBe('WEIGHTS_MUST_SUM_100');
    expect(short.body.error.message).toContain('faltam 10 %');
    expect(short.body.error.details).toMatchObject({ total: 0.9, difference: -0.1 });

    const patched = await request(a)
      .patch(`/api/v1/metric-models/${modelId}/versions/1`)
      .set(as('ana'))
      .send({
        items: [
          { metricDefinitionId: sla, weight: 0.7, normalization: LINEAR, sortOrder: 2 },
          { metricDefinitionId: uso, weight: 0.3, normalization: LINEAR, sortOrder: 1 },
        ],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.version.items.map((i: { sortOrder: number }) => i.sortOrder)).toEqual([
      1, 2,
    ]);

    const activated = await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions/1/activate`)
      .set(as('ana'));
    expect(activated.status).toBe(200);
    expect(activated.body.version.status).toBe('active');
    expect(activated.body.version.effectiveFrom).not.toBeNull();

    // A versão ativa é imutável.
    const frozen = await request(a)
      .patch(`/api/v1/metric-models/${modelId}/versions/1`)
      .set(as('ana'))
      .send({ effectiveFrom: null });
    expect(frozen.status).toBe(409);
    expect(frozen.body.error.code).toBe('VERSION_NOT_EDITABLE');

    // O novo rascunho nasce como cópia da ativa.
    const v2 = await request(a).post(`/api/v1/metric-models/${modelId}/versions`).set(as('ana'));
    expect(v2.status).toBe(201);
    expect(v2.body.version).toMatchObject({ version: 2, status: 'draft' });
    expect(v2.body.version.items.map((i: { weight: number }) => i.weight)).toEqual([0.3, 0.7]);

    const activated2 = await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions/2/activate`)
      .set(as('ana'))
      .send({ effectiveFrom: '2026-10-01T00:00:00.000Z' });
    expect(activated2.status).toBe(200);

    const model = await request(a).get(`/api/v1/metric-models/${modelId}`).set(as('ana'));
    expect(model.status).toBe(200);
    expect(
      model.body.versions.map((v: { version: number; status: string }) => [v.version, v.status]),
    ).toEqual([
      [2, 'active'],
      [1, 'archived'],
    ]);
    // Histórico preservado: a v1 continua com os itens.
    expect(model.body.versions[1].items).toHaveLength(2);

    // Arquivada não volta a ser ativa; ativa não é reativada.
    expect(
      (await request(a).post(`/api/v1/metric-models/${modelId}/versions/1/activate`).set(as('ana')))
        .body.error.code,
    ).toBe('VERSION_ARCHIVED');
    expect(
      (await request(a).post(`/api/v1/metric-models/${modelId}/versions/2/activate`).set(as('ana')))
        .body.error.code,
    ).toBe('VERSION_ALREADY_ACTIVE');

    // A lista de métricas mostra a posição na versão ativa (tabela §41).
    const list = await request(a).get('/api/v1/metrics').set(as('ana'));
    const slaRow = list.body.items.find((i: { id: string }) => i.id === sla);
    expect(slaRow.activePlacement).toMatchObject({
      modelId,
      version: 2,
      weight: 0.7,
      sortOrder: 2,
    });
    const detail = await request(a).get(`/api/v1/metrics/${sla}`).set(as('ana'));
    expect(detail.body.activeModel).toEqual({ id: modelId, name: 'GlobalSys', version: 2 });
    expect(detail.body.activeItem.weight).toBe(0.7);
  });

  it('só métricas ativas entram na soma; uma desativada não bloqueia nem conta', async () => {
    const a = app();
    const ativa = await createDefinition(a, 'ana', { name: 'Ativa', slug: 'ativa' });
    const inativa = await createDefinition(a, 'ana', {
      name: 'Inativa',
      slug: 'inativa',
      isActive: false,
    });
    const modelId = await createModel(a, 'ana');
    await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions`)
      .set(as('ana'))
      .send({
        items: [
          { metricDefinitionId: ativa, weight: 1, normalization: LINEAR },
          { metricDefinitionId: inativa, weight: 0.5, normalization: LINEAR },
        ],
      });
    const res = await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions/1/activate`)
      .set(as('ana'));
    expect(res.status).toBe(200);
  });

  it('recusa configuração que o motor não consegue avaliar (400 INVALID_METRIC_CONFIG)', async () => {
    const a = app();
    const id = await createDefinition(a, 'ana', { name: 'Uso', slug: 'platform_usage' });
    const modelId = await createModel(a, 'ana');
    const res = await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions`)
      .set(as('ana'))
      .send({
        items: [
          {
            metricDefinitionId: id,
            weight: 1,
            normalization: LINEAR,
            thresholds: { trend: { method: 'DELTA_ABSOLUTE' } }, // exige fullDeteriorationChange
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_METRIC_CONFIG');
    expect(res.body.error.message).toContain('Uso');
  });

  it('recusa regra JSON Logic fora da allowlist antes de gravar', async () => {
    const a = app();
    const id = await createDefinition(a, 'ana', { name: 'Uso', slug: 'platform_usage' });
    const modelId = await createModel(a, 'ana');
    const res = await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions`)
      .set(as('ana'))
      .send({
        items: [
          {
            metricDefinitionId: id,
            weight: 1,
            normalization: {
              strategy: 'CUSTOM_SAFE_RULE',
              rule: { method: [{ var: 'value' }, 'x'] },
            },
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('escrita em modelos só para owner/admin; admin de outra organização não vê', async () => {
    const a = app();
    expect(
      (await request(a).post('/api/v1/metric-models').set(as('caio')).send({ name: 'X' })).status,
    ).toBe(403);
    const modelId = await createModel(a, 'ana');
    expect(
      (await request(a).post(`/api/v1/metric-models/${modelId}/versions`).set(as('caio'))).status,
    ).toBe(403);
    expect(
      (await request(a).post(`/api/v1/metric-models/${modelId}/versions`).set(as('bia'))).status,
    ).toBe(404);
    const list = await request(a).get('/api/v1/metric-models').set(as('caio'));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
  });
});

describe('POST /metric-models/:id/rebalance — proposta, nunca salva (§41)', () => {
  it('normaliza proporcionalmente os pesos da versão sem alterar o rascunho', async () => {
    const a = app();
    const x = await createDefinition(a, 'ana', { name: 'Métrica X', slug: 'metric_x' });
    const y = await createDefinition(a, 'ana', { name: 'Métrica Y', slug: 'metric_y' });
    const modelId = await createModel(a, 'ana');
    await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions`)
      .set(as('ana'))
      .send({
        items: [
          { metricDefinitionId: x, weight: 0.3, normalization: LINEAR },
          { metricDefinitionId: y, weight: 0.1, normalization: LINEAR },
        ],
      });

    const res = await request(a).post(`/api/v1/metric-models/${modelId}/rebalance`).set(as('caio'));
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
    expect(res.body.currentTotal).toBe(0.4);
    expect(res.body.proposedTotal).toBe(1);
    expect(res.body.rows).toEqual([
      { metricDefinitionId: x, currentWeight: 0.3, proposedWeight: 0.75, difference: 0.45 },
      { metricDefinitionId: y, currentWeight: 0.1, proposedWeight: 0.25, difference: 0.15 },
    ]);

    const version = await request(a).get(`/api/v1/metric-models/${modelId}`).set(as('ana'));
    expect(version.body.versions[0].items.map((i: { weight: number }) => i.weight)).toEqual([
      0.3, 0.1,
    ]);

    const fromBody = await request(a)
      .post(`/api/v1/metric-models/${modelId}/rebalance`)
      .set(as('ana'))
      .send({
        items: [
          { metricDefinitionId: x, weight: 0.2 },
          { metricDefinitionId: y, weight: 0.6 },
        ],
      });
    expect(fromBody.body.rows.map((r: { proposedWeight: number }) => r.proposedWeight)).toEqual([
      0.25, 0.75,
    ]);
  });
});

describe('POST /metrics/:id/preview-score — motor de verdade (§37, §41 Simular)', () => {
  it('devolve current/trend/persistence/metric_health e explicação em português', async () => {
    const a = app();
    const id = await createDefinition(a, 'ana', {
      name: 'Uso da plataforma',
      slug: 'platform_usage',
      unit: '%',
    });
    const res = await request(a)
      .post(`/api/v1/metrics/${id}/preview-score`)
      .set(as('caio'))
      .send({
        item: { normalization: LINEAR },
        series: [
          { periodEnd: '2026-06-30', value: 90 },
          { periodEnd: '2026-07-31', value: 85 },
          { periodEnd: '2026-08-31', value: 80 },
        ],
        periodLabel: 'mês',
      });
    expect(res.status).toBe(200);
    // Exemplo de referência do SCORING.md §6: 80 / 68,89 / 100 → 80,11 com confiança 100 %.
    expect(res.body.score).toMatchObject({
      metricId: id,
      metricKey: 'platform_usage',
      currentHealth: 80,
      trendHealth: 68.89,
      persistenceHealth: 100,
      metricHealth: 80.11,
      confidence: 100,
      currentValue: 80,
      previousValue: 85,
    });
    expect(res.body.score.explanation.summary).toContain('Uso da plataforma');
    expect(res.body.score.explanation.components).toHaveLength(3);
  });

  it('dado ausente vira N/A e reduz a confiança; gatilho dispara sem mudar o health', async () => {
    const a = app();
    const id = await createDefinition(a, 'ana', {
      name: 'Chamados críticos',
      slug: 'critical_tickets',
      metricType: 'QUANTITY',
      direction: 'HIGHER_IS_WORSE',
    });
    const semDado = await request(a)
      .post(`/api/v1/metrics/${id}/preview-score`)
      .set(as('ana'))
      .send({
        item: { normalization: LINEAR },
        series: [{ periodEnd: '2026-08-31', value: null }],
      });
    expect(semDado.status).toBe(200);
    expect(semDado.body.score.metricHealth).toBeNull();
    expect(semDado.body.score.confidence).toBe(0);

    const comGatilho = await request(a)
      .post(`/api/v1/metrics/${id}/preview-score`)
      .set(as('ana'))
      .send({
        item: {
          normalization: LINEAR,
          triggers: [
            {
              id: 'muitos',
              name: 'Muitos críticos',
              kind: 'THRESHOLD',
              field: 'value',
              operator: '>=',
              threshold: 3,
              priorityFloor: 85,
            },
          ],
        },
        series: [{ periodEnd: '2026-08-31', value: 5 }],
      });
    expect(comGatilho.status).toBe(200);
    expect(comGatilho.body.score.currentHealth).toBe(95);
    expect(comGatilho.body.score.triggers.hits).toHaveLength(1);
    expect(comGatilho.body.score.triggers.priorityFloor).toBe(85);
  });

  it('configuração inválida responde 400 com a mensagem do motor', async () => {
    const a = app();
    const id = await createDefinition(a, 'ana', { name: 'Uso', slug: 'platform_usage' });
    const res = await request(a)
      .post(`/api/v1/metrics/${id}/preview-score`)
      .set(as('ana'))
      .send({
        item: { normalization: LINEAR, thresholds: { trend: { method: 'SLOPE' } } },
        series: [{ periodEnd: '2026-08-31', value: 1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_METRIC_CONFIG');
    expect(
      (
        await request(a)
          .post(`/api/v1/metrics/${id}/preview-score`)
          .set(as('bia'))
          .send({
            item: { normalization: LINEAR },
            series: [{ periodEnd: '2026-08-31', value: 1 }],
          })
      ).status,
    ).toBe(404);
  });
});

describe('descartar rascunho (§41)', () => {
  async function rascunho(a: ReturnType<typeof app>): Promise<{ modelId: string; sla: string }> {
    const sla = await createDefinition(a, 'ana', {
      name: 'Cumprimento de SLA',
      slug: 'sla_compliance',
    });
    const modelId = await createModel(a, 'ana');
    const criado = await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions`)
      .set(as('ana'))
      .send({ items: [{ metricDefinitionId: sla, weight: 1, normalization: LINEAR }] });
    expect(criado.status).toBe(201);
    expect(criado.body.version.status).toBe('draft');
    return { modelId, sla };
  }

  it('apaga o rascunho e ele some da lista de versões', async () => {
    const a = app();
    const { modelId } = await rascunho(a);

    const res = await request(a)
      .delete(`/api/v1/metric-models/${modelId}/versions/1`)
      .set(as('ana'));
    expect(res.status).toBe(204);

    const model = await request(a).get(`/api/v1/metric-models/${modelId}`).set(as('ana'));
    expect(model.body.versions).toHaveLength(0);
    expect(metrics.versions).toHaveLength(0);
  });

  it('não descarta a versão em vigor: ela é quem pontua a carteira', async () => {
    const a = app();
    const { modelId } = await rascunho(a);
    const ativada = await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions/1/activate`)
      .set(as('ana'));
    expect(ativada.status).toBe(200);

    const res = await request(a)
      .delete(`/api/v1/metric-models/${modelId}/versions/1`)
      .set(as('ana'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_ACTIVE');
    expect(metrics.versions).toHaveLength(1);
  });

  it('não descarta versão arquivada: ela é o histórico', async () => {
    const a = app();
    const { modelId, sla } = await rascunho(a);
    await request(a).post(`/api/v1/metric-models/${modelId}/versions/1/activate`).set(as('ana'));
    const v2 = await request(a)
      .post(`/api/v1/metric-models/${modelId}/versions`)
      .set(as('ana'))
      .send({ items: [{ metricDefinitionId: sla, weight: 1, normalization: LINEAR }] });
    expect(v2.status).toBe(201);
    await request(a).post(`/api/v1/metric-models/${modelId}/versions/2/activate`).set(as('ana'));

    const res = await request(a)
      .delete(`/api/v1/metric-models/${modelId}/versions/1`)
      .set(as('ana'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_ARCHIVED');
  });

  it('recusa quando a versão já gerou pontuação, para nada do histórico sumir em cascata', async () => {
    const a = app();
    const { modelId } = await rascunho(a);
    const versionId = metrics.versions[0]?.id ?? '';
    metrics.snapshotsByVersion[versionId] = 3;

    const res = await request(a)
      .delete(`/api/v1/metric-models/${modelId}/versions/1`)
      .set(as('ana'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_HAS_SCORES');
    expect(metrics.versions).toHaveLength(1);
  });

  it('a versão de outra organização responde 404, não 403', async () => {
    const a = app();
    const { modelId } = await rascunho(a);
    const res = await request(a)
      .delete(`/api/v1/metric-models/${modelId}/versions/1`)
      .set(as('bia'));
    expect(res.status).toBe(404);
    expect(metrics.versions).toHaveLength(1);
  });

  it('quem só lê não descarta', async () => {
    const a = app();
    const { modelId } = await rascunho(a);
    const res = await request(a)
      .delete(`/api/v1/metric-models/${modelId}/versions/1`)
      .set(as('caio'));
    expect(res.status).toBe(403);
    expect(metrics.versions).toHaveLength(1);
  });
});

describe('documentação', () => {
  it('o OpenAPI lista /metrics e /metric-models', async () => {
    const res = await request(app()).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.paths).toHaveProperty('/api/v1/metrics');
    expect(res.body.paths).toHaveProperty('/api/v1/metrics/{id}/preview-score');
    expect(res.body.paths).toHaveProperty('/api/v1/metric-models');
    expect(res.body.paths).toHaveProperty('/api/v1/metric-models/{id}/versions/{version}/activate');
    expect(res.body.paths).toHaveProperty('/api/v1/metric-models/{id}/rebalance');
    expect(res.body.paths['/api/v1/metric-models/{id}/versions/{version}']).toHaveProperty(
      'delete',
    );
  });
});
