/**
 * Rotas de importação com dublês: token, organizações e persistência em memória, storage em
 * memória e o núcleo REAL do @inovaapss/importer (leitura, mapeamento e validação de verdade).
 *
 * O que cada bloco protege:
 *   upload   — allowlist de formato, bytes que não batem com a extensão, arquivo ilegível
 *   mapeamento — a sugestão sai pronta e a tela pode trocar de dataset sem outra requisição
 *   prévia   — conta certo o que é válido, inválido e duplicado, e NÃO grava nada
 *   confirmação — só grava depois de revalidar; recusa com linhas inválidas; é idempotente
 *   isolamento — uma organização nunca enxerga nem confirma a importação de outra (§5)
 */
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { writeWorkbook } from '@inovaapss/importer';

import {
  createFakeImportsRepository,
  createImportsStore,
  type ImportsStore,
} from './fake-repository.js';
import { createApp } from '../../../app.js';
import { parseApiEnv } from '../../../config/env.js';
import {
  createInMemoryDocumentStorage,
  type InMemoryDocumentStorage,
} from '../../../infrastructure/storage/memory-storage.js';
import { createFakeOrganizationsRepository } from '../../organizations/__tests__/fake-repository.js';

import type { DbClient } from '../../../infrastructure/db/index.js';
import type { SupabaseClients } from '../../../infrastructure/supabase.js';
import type { AuthUser } from '../../../middleware/auth.js';

const env = parseApiEnv({ NODE_ENV: 'test' });

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ANA: AuthUser = { userId: '11111111-1111-4111-8111-111111111111', email: 'ana@example.com' };
const BIA: AuthUser = { userId: '22222222-2222-4222-8222-222222222222', email: 'bia@example.com' };
const CAIO: AuthUser = {
  userId: '33333333-3333-4333-8333-333333333333',
  email: 'caio@example.com',
};

const USERS: Record<string, AuthUser> = { ana: ANA, bia: BIA, caio: CAIO };
const getUser = async (token: string): Promise<AuthUser | null> =>
  USERS[token.replace(/^token-/, '')] ?? null;
const as = (name: keyof typeof USERS) => `Bearer token-${String(name)}`;

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
    throw new Error('não usado: storage é um dublê');
  },
  getAnon: () => {
    throw new Error('não usado: getUser é um dublê');
  },
};

function membership(organizationId: string, user: AuthUser, role: 'owner' | 'viewer') {
  return {
    id: randomUUID(),
    organizationId,
    authUserId: user.userId,
    email: user.email,
    role,
    createdAt: '2026-09-20T00:00:00.000Z',
  } as const;
}

const organizationsRepository = () =>
  createFakeOrganizationsRepository({
    organizations: [
      { id: ORG_A, name: 'Org A', slug: 'org-a', createdAt: '', updatedAt: '' },
      { id: ORG_B, name: 'Org B', slug: 'org-b', createdAt: '', updatedAt: '' },
    ],
    members: [
      membership(ORG_A, ANA, 'owner'),
      membership(ORG_A, CAIO, 'viewer'),
      membership(ORG_B, BIA, 'owner'),
    ],
  });

let store: ImportsStore;
let storage: InMemoryDocumentStorage;
let recalculate: ReturnType<typeof vi.fn>;

function app() {
  return createApp(env, {
    db,
    supabase,
    apiV1: {
      getUser,
      organizationsRepository: organizationsRepository(),
      importsRepository: createFakeImportsRepository(store),
      importStorage: storage,
      recalculate: recalculate as unknown as (
        organizationId: string,
      ) => Promise<{ clients: number }>,
    },
  });
}

/** As dez métricas do preset GlobalSys cadastradas na organização A. */
function seedMetricDefinitions() {
  for (const slug of [
    'critical_tickets',
    'open_tickets',
    'resolution_vs_sla',
    'platform_usage',
    'sla_compliance',
    'formal_complaints',
    'payment_delay',
    'reopened_tickets',
    'missed_meetings',
    'nps_dissatisfaction',
  ]) {
    store.metricDefinitions.set(slug, randomUUID());
  }
}

