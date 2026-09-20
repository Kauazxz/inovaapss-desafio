/**
 * Integração com o Supabase REAL (auth + banco). Só roda quando o .env da raiz (ou o ambiente)
 * tem DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY e as tabelas
 * da Etapa 1 já foram aplicadas; caso contrário a suíte fica skipped com um aviso.
 *
 * Cria usuários e organizações com prefixo `test-` e apaga tudo no final.
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

let db: DbClient | undefined;
let tablesReady = false;

if (hasEnv) {
  db = createDbClient(env.DATABASE_URL);
  try {
    const rows = await db
      .getDb()
      .execute<{ ok: string | null }>(
        sql`select to_regclass('public.organization_users')::text as ok`,
      );
    tablesReady = Array.from(rows)[0]?.ok !== null;
  } catch {
    tablesReady = false;
  }
}

const enabled = hasEnv && tablesReady;
if (!enabled) {
  const motivo = !hasEnv
    ? 'faltam DATABASE_URL/SUPABASE_* no ambiente'
    : 'as migrations da Etapa 1 ainda não foram aplicadas no banco';
  console.warn(`[organizations.integration] suíte ignorada: ${motivo}.`);
  if (db) await db.close();
}

interface TestUser {
  id: string;
  email: string;
  token: string;
}

describe.skipIf(!enabled)('organizations — integração com o Supabase real', () => {
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

  let ana: TestUser;
  let bia: TestUser;

  beforeAll(async () => {
    ana = await createTestUser('ana');
    bia = await createTestUser('bia');
  }, 60_000);

  afterAll(async () => {
    const conn = dbClient.getDb();
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

  const bearer = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

  it('GET /me sem token responde 401', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
  });

  it('GET /me com token válido e sem organização responde organization null', async () => {
    const res = await request(app).get('/api/v1/me').set(bearer(ana));
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: ana.id, email: ana.email });
    expect(res.body.organization).toBeNull();
  });

  it('POST /organizations cria a organização e GET /me passa a devolvê-la', async () => {
    const slug = `test-${run}-alfa`;
    orgSlugs.push(slug);
    const created = await request(app)
      .post('/api/v1/organizations')
      .set(bearer(ana))
      .send({ name: `Test Alfa ${run}`, slug });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('owner');

    const me = await request(app).get('/api/v1/me').set(bearer(ana));
    expect(me.body.organization).toMatchObject({ slug });
    expect(me.body.role).toBe('owner');
  });

  it('usuário da organização A não vê a organização B', async () => {
    const slug = `test-${run}-beta`;
    orgSlugs.push(slug);
    const created = await request(app)
      .post('/api/v1/organizations')
      .set(bearer(bia))
      .send({ name: `Test Beta ${run}`, slug });
    expect(created.status).toBe(201);

    const anaCurrent = await request(app).get('/api/v1/organizations/current').set(bearer(ana));
    const biaCurrent = await request(app).get('/api/v1/organizations/current').set(bearer(bia));
    expect(anaCurrent.body.organization.slug).toBe(`test-${run}-alfa`);
    expect(biaCurrent.body.organization.slug).toBe(slug);

    const anaUsers = await request(app).get('/api/v1/organizations/current/users').set(bearer(ana));
    expect(anaUsers.status).toBe(200);
    expect(anaUsers.body.items).toHaveLength(1);
    expect(anaUsers.body.items[0]).toMatchObject({ authUserId: ana.id, email: ana.email });
  });

  it('PATCH /organizations/current pelo owner altera só a própria organização', async () => {
    const res = await request(app)
      .patch('/api/v1/organizations/current')
      .set(bearer(bia))
      .send({ name: `Test Beta ${run} editada` });
    expect(res.status).toBe(200);
    expect(res.body.organization.name).toBe(`Test Beta ${run} editada`);

    const anaCurrent = await request(app).get('/api/v1/organizations/current').set(bearer(ana));
    expect(anaCurrent.body.organization.name).toBe(`Test Alfa ${run}`);
  });

  it('convite de um e-mail já existente no Auth vincula sem criar outro usuário nem revelar isso', async () => {
    const res = await request(app)
      .post('/api/v1/organizations/current/users')
      .set(bearer(ana))
      .send({ email: bia.email, role: 'analyst' });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('outcome');
    expect(res.body.member).toMatchObject({ authUserId: bia.id, role: 'analyst' });
  });
});
