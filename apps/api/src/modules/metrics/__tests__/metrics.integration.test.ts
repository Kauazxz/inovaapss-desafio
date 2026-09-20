/**
 * Integração com o Supabase REAL. Só roda quando o .env da raiz (ou o ambiente) tem
 * DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY e as tabelas da
 * Etapa 3 (metric_definitions, metric_models, metric_model_versions, metric_model_items) já
 * foram aplicadas; caso contrário a suíte fica skipped com um aviso.
 *
 * Cria usuário, organização e métricas com prefixo `test-` e apaga tudo no final.
 */
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { type ApiEnv, loadEnvFiles, parseApiEnv } from '../../../config/env.js';
import { createDbClient, type DbClient } from '../../../infrastructure/db/index.js';
import { createSupabaseClients } from '../../../infrastructure/supabase.js';

loadEnvFiles();
const env: ApiEnv = parseApiEnv({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' });

const hasEnv =
  env.DATABASE_URL !== undefined &&
  env.SUPABASE_URL !== undefined &&
  env.SUPABASE_ANON_KEY !== undefined &&
  env.SUPABASE_SERVICE_ROLE_KEY !== undefined;

const REQUIRED_TABLES = [
  'organization_users',
  'metric_definitions',
  'metric_models',
  'metric_model_versions',
  'metric_model_items',
];

let db: DbClient | undefined;
let tablesReady = false;

if (hasEnv) {
  db = createDbClient(env.DATABASE_URL);
  try {
    const rows = await db
      .getDb()
      .execute<{ name: string; ok: string | null }>(
        sql`select t as name, to_regclass('public.' || t)::text as ok from unnest(${REQUIRED_TABLES}::text[]) as t`,
      );
    tablesReady = Array.from(rows).every((row) => row.ok !== null);
  } catch {
    tablesReady = false;
  }
}

const enabled = hasEnv && tablesReady;
if (!enabled) {
  const motivo = !hasEnv
    ? 'faltam DATABASE_URL/SUPABASE_* no ambiente'
    : 'as migrations da Etapa 3 (metric_*) ainda não foram aplicadas no banco';
  console.warn(`[metrics.integration] suíte ignorada: ${motivo}.`);
  if (db) await db.close();
}

interface TestUser {
  id: string;
  email: string;
  token: string;
}

describe.skipIf(!enabled)('metrics — integração com o Supabase real', () => {
  const run = randomUUID().slice(0, 8);
  const password = `Test-${randomUUID()}`;
  const supabase = createSupabaseClients(env);
  const dbClient = db as DbClient;
  const app = createApp(env, { db: dbClient, supabase });
  const slug = `test-${run}-metrics`;
  let ana: TestUser;

  async function createTestUser(label: string): Promise<TestUser> {
    const email = `test-${run}-${label}@example.com`;
    const { data, error } = await supabase.getAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser falhou: ${error?.message}`);
    const anon = createClient(env.SUPABASE_URL as string, env.SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await anon.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session)
      throw new Error(`login falhou: ${signIn.error?.message}`);
    return { id: data.user.id, email, token: signIn.data.session.access_token };
  }

  const bearer = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

  beforeAll(async () => {
    ana = await createTestUser('ana');
    const created = await request(app)
      .post('/api/v1/organizations')
      .set(bearer(ana))
      .send({ name: `Test Metrics ${run}`, slug });
    expect(created.status).toBe(201);
  }, 60_000);

  afterAll(async () => {
    const conn = dbClient.getDb();
    // organizations cascateia para metric_* e organization_users.
    await conn.execute(sql`delete from public.organizations where slug = ${slug}`);
    await supabase.getAdmin().auth.admin.deleteUser(ana.id);
    await dbClient.close();
  }, 60_000);

  it('cria definição, modelo, versão e ativa com soma 100 %', async () => {
    const def = await request(app).post('/api/v1/metrics').set(bearer(ana)).send({
      name: 'Uso da plataforma',
      slug: 'platform_usage',
      metricType: 'PERCENTAGE',
      direction: 'HIGHER_IS_BETTER',
      unit: '%',
    });
    expect(def.status).toBe(201);

    const model = await request(app)
      .post('/api/v1/metric-models')
      .set(bearer(ana))
      .send({ name: 'GlobalSys v1' });
    expect(model.status).toBe(201);
    const modelId = model.body.model.id as string;

    const version = await request(app)
      .post(`/api/v1/metric-models/${modelId}/versions`)
      .set(bearer(ana))
      .send({
        items: [
          {
            metricDefinitionId: def.body.definition.id,
            weight: 1,
            normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
            thresholds: { trend: { window: 3 } },
          },
        ],
      });
    expect(version.status).toBe(201);
    expect(version.body.version.items[0].weight).toBe(1);

    const activated = await request(app)
      .post(`/api/v1/metric-models/${modelId}/versions/1/activate`)
      .set(bearer(ana));
    expect(activated.status).toBe(200);
    expect(activated.body.version.status).toBe('active');

    const list = await request(app).get('/api/v1/metrics').set(bearer(ana));
    expect(list.body.items[0].activePlacement).toMatchObject({ modelId, version: 1, weight: 1 });
  });
});
