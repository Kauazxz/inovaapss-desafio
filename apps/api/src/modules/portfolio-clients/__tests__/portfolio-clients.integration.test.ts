/**
 * Integração da Etapa 2 com o Supabase REAL (auth + banco). Só roda quando o .env da raiz (ou
 * o ambiente) tem DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY e
 * as tabelas portfolio_clients / plans / contracts já foram aplicadas; caso contrário a suíte
 * fica skipped com um aviso (mesmo padrão de organizations.integration.test.ts).
 *
 * Cria usuários, organizações e clientes com prefixo `test-` e apaga tudo no final.
 */
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app.js';
import { type ApiEnv, loadEnvFiles, parseApiEnv } from '../../../config/env.js';
import { createDbClient, type DbClient } from '../../../infrastructure/db/index.js';
import { createSupabaseClients } from '../../../infrastructure/supabase.js';

// Esta suíte fala com o Supabase remoto: uma ida e volta pela rede não cabe nos 5 s padrão do
// vitest, pensados para teste em memória. O limite alto vale só para este arquivo.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

loadEnvFiles();
const env: ApiEnv = parseApiEnv({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' });

const hasEnv =
  env.DATABASE_URL !== undefined &&
  env.SUPABASE_URL !== undefined &&
  env.SUPABASE_ANON_KEY !== undefined &&
  env.SUPABASE_SERVICE_ROLE_KEY !== undefined;

let db: DbClient | undefined;
let tablesReady = false;

if (hasEnv) {
  db = createDbClient(env.DATABASE_URL);
  try {
    const rows = await db
      .getDb()
      .execute<{ clients: string | null; contracts: string | null }>(
        sql`select to_regclass('public.portfolio_clients')::text as clients, to_regclass('public.contracts')::text as contracts`,
      );
    const first = Array.from(rows)[0];
    tablesReady = first?.clients !== null && first?.contracts !== null;
  } catch {
    tablesReady = false;
  }
}

const enabled = hasEnv && tablesReady;
if (!enabled) {
  const motivo = !hasEnv
    ? 'faltam DATABASE_URL/SUPABASE_* no ambiente'
    : 'as tabelas da Etapa 2 (portfolio_clients, plans, contracts) ainda não foram aplicadas no banco';
  console.warn(`[portfolio-clients.integration] suíte ignorada: ${motivo}.`);
  if (db) await db.close();
}

interface TestUser {
  id: string;
  email: string;
  token: string;
}

describe.skipIf(!enabled)('clientes, planos e contratos — integração com o Supabase real', () => {
  const run = randomUUID().slice(0, 8);
  const password = `Test-${randomUUID()}`;
  const users: TestUser[] = [];
  const orgSlugs: string[] = [];
  const supabase = createSupabaseClients(env);
  const dbClient = db as DbClient;
  const app = createApp(env, { db: dbClient, supabase });

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
    if (signIn.error || !signIn.data.session) {
      throw new Error(`login falhou: ${signIn.error?.message}`);
    }
    const user = { id: data.user.id, email, token: signIn.data.session.access_token };
    users.push(user);
    return user;
  }

  const bearer = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

  let ana: TestUser;
  let bia: TestUser;

  beforeAll(async () => {
    ana = await createTestUser('ana');
    bia = await createTestUser('bia');
    for (const [user, label] of [
      [ana, 'alfa'],
      [bia, 'beta'],
    ] as const) {
      const slug = `test-${run}-${label}`;
      orgSlugs.push(slug);
      const created = await request(app)
        .post('/api/v1/organizations')
        .set(bearer(user))
        .send({ name: `Test ${label} ${run}`, slug });
      if (created.status !== 201) throw new Error(`onboarding falhou: ${created.status}`);
    }
  }, 60_000);

  afterAll(async () => {
    const conn = dbClient.getDb();
    // As tabelas da Etapa 2 têm on delete cascade a partir de organizations.
    for (const slug of orgSlugs) {
      await conn.execute(sql`delete from public.organizations where slug = ${slug}`);
    }
    for (const user of users) {
      await conn.execute(
        sql`delete from public.organization_users where auth_user_id = ${user.id}`,
      );
      await supabase.getAdmin().auth.admin.deleteUser(user.id);
    }
    await dbClient.close();
  }, 60_000);

  it('cria cliente, plano e contrato; a lista traz o contrato ativo com o plano', async () => {
    const plan = await request(app)
      .post('/api/v1/plans')
      .set(bearer(ana))
      .send({ name: `test-${run}-Premium` });
    expect(plan.status).toBe(201);

    const client = await request(app)
      .post('/api/v1/clients')
      .set(bearer(ana))
      .send({ name: `test-${run} Alfa Tech`, externalCode: `test-${run}-1`, segment: 'Varejo' });
    expect(client.status).toBe(201);

    const contract = await request(app).post('/api/v1/contracts').set(bearer(ana)).send({
      portfolioClientId: client.body.client.id,
      planId: plan.body.plan.id,
      monthlyValue: 1234.56,
      startDate: '2026-01-01',
      contractedSlaHours: 24,
    });
    expect(contract.status).toBe(201);
    expect(contract.body.contract.monthlyValue).toBe(1234.56);

    const list = await request(app)
      .get(`/api/v1/clients?search=test-${run}&plan=test-${run}-Premium`)
      .set(bearer(ana));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].activeContract).toMatchObject({
      planName: `test-${run}-Premium`,
      monthlyValue: 1234.56,
      contractedSlaHours: 24,
    });
  });

  it('um segundo contrato ativo encerra o primeiro (índice parcial + service)', async () => {
    const detail = await request(app).get(`/api/v1/clients?search=test-${run}`).set(bearer(ana));
    const clientId = detail.body.items[0].id as string;
    const firstId = detail.body.items[0].activeContract.id as string;

    const second = await request(app)
      .post('/api/v1/contracts')
      .set(bearer(ana))
      .send({ portfolioClientId: clientId, monthlyValue: 2000, startDate: '2026-06-01' });
    expect(second.status).toBe(201);

    const first = await request(app).get(`/api/v1/contracts/${firstId}`).set(bearer(ana));
    expect(first.body.contract).toMatchObject({ status: 'ended', endDate: '2026-06-01' });
  });

  /**
   * Este caso existe porque o dublê nunca pegaria: a consulta montava SELECT DISTINCT em status
   * e ordenava por status::text, e o Postgres recusa a consulta inteira quando a expressão
   * ordenada não está na seleção. Nos testes com repositório em memória passava; na tela de
   * Clientes dava 500 e os filtros não abriam. Só o banco de verdade denuncia isso.
   */
  it('os filtros da tela de clientes vêm do banco sem quebrar a consulta', async () => {
    const res = await request(app).get('/api/v1/clients/filter-options').set(bearer(ana));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.segments)).toBe(true);
    expect(Array.isArray(res.body.sizes)).toBe(true);
    expect(Array.isArray(res.body.plans)).toBe(true);
    expect(Array.isArray(res.body.statuses)).toBe(true);
    // status é enum: a lista vem em ordem alfabética, não na ordem de declaração.
    expect([...res.body.statuses]).toEqual([...res.body.statuses].sort());
  });

  it('usuário da organização B não vê nem edita clientes da A', async () => {
    const mine = await request(app).get(`/api/v1/clients?search=test-${run}`).set(bearer(ana));
    const clientId = mine.body.items[0].id as string;

    const list = await request(app).get('/api/v1/clients').set(bearer(bia));
    expect(list.body.total).toBe(0);
    const get = await request(app).get(`/api/v1/clients/${clientId}`).set(bearer(bia));
    expect(get.status).toBe(404);
    const patch = await request(app)
      .patch(`/api/v1/clients/${clientId}`)
      .set(bearer(bia))
      .send({ name: 'Invadido' });
    expect(patch.status).toBe(404);
  });

  it('DELETE arquiva e some da lista padrão', async () => {
    const mine = await request(app).get(`/api/v1/clients?search=test-${run}`).set(bearer(ana));
    const clientId = mine.body.items[0].id as string;
    const archived = await request(app).delete(`/api/v1/clients/${clientId}`).set(bearer(ana));
    expect(archived.status).toBe(200);
    expect(archived.body.client.status).toBe('archived');

    const list = await request(app).get(`/api/v1/clients?search=test-${run}`).set(bearer(ana));
    expect(list.body.total).toBe(0);
    const onlyArchived = await request(app)
      .get(`/api/v1/clients?search=test-${run}&status=archived`)
      .set(bearer(ana));
    expect(onlyArchived.body.total).toBe(1);
  });
});