const CLIENTS_CSV = [
  'cliente_id;nome;segmento;porte;plano;valor_mensal;sla_contratado_h;inicio_contrato',
  'C001;Alfa Ltda;Varejo;Médio;Essencial;1500,50;24;2024-03-01',
  'C002;Beta SA;Indústria;Grande;Enterprise;9800;8;01/02/2023',
].join('\n');

const MONTHLY_CSV = [
  'cliente_id;mes_ref;chamados_abertos;chamados_criticos;chamados_reabertos;pct_sla_cumprido;uso_plataforma_pct',
  'C001;2025-01;10;2;1;95,5;80',
  'C001;2025-02;8;0;0;100;82',
].join('\n');

/** Envia um arquivo e devolve o corpo da resposta de POST /imports. */
async function upload(
  content: string | Buffer,
  fileName: string,
  contentType: string,
  token = as('ana'),
) {
  return request(app())
    .post('/api/v1/imports')
    .set('Authorization', token)
    .attach('file', Buffer.from(content), { filename: fileName, contentType });
}

beforeEach(() => {
  store = createImportsStore();
  storage = createInMemoryDocumentStorage();
  recalculate = vi.fn(async () => ({ clients: 2 }));
});

describe('POST /imports', () => {
  it('aceita CSV, guarda o arquivo e sugere o dataset e o mapeamento', async () => {
    const res = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');

    expect(res.status).toBe(201);
    expect(res.body.job).toMatchObject({
      fileName: 'clientes.csv',
      fileType: 'CSV',
      status: 'uploaded',
      organizationId: ORG_A,
      createdBy: ANA.userId,
      rowsImported: 0,
    });
    expect(storage.objects.size).toBe(1);
    expect([...storage.objects.keys()][0]).toContain(`${ORG_A}/${res.body.job.id}/`);

    expect(res.body.sheets).toHaveLength(1);
    const sheet = res.body.sheets[0];
    expect(sheet.rowCount).toBe(2);
    expect(sheet.headers).toContain('valor_mensal');
    expect(sheet.sampleRows[0]).toMatchObject({ cliente_id: 'C001', nome: 'Alfa Ltda' });

    // O primeiro candidato é "clientes" e já vem com o mapeamento pronto.
    const best = sheet.suggestions[0];
    expect(best.dataset).toBe('clients');
    expect(best.missingRequired).toEqual([]);
    expect(best.mapping).toMatchObject({
      external_code: 'cliente_id',
      monthly_value: 'valor_mensal',
      contract_start: 'inicio_contrato',
    });
    // Os quatro datasets vêm juntos: trocar de tipo na tela não exige outra requisição.
    expect(res.body.sheets[0].suggestions).toHaveLength(4);
  });

  it('lê um XLSX com várias abas, uma por tabela', async () => {
    const workbook = writeWorkbook([
      {
        name: 'clientes',
        matrix: [
          ['cliente_id', 'segmento', 'porte', 'plano', 'valor_mensal', 'sla_h', 'inicio_contrato'],
          ['C001', 'Varejo', 'Médio', 'Essencial', 1500, 24, '2024-03-01'],
        ],
      },
      {
        name: 'atendimento_mensal',
        matrix: [
          ['cliente_id', 'mes_ref', 'chamados_abertos'],
          ['C001', '2025-01', 10],
        ],
      },
    ]);

    const res = await upload(
      workbook,
      'base.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    expect(res.status).toBe(201);
    expect(res.body.job.fileType).toBe('XLSX');
    expect(res.body.sheets.map((sheet: { name: string }) => sheet.name)).toEqual([
      'clientes',
      'atendimento_mensal',
    ]);
    expect(res.body.sheets[1].suggestions[0].dataset).toBe('monthly_metrics');
  });

  it('recusa extensão fora da allowlist', async () => {
    const res = await upload('texto qualquer', 'notas.txt', 'text/plain');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('recusa conteúdo que não bate com a extensão', async () => {
    const res = await upload(
      Buffer.from([0x00, 0x01, 0x02, 0x03]),
      'planilha.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.status).toBe(415);
    expect(res.body.error.message).toContain('XLSX');
  });

  it('recusa JSON quebrado sem gravar nada', async () => {
    const res = await upload('{ isto não é json', 'dados.json', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNREADABLE_FILE');
    expect(storage.objects.size).toBe(0);
    expect(store.jobs).toHaveLength(0);
  });

  it('não deixa viewer importar (§5)', async () => {
    const res = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv', as('caio'));
    expect(res.status).toBe(403);
  });

  it('exige autenticação', async () => {
    const res = await request(app()).post('/api/v1/imports');
    expect(res.status).toBe(401);
  });
});

describe('GET /imports/datasets', () => {
  it('lista os quatro datasets com os campos e o que é obrigatório', async () => {
    const res = await request(app())
      .get('/api/v1/imports/datasets')
      .set('Authorization', as('ana'));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(4);
    const clients = res.body.items.find((item: { key: string }) => item.key === 'clients');
    expect(clients.label).toBe('Clientes');
    expect(clients.naturalKey).toEqual(['external_code']);
    const monthlyValue = clients.fields.find(
      (field: { key: string }) => field.key === 'monthly_value',
    );
    expect(monthlyValue).toMatchObject({
      label: 'Valor mensal (R$)',
      type: 'number',
      required: true,
    });
  });
});

describe('POST /imports/:id/preview', () => {
  it('valida com o mapeamento escolhido e não grava nada', async () => {
    const uploaded = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');
    const { job, sheets } = uploaded.body;

    const res = await request(app())
      .post(`/api/v1/imports/${job.id}/preview`)
      .set('Authorization', as('ana'))
      .send({ sheet: 'csv', dataset: 'clients', mapping: sheets[0].suggestions[0].mapping });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      total: 2,
      valid: 2,
      invalid: 0,
      duplicates: 0,
      missingFields: [],
      errorCount: 0,
    });
    // Coerção conferida no resultado: "1500,50" virou número e a data virou AAAA-MM-DD.
    expect(res.body.sampleRows[0]).toMatchObject({
      external_code: 'C001',
      monthly_value: 1500.5,
      contract_start: '2024-03-01',
    });
    expect(res.body.sampleRows[1]).toMatchObject({ contract_start: '2023-02-01' });

    // Nada foi gravado: só o mapeamento ficou salvo no job.
    expect(store.clients).toHaveLength(0);
    expect(store.jobs[0]?.status).toBe('previewed');
    expect(store.jobs[0]?.dataset).toBe('clients');
  });

  it('aponta linha a linha o que está errado, em português', async () => {
    const csv = [
      'cliente_id;segmento;porte;plano;valor_mensal;sla_contratado_h;inicio_contrato',
      'C001;Varejo;Médio;Essencial;1500;24;2024-03-01',
      ';Varejo;Médio;Essencial;1500;24;2024-03-01',
      'C003;Varejo;Médio;Essencial;abc;24;2024-03-01',
      'C001;Varejo;Médio;Essencial;1500;24;2024-03-01',
    ].join('\n');
    const uploaded = await upload(csv, 'clientes.csv', 'text/csv');
    const { job, sheets } = uploaded.body;

    const res = await request(app())
      .post(`/api/v1/imports/${job.id}/preview`)
      .set('Authorization', as('ana'))
      .send({ sheet: 'csv', dataset: 'clients', mapping: sheets[0].suggestions[0].mapping });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 4, valid: 1, invalid: 2, duplicates: 1 });

    const codes = res.body.errors.map((error: { code: string }) => error.code);
    expect(codes).toContain('MISSING_REQUIRED');
    expect(codes).toContain('INVALID_NUMBER');
    expect(codes).toContain('DUPLICATE');

    const duplicate = res.body.errors.find((error: { code: string }) => error.code === 'DUPLICATE');
    expect(duplicate.row).toBe(4);
    expect(duplicate.message).toContain('C001');
    // A linha crua acompanha o erro, para quem for corrigir a origem.
    expect(duplicate.rawData).toMatchObject({ cliente_id: 'C001' });
  });

  it('recusa um campo que não existe no dataset', async () => {
    const uploaded = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');
    const res = await request(app())
      .post(`/api/v1/imports/${uploaded.body.job.id}/preview`)
      .set('Authorization', as('ana'))
      .send({ sheet: 'csv', dataset: 'clients', mapping: { inventado: 'cliente_id' } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MAPPING');
  });

  it('recusa uma coluna que não existe no arquivo', async () => {
    const uploaded = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');
    const res = await request(app())
      .post(`/api/v1/imports/${uploaded.body.job.id}/preview`)
      .set('Authorization', as('ana'))
      .send({ sheet: 'csv', dataset: 'clients', mapping: { external_code: 'coluna_fantasma' } });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('coluna_fantasma');
  });

  it('recusa uma tabela que não existe no arquivo', async () => {
    const uploaded = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');
    const res = await request(app())
      .post(`/api/v1/imports/${uploaded.body.job.id}/preview`)
      .set('Authorization', as('ana'))
      .send({ sheet: 'aba_que_nao_existe', dataset: 'clients', mapping: {} });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SHEET_NOT_FOUND');
  });
});

describe('POST /imports/:id/confirm', () => {
  /** Sobe o CSV de clientes, roda a prévia e devolve o id do job pronto para confirmar. */
  async function uploadAndPreview(csv = CLIENTS_CSV, dataset = 'clients', sheet = 'csv') {
    const uploaded = await upload(csv, 'clientes.csv', 'text/csv');
    const { job, sheets } = uploaded.body;
    const suggestion = sheets
      .find((item: { name: string }) => item.name === sheet)
      .suggestions.find((item: { dataset: string }) => item.dataset === dataset);
    await request(app())
      .post(`/api/v1/imports/${job.id}/preview`)
      .set('Authorization', as('ana'))
      .send({ sheet, dataset, mapping: suggestion.mapping });
    return job.id as string;
  }

  it('grava os clientes, o plano e o contrato, e dispara o recálculo', async () => {
    const id = await uploadAndPreview();

    const res = await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.imported).toMatchObject({ rows: 2, recordsCreated: 2, recordsUpdated: 0 });
    expect(res.body.job).toMatchObject({ status: 'done', rowsImported: 2 });
    expect(res.body.job.confirmedAt).not.toBeNull();
    expect(res.body.recalculated).toEqual({ ok: true, clients: 2 });
    expect(recalculate).toHaveBeenCalledWith(ORG_A);

    expect(store.clients.map((client) => client.externalCode).sort()).toEqual(['C001', 'C002']);
    expect(store.clients[0]).toMatchObject({ name: 'Alfa Ltda', segment: 'Varejo', size: 'Médio' });
    expect(store.plans.map((plan) => plan.name).sort()).toEqual(['Enterprise', 'Essencial']);
    expect(store.contracts).toHaveLength(2);
    expect(store.contracts[0]).toMatchObject({
      monthlyValue: 1500.5,
      startDate: '2024-03-01',
      contractedSlaHours: 24,
      status: 'active',
    });
  });

  it('reimportar o mesmo arquivo atualiza em vez de duplicar', async () => {
    const first = await uploadAndPreview();
    await request(app())
      .post(`/api/v1/imports/${first}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    const second = await uploadAndPreview();
    const res = await request(app())
      .post(`/api/v1/imports/${second}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    expect(res.body.imported).toMatchObject({ rows: 2, recordsCreated: 0, recordsUpdated: 2 });
    expect(store.clients).toHaveLength(2);
    expect(store.contracts).toHaveLength(2);
  });

  it('recusa quando há linhas inválidas e guarda os erros para a tela', async () => {
    const csv = [
      'cliente_id;segmento;porte;plano;valor_mensal;sla_contratado_h;inicio_contrato',
      'C001;Varejo;Médio;Essencial;1500;24;2024-03-01',
      'C002;Varejo;Médio;Essencial;;24;2024-03-01',
    ].join('\n');
    const id = await uploadAndPreview(csv);

    const res = await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IMPORT_HAS_INVALID_ROWS');
    expect(store.clients).toHaveLength(0);

    const errors = await request(app())
      .get(`/api/v1/imports/${id}/errors`)
      .set('Authorization', as('ana'));
    expect(errors.status).toBe(200);
    expect(errors.body.total).toBeGreaterThan(0);
    expect(errors.body.items[0]).toMatchObject({ row: 2, code: 'MISSING_REQUIRED' });
  });

  it('com ignoreInvalidRows importa as válidas e registra as recusadas', async () => {
    const csv = [
      'cliente_id;segmento;porte;plano;valor_mensal;sla_contratado_h;inicio_contrato',
      'C001;Varejo;Médio;Essencial;1500;24;2024-03-01',
      'C002;Varejo;Médio;Essencial;;24;2024-03-01',
    ].join('\n');
    const id = await uploadAndPreview(csv);

    const res = await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set('Authorization', as('ana'))
      .send({ ignoreInvalidRows: true });

    expect(res.status).toBe(200);
    expect(res.body.imported.rows).toBe(1);
    expect(store.clients.map((client) => client.externalCode)).toEqual(['C001']);
    expect(store.rowErrors.get(id)).toHaveLength(1);
  });

  it('grava os valores mensais de cada métrica do preset', async () => {
    seedMetricDefinitions();
    // A carteira precisa existir antes: o atendimento mensal referencia o cliente.
    const clientsJob = await uploadAndPreview();
    await request(app())
      .post(`/api/v1/imports/${clientsJob.toString()}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    const monthlyUpload = await upload(MONTHLY_CSV, 'mensal.csv', 'text/csv');
    const suggestion = monthlyUpload.body.sheets[0].suggestions.find(
      (item: { dataset: string }) => item.dataset === 'monthly_metrics',
    );
    const monthlyId = monthlyUpload.body.job.id;
    await request(app())
      .post(`/api/v1/imports/${monthlyId}/preview`)
      .set('Authorization', as('ana'))
      .send({ sheet: 'csv', dataset: 'monthly_metrics', mapping: suggestion.mapping });

    const res = await request(app())
      .post(`/api/v1/imports/${monthlyId}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.imported.rows).toBe(2);
    // Duas linhas × nove métricas do preset.
    expect(res.body.imported.recordsCreated).toBe(18);

    const client = store.clients.find((item) => item.externalCode === 'C001');
    const values = [...store.metricValues.values()].filter(
      (value) => value.portfolioClientId === client?.id,
    );
    const slaJaneiro = values.find(
      (value) => value.metricSlug === 'sla_compliance' && value.periodStart === '2025-01-01',
    );
    expect(slaJaneiro).toMatchObject({ value: 95.5, periodEnd: '2025-01-31', source: 'CSV' });
    // §11: reabertos é TAXA sobre os abertos (1 de 10 = 10 %), não a contagem.
    const reabertos = values.find(
      (value) => value.metricSlug === 'reopened_tickets' && value.periodStart === '2025-01-01',
    );
    expect(reabertos?.value).toBe(10);
    // §15: sem reuniões previstas, "não se aplica" — valor nulo, nunca 0 %.
    const reunioes = values.find((value) => value.metricSlug === 'missed_meetings');
    expect(reunioes?.value).toBeNull();
  });

  it('aponta o cliente que não está na carteira em vez de inventá-lo', async () => {
    seedMetricDefinitions();
    const uploaded = await upload(MONTHLY_CSV, 'mensal.csv', 'text/csv');
    const suggestion = uploaded.body.sheets[0].suggestions.find(
      (item: { dataset: string }) => item.dataset === 'monthly_metrics',
    );
    const id = uploaded.body.job.id;
    await request(app())
      .post(`/api/v1/imports/${id}/preview`)
      .set('Authorization', as('ana'))
      .send({ sheet: 'csv', dataset: 'monthly_metrics', mapping: suggestion.mapping });

    const res = await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.imported.rows).toBe(0);
    expect(res.body.imported.skipped).toHaveLength(2);
    expect(res.body.imported.skipped[0]).toMatchObject({ row: 1, externalCode: 'C001' });
    expect(res.body.imported.skipped[0].reason).toContain('não está na carteira');
    expect(store.metricValues.size).toBe(0);
    // O motivo fica guardado para a tela de erros, não só na resposta.
    expect(store.rowErrors.get(id)?.[0]?.message).toContain('C001');
  });

  it('a importação segue valendo quando o recálculo falha', async () => {
    recalculate.mockRejectedValueOnce(new Error('Nenhuma versão de modelo ativa.'));
    const id = await uploadAndPreview();

    const res = await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.job.status).toBe('done');
    expect(res.body.recalculated).toMatchObject({ ok: false });
    expect(res.body.recalculated.reason).toContain('modelo ativa');
    expect(store.clients).toHaveLength(2);
  });

  it('não confirma duas vezes o mesmo job', async () => {
    const id = await uploadAndPreview();
    await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    const again = await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('IMPORT_ALREADY_CONFIRMED');
  });

  it('não confirma sem mapeamento', async () => {
    const uploaded = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');
    const res = await request(app())
      .post(`/api/v1/imports/${uploaded.body.job.id}/confirm`)
      .set('Authorization', as('ana'))
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IMPORT_NOT_MAPPED');
  });

  it('não deixa viewer confirmar', async () => {
    const id = await uploadAndPreview();
    const res = await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set('Authorization', as('caio'))
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('isolamento entre organizações (§5)', () => {
  it('a organização B não vê nem confirma a importação da A', async () => {
    const uploaded = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');
    const id = uploaded.body.job.id;

    const get = await request(app()).get(`/api/v1/imports/${id}`).set('Authorization', as('bia'));
    expect(get.status).toBe(404);

    const confirm = await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set('Authorization', as('bia'))
      .send({});
    expect(confirm.status).toBe(404);

    const list = await request(app()).get('/api/v1/imports').set('Authorization', as('bia'));
    expect(list.body.items).toEqual([]);
  });
});

describe('GET /imports e GET /imports/:id', () => {
  it('lista as importações da organização, da mais recente para a mais antiga', async () => {
    await upload(CLIENTS_CSV, 'primeira.csv', 'text/csv');
    await upload(CLIENTS_CSV, 'segunda.csv', 'text/csv');

    const res = await request(app()).get('/api/v1/imports').set('Authorization', as('ana'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, total: 2 });
    expect(res.body.items.map((job: { fileName: string }) => job.fileName)).toEqual([
      'segunda.csv',
      'primeira.csv',
    ]);
  });

  it('devolve a importação com as tabelas relidas do arquivo', async () => {
    const uploaded = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');

    const res = await request(app())
      .get(`/api/v1/imports/${uploaded.body.job.id}`)
      .set('Authorization', as('ana'));

    expect(res.status).toBe(200);
    expect(res.body.job.fileName).toBe('clientes.csv');
    expect(res.body.sheets[0].rowCount).toBe(2);
  });

  it('não quebra quando o arquivo sumiu do armazenamento', async () => {
    const uploaded = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');
    storage.objects.clear();

    const res = await request(app())
      .get(`/api/v1/imports/${uploaded.body.job.id}`)
      .set('Authorization', as('ana'));

    expect(res.status).toBe(200);
    expect(res.body.sheets).toBeNull();
  });
});
