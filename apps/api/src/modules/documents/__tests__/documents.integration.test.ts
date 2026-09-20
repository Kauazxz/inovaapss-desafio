/**
 * Integração com o Supabase REAL (auth + banco + storage). Só roda quando o .env da raiz (ou o
 * ambiente) tem DATABASE_URL e SUPABASE_* e as tabelas desta etapa (uploaded_documents) já
 * foram aplicadas; caso contrário a suíte fica skipped com um aviso.
 *
 * Cria usuário/organização com prefixo `test-`, envia um CSV para o bucket privado e apaga tudo
 * (linhas e objetos) no final.
 */
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app.js';
import { type ApiEnv, loadEnvFiles, parseApiEnv } from '../../../config/env.js';
import { createDbClient, type DbClient } from '../../../infrastructure/db/index.js';
import { DOCUMENTS_BUCKET } from '../../../infrastructure/storage/supabase-storage.js';
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
    // Além das tabelas, a coluna `origin` (arquivo da organização) precisa estar aplicada.
    const rows = await db.getDb().execute<{ ok: string | null; origem: number }>(
      sql`select to_regclass('public.metric_extraction_suggestions')::text as ok,
                 count(*)::int as origem
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'uploaded_documents'
             and column_name = 'origin'`,
    );
    const row = Array.from(rows)[0];
    tablesReady = row?.ok !== null && row?.ok !== undefined && row.origem > 0;
  } catch {
    tablesReady = false;
  }
}

const enabled = hasEnv && tablesReady;
if (!enabled) {
  const motivo = !hasEnv
    ? 'faltam DATABASE_URL/SUPABASE_* no ambiente'
    : 'as migrations da Etapa 11 (uploaded_documents, incluindo a coluna origin) ainda não foram aplicadas no banco';
  console.warn(`[documents.integration] suíte ignorada: ${motivo}.`);
  if (db) await db.close();
}

describe.skipIf(!enabled)('documents — integração com o Supabase real', () => {
  const run = randomUUID().slice(0, 8);
  const password = `Test-${randomUUID()}`;
  const supabase = createSupabaseClients(env);
  const dbClient = db as DbClient;
  const app = createApp(env, { db: dbClient, supabase });

  let userId = '';
  let token = '';
  let organizationId = '';
  const slug = `test-${run}-docs`;
  const bearer = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const email = `test-${run}-docs@example.com`;
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
      .send({ name: `Test Docs ${run}`, slug });
    if (org.status !== 201) throw new Error(`onboarding falhou: ${JSON.stringify(org.body)}`);
    organizationId = org.body.organization.id;
  }, 60_000);

  afterAll(async () => {
    const conn = dbClient.getDb();
    if (organizationId !== '') {
      const files = await supabase
        .getAdmin()
        .storage.from(DOCUMENTS_BUCKET)
        .list(organizationId, { limit: 100 });
      const paths: string[] = [];
      for (const folder of files.data ?? []) {
        const inner = await supabase
          .getAdmin()
          .storage.from(DOCUMENTS_BUCKET)
          .list(`${organizationId}/${folder.name}`, { limit: 100 });
        for (const file of inner.data ?? []) {
          paths.push(`${organizationId}/${folder.name}/${file.name}`);
        }
      }
      if (paths.length > 0) await supabase.getAdmin().storage.from(DOCUMENTS_BUCKET).remove(paths);
    }
    await conn.execute(sql`delete from public.organizations where slug = ${slug}`);
    if (userId !== '') {
      await conn.execute(sql`delete from public.organization_users where auth_user_id = ${userId}`);
      await supabase.getAdmin().auth.admin.deleteUser(userId);
    }
    await dbClient.close();
  }, 60_000);

  it('POST /documents sem token responde 401', async () => {
    const res = await request(app).post('/api/v1/documents');
    expect(res.status).toBe(401);
  });

  it('upload → detalhe com URL assinada → extração → sugestão → aceite', async () => {
    const csv = Buffer.from('cliente_id,mes_ref,pct_sla_cumprido\nC001,2026-07,91.5\n');
    const upload = await request(app)
      .post('/api/v1/documents')
      .set(bearer())
      .attach('file', csv, { filename: `test-${run}.csv`, contentType: 'text/csv' });
    expect(upload.status).toBe(201);
    const id: string = upload.body.document.id;
    expect(upload.body.document.organizationId).toBe(organizationId);

    const detail = await request(app).get(`/api/v1/documents/${id}`).set(bearer());
    expect(detail.status).toBe(200);
    expect(detail.body.document.downloadUrl).toMatch(/^https?:\/\//);

    const downloaded = await fetch(detail.body.document.downloadUrl);
    expect(downloaded.status).toBe(200);
    expect(await downloaded.text()).toBe(csv.toString());

    const extracted = await request(app)
      .post(`/api/v1/documents/${id}/extract-metrics`)
      .set(bearer());
    expect(extracted.status).toBe(200);
    expect(extracted.body.document.status).toBe('extracted');
    expect(extracted.body.document.extractedTextPreview).toContain('pct_sla_cumprido');

    const created = await request(app)
      .post(`/api/v1/documents/${id}/suggestions`)
      .set(bearer())
      .send({
        suggestedName: `Cumprimento de SLA ${run}`,
        suggestedType: 'PERCENTAGE',
        suggestedDirection: 'HIGHER_IS_BETTER',
        unit: '%',
        suggestedWeight: 0.12,
        suggestedThresholds: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
      });
    expect(created.status).toBe(201);
    expect(created.body.suggestion.suggestedWeight).toBe(0.12);

    const accepted = await request(app)
      .post(`/api/v1/metric-suggestions/${created.body.suggestion.id}/accept`)
      .set(bearer());
    expect(accepted.status).toBe(200);
    expect(accepted.body.suggestion.status).toBe('accepted');
    expect(accepted.body.metricPayload).toMatchObject({
      metricType: 'PERCENTAGE',
      sourceType: 'DOCUMENT',
      normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
    });

    const list = await request(app).get(`/api/v1/documents/${id}/suggestions`).set(bearer());
    // Uma sugestão vem da análise automática da coluna pct_sla_cumprido e outra é a manual.
    expect(list.body.total).toBe(2);
    expect(list.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'automatic-local', status: 'pending' }),
        expect.objectContaining({ id: created.body.suggestion.id, status: 'accepted' }),
      ]),
    );
  }, 60_000);
});
