/**
 * Integração com o Supabase REAL (auth + banco + storage). Só roda quando o .env da raiz (ou o
 * ambiente) tem DATABASE_URL e SUPABASE_* e as tabelas desta etapa (import_jobs) já foram
 * aplicadas; caso contrário a suíte fica skipped com um aviso.
 *
 * Cria usuário/organização com prefixo `test-`, sobe um CSV de clientes, confere a prévia,
 * confirma e verifica que o cliente e o contrato nasceram. Apaga tudo (linhas e objetos) no fim.
 * O recálculo vem desligado: esta organização de teste não tem modelo ativo, e o que está sendo
 * verificado aqui é a gravação, não o scoring.
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
import { IMPORTS_BUCKET } from '../storage.js';

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
      .execute<{ ok: string | null }>(sql`select to_regclass('public.import_jobs')::text as ok`);
    tablesReady = Array.from(rows)[0]?.ok !== null;
  } catch {
    tablesReady = false;
  }
}

const enabled = hasEnv && tablesReady;
if (!enabled) {
  const motivo = !hasEnv
    ? 'faltam DATABASE_URL/SUPABASE_* no ambiente'
    : 'as migrations da Etapa 7 (import_jobs) ainda não foram aplicadas no banco';
  console.warn(`[imports.integration] suíte ignorada: ${motivo}.`);
  if (db) await db.close();
}

describe.skipIf(!enabled)('imports — integração com o Supabase real', () => {
  const run = randomUUID().slice(0, 8);
  const password = `Test-${randomUUID()}`;
  const supabase = createSupabaseClients(env);
  const dbClient = db as DbClient;
  const app = createApp(env, { db: dbClient, supabase });

  let userId = '';
  let token = '';
  let organizationId = '';
  const slug = `test-${run}-imports`;
  const externalCode = `T${run.slice(0, 6).toUpperCase()}`;
  const bearer = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const email = `test-${run}-imports@example.com`;
    const created = await supabase.getAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw new Error(`createUser falhou: ${created.error?.message}`);
    }
    userId = created.data.user.id;

    const anon = createClient(env.SUPABASE_URL as string, env.SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await anon.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session) {
      throw new Error(`login falhou: ${signIn.error?.message}`);
    }
    token = signIn.data.session.access_token;

    const org = await request(app)
      .post('/api/v1/organizations')
      .set(bearer())
      .send({ name: `Test Imports ${run}`, slug });
    if (org.status !== 201) throw new Error(`onboarding falhou: ${JSON.stringify(org.body)}`);
    organizationId = org.body.organization.id;
  }, 60_000);

  afterAll(async () => {
    const conn = dbClient.getDb();
    if (organizationId !== '') {
      const folders = await supabase
        .getAdmin()
        .storage.from(IMPORTS_BUCKET)
        .list(organizationId, { limit: 100 });
      const paths: string[] = [];
      for (const folder of folders.data ?? []) {
        const inner = await supabase
          .getAdmin()
          .storage.from(IMPORTS_BUCKET)
          .list(`${organizationId}/${folder.name}`, { limit: 100 });
        for (const file of inner.data ?? []) {
          paths.push(`${organizationId}/${folder.name}/${file.name}`);
        }
      }
      if (paths.length > 0) await supabase.getAdmin().storage.from(IMPORTS_BUCKET).remove(paths);
    }
    // A organização cai em cascata: contratos, clientes, planos e o job vão junto.
    await conn.execute(sql`delete from public.organizations where slug = ${slug}`);
    if (userId !== '') {
      await conn.execute(sql`delete from public.organization_users where auth_user_id = ${userId}`);
      await supabase.getAdmin().auth.admin.deleteUser(userId);
    }
    await dbClient.close();
  }, 60_000);

  it('POST /imports sem token responde 401', async () => {
    const res = await request(app).post('/api/v1/imports');
    expect(res.status).toBe(401);
  });

  it('upload → prévia → confirmação cria o plano, o cliente e o contrato', async () => {
    const csv = Buffer.from(
      'cliente_id,segmento,porte,plano,valor_mensal,sla_contratado_h,inicio_contrato\n' +
        `${externalCode},Varejo,Medio,Essencial,2500,24,2025-01-01\n`,
    );
    const upload = await request(app)
      .post('/api/v1/imports')
      .set(bearer())
      .attach('file', csv, { filename: `test-${run}.csv`, contentType: 'text/csv' });
    expect(upload.status).toBe(201);
    const id: string = upload.body.job.id;
    expect(upload.body.job.organizationId).toBe(organizationId);
    expect(upload.body.sheets[0].detectedDataset).toBe('clients');

    const preview = await request(app).post(`/api/v1/imports/${id}/preview`).set(bearer()).send({});
    expect(preview.status).toBe(200);
    expect(preview.body.counts).toMatchObject({ total: 1, valid: 1, invalid: 0 });

    const confirm = await request(app)
      .post(`/api/v1/imports/${id}/confirm`)
      .set(bearer())
      .send({ recalculate: false });
    expect(confirm.status).toBe(200);
    expect(confirm.body.result).toMatchObject({
      plansCreated: 1,
      clientsCreated: 1,
      contractsCreated: 1,
    });

    const clients = await request(app).get('/api/v1/clients').set(bearer());
    expect(clients.status).toBe(200);
    expect(clients.body.items[0]).toMatchObject({ externalCode, segment: 'Varejo' });
    expect(clients.body.items[0].activeContract).toMatchObject({
      monthlyValue: 2500,
      contractedSlaHours: 24,
    });

    // Reimportar não duplica: o mesmo cliente é atualizado.
    const again = await request(app)
      .post(`/api/v1/imports/${id}/confirm`)
      .set(bearer())
      .send({ recalculate: false });
    expect(again.status).toBe(200);
    expect(again.body.result).toMatchObject({ clientsCreated: 0, clientsUpdated: 1 });

    const history = await request(app).get('/api/v1/imports').set(bearer());
    expect(history.body.total).toBe(1);
    expect(history.body.items[0].status).toBe('confirmed');
  }, 60_000);
});
