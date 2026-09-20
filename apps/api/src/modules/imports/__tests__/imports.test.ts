/**
 * Rotas de importação com dublês: token, organizações, persistência, gravação e storage em
 * memória; o núcleo de leitura e validação é o @inovaapss/importer de verdade.
 *
 * A planilha dos testes é montada aqui com `writeWorkbook`, pequena mas com os mesmos nomes de
 * aba e de coluna da planilha do desafio — é assim que o preset é exercitado.
 */
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { writeWorkbook } from '@inovaapss/importer';

import {
  createFakeImportsRepository,
  createFakeIngestRepository,
  type FakeImportsRepository,
  type FakeIngestRepository,
} from './fake-repository.js';
import { createApp } from '../../../app.js';
import { parseApiEnv } from '../../../config/env.js';
import {
  createInMemoryDocumentStorage,
  type InMemoryDocumentStorage,
} from '../../../infrastructure/storage/memory-storage.js';
import {
  createFakeDocumentsRepository,
  type FakeDocumentsRepository,
} from '../../documents/__tests__/fake-repository.js';
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
const DANI: AuthUser = {
  userId: '44444444-4444-4444-8444-444444444444',
  email: 'dani@example.com',
};

const USERS: Record<string, AuthUser> = { ana: ANA, bia: BIA, caio: CAIO, dani: DANI };
const getUser = async (token: string): Promise<AuthUser | null> =>
  USERS[token.replace(/^token-/, '')] ?? null;

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

function membership(organizationId: string, user: AuthUser, role: 'owner' | 'analyst' | 'viewer') {
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
      membership(ORG_A, DANI, 'analyst'),
      membership(ORG_B, BIA, 'owner'),
    ],
  });

/** As métricas que a organização de teste tem cadastradas (slugs do preset GlobalSys). */
const METRIC_SLUGS = [
  'open_tickets',
  'critical_tickets',
  'resolution_vs_sla',
  'platform_usage',
  'sla_compliance',
  'formal_complaints',
  'payment_delay',
  'reopened_tickets',
  'missed_meetings',
  'nps_dissatisfaction',
];

let repository: FakeImportsRepository;
let ingest: FakeIngestRepository;
let storage: InMemoryDocumentStorage;
let recalculate: ReturnType<typeof vi.fn>;
let documents: FakeDocumentsRepository;

function app() {
  return createApp(env, {
    db,
    supabase,
    apiV1: {
      getUser,
      organizationsRepository: organizationsRepository(),
      documentsRepository: documents,
      importsRepository: repository,
      importIngestRepository: ingest,
      importStorage: storage,
      importRecalculate: recalculate as never,
    },
  });
}

const as = (name: string) => ({ Authorization: `Bearer token-${name}` });

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Planilha com as quatro abas do desafio, em miniatura. C001 é um cliente saudável; C002 não
 * teve reunião marcada nem respondeu a pesquisa (os dois casos de "não se aplica"); C003 vem
 * com o valor mensal em branco, para a validação recusar a linha.
 */
function challengeWorkbook(): Buffer {
  return writeWorkbook([
    {
      name: 'clientes',
      matrix: [
        [
          'cliente_id',
          'segmento',
          'porte',
          'plano',
          'valor_mensal',
          'sla_contratado_h',
          'inicio_contrato',
        ],
        ['C001', 'Varejo', 'Medio', 'Essencial', 3200, 24, '2024-01-01'],
        ['C002', 'Industria', 'Grande', 'Enterprise', 31000, 6, '2023-05-01'],
        ['C003', 'Servicos', 'Pequeno', 'Avancado', '', 12, '2025-02-01'],
      ],
    },
    {
      name: 'atendimento_mensal',
      matrix: [
        [
          'cliente_id',
          'mes_ref',
          'chamados_abertos',
          'chamados_criticos',
          'chamados_reabertos',
          'chamados_dentro_sla',
          'pct_sla_cumprido',
          'tempo_medio_resolucao_h',
          'reclamacoes_formais',
          'uso_plataforma_pct',
          'dias_atraso_pagamento',
          'reunioes_previstas',
          'reunioes_realizadas',
        ],
        ['C001', '2026-07', 10, 1, 2, 9, 90, 5, 0, 80, 0, 2, 1],
        ['C002', '2026-07', 0, 0, 0, 0, '', 0, 0, 55, 3, 0, 0],
      ],
    },
    {
      name: 'pesquisas_nps',
      matrix: [
        ['cliente_id', 'mes_ref', 'respondeu', 'nota_nps'],
        ['C001', '2026-07', 1, 9],
        ['C002', '2026-07', 0, ''],
      ],
    },
    {
      name: 'situacao_clientes',
      matrix: [
        ['cliente_id', 'situacao', 'mes_cancelamento'],
        ['C001', 'Ativo', ''],
        ['C002', 'Cancelado', '2026-08'],
      ],
    },
    // A planilha do desafio tem abas de texto; elas precisam ser ignoradas sem erro.
    { name: 'Leia-me', matrix: [['instrucoes'], ['Preencha uma linha por cliente.']] },
  ]);
}

const CLIENTS_CSV = Buffer.from(
  'cliente_id;segmento;porte;plano;valor_mensal;sla_contratado_h;inicio_contrato\n' +
    'C010;Varejo;Medio;Essencial;1500,50;24;01/03/2025\n',
);

async function upload(
  body: Buffer,
  fileName: string,
  contentType: string,
  who = 'ana',
): Promise<request.Response> {
  return request(app())
    .post('/api/v1/imports')
    .set(as(who))
    .attach('file', body, { filename: fileName, contentType });
}

async function uploadWorkbook(who = 'ana') {
  const res = await upload(challengeWorkbook(), 'base.xlsx', XLSX_MIME, who);
  return res;
}

beforeEach(() => {
  repository = createFakeImportsRepository();
  ingest = createFakeIngestRepository(METRIC_SLUGS);
  storage = createInMemoryDocumentStorage();
  documents = createFakeDocumentsRepository();
  recalculate = vi.fn(async () => ({
    clients: 2,
    clientSnapshots: 2,
    metricSnapshots: 18,
    alerts: 1,
  }));
});

describe('POST /api/v1/imports', () => {
  it('responde 401 sem token', async () => {
    const res = await request(app()).post('/api/v1/imports');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('viewer não pode importar (403)', async () => {
    const res = await uploadWorkbook('caio');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('analyst pode importar (201)', async () => {
    const res = await uploadWorkbook('dani');
    expect(res.status).toBe(201);
    expect(res.body.job.createdBy).toBe(DANI.userId);
  });

  // Costura com o arquivo da organização (§35): quem importa também cataloga, para o vínculo
  // com o job ser exato em vez de deduzido do caminho do objeto pela varredura do bucket.
  it('registra a planilha no arquivo da organização com origem e job', async () => {
    const res = await uploadWorkbook();
    expect(res.status).toBe(201);

    expect(documents.documents).toHaveLength(1);
    expect(documents.documents[0]).toMatchObject({
      organizationId: ORG_A,
      fileName: 'base.xlsx',
      origin: 'import',
      importJobId: res.body.job.id,
      uploadedBy: ANA.userId,
      storagePath: `${ORG_A}/${res.body.job.id}/base.xlsx`,
    });
  });

  it('arquivo recusado não vira job nem entra no arquivo da organização', async () => {
    const res = await upload(Buffer.from('isto nao e uma planilha'), 'ruim.xlsx', XLSX_MIME);
    expect(res.status).toBe(415);
    expect(documents.documents).toHaveLength(0);
  });

  // Catalogar é desejável, não essencial: o essencial é a planilha estar guardada.
  it('falha ao catalogar não derruba a importação', async () => {
    documents.registerImportedDocuments = async () => {
      throw new Error('banco fora do ar');
    };
    const res = await uploadWorkbook();
    expect(res.status).toBe(201);
    expect([...storage.objects.keys()]).toHaveLength(1);
  });

  it('guarda a planilha no bucket privado e já devolve as abas reconhecidas', async () => {
    const res = await uploadWorkbook();
    expect(res.status).toBe(201);
    const { job, sheets } = res.body;
    expect(job).toMatchObject({
      organizationId: ORG_A,
      fileName: 'base.xlsx',
      fileType: 'XLSX',
      status: 'uploaded',
    });
    expect(job).not.toHaveProperty('filePath');
    expect([...storage.objects.keys()]).toEqual([`${ORG_A}/${job.id}/base.xlsx`]);

    const byName = Object.fromEntries(
      sheets.map((sheet: { name: string; detectedDataset: string | null }) => [
        sheet.name,
        sheet.detectedDataset,
      ]),
    );
    expect(byName).toMatchObject({
      clientes: 'clients',
      atendimento_mensal: 'monthly_metrics',
      pesquisas_nps: 'nps',
      situacao_clientes: 'client_status',
    });
    // A aba de texto não vira dataset nenhum.
    expect(byName['Leia-me']).toBeNull();
  });

  it('aceita CSV com ponto e vírgula e número no formato brasileiro', async () => {
    const res = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');
    expect(res.status).toBe(201);
    expect(res.body.job.fileType).toBe('CSV');
    expect(res.body.sheets[0].detectedDataset).toBe('clients');
  });

  it('aceita JSON de array de objetos', async () => {
    const json = Buffer.from(
      JSON.stringify([
        {
          cliente_id: 'C020',
          segmento: 'Varejo',
          porte: 'Medio',
          plano: 'Essencial',
          valor_mensal: 990,
          sla_contratado_h: 24,
          inicio_contrato: '2025-06-01',
        },
      ]),
    );
    const res = await upload(json, 'clientes.json', 'application/json');
    expect(res.status).toBe(201);
    expect(res.body.job.fileType).toBe('JSON');
  });

  it('recusa extensão fora da allowlist tabular com 415 (PDF é documento, não dado)', async () => {
    const res = await upload(Buffer.from('%PDF-1.7'), 'contrato.pdf', 'application/pdf');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(repository.jobs).toHaveLength(0);
    expect(storage.objects.size).toBe(0);
  });

  it('recusa MIME que não corresponde à extensão com 415', async () => {
    const res = await upload(CLIENTS_CSV, 'clientes.xlsx', 'text/csv');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('recusa XLSX cujo conteúdo não é uma planilha (assinatura) com 415', async () => {
    const res = await upload(Buffer.from('isto nao e uma planilha'), 'base.xlsx', XLSX_MIME);
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('recusa arquivo acima do limite de 20 MB com 413', async () => {
    const big = Buffer.alloc(21 * 1024 * 1024, 0x41);
    const res = await upload(big, 'grande.csv', 'text/csv');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(storage.objects.size).toBe(0);
  });

  it('recusa JSON inválido com 422 e não guarda nada', async () => {
    const res = await upload(Buffer.from('{ nao é json'), 'dados.json', 'application/json');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IMPORT_FILE_UNREADABLE');
    expect(repository.jobs).toHaveLength(0);
    expect(storage.objects.size).toBe(0);
  });
});

describe('POST /api/v1/imports/:id/preview', () => {
  it('aplica o preset da planilha e conta válidas, inválidas e campos ausentes', async () => {
    const uploaded = await uploadWorkbook();
    const id = uploaded.body.job.id;

    const res = await request(app()).post(`/api/v1/imports/${id}/preview`).set(as('ana')).send({});
    expect(res.status).toBe(200);

    const clients = res.body.sheets.find(
      (sheet: { dataset: string }) => sheet.dataset === 'clients',
    );
    expect(clients.mappingSource).toBe('preset');
    expect(clients.mapping.external_code).toBe('cliente_id');
    // C003 está sem valor mensal: duas válidas, uma inválida.
    expect(clients.counts).toMatchObject({ total: 3, valid: 2, invalid: 1, duplicates: 0 });
    expect(clients.errors[0]).toMatchObject({
      row: 3,
      field: 'monthly_value',
      code: 'MISSING_REQUIRED',
    });

    expect(res.body.job.status).toBe('previewed');
    expect(res.body.counts.valid).toBe(2 + 2 + 2 + 2);
    // A aba de texto entra como ignorada, com o motivo.
    expect(res.body.skipped).toEqual([
      { sheet: 'Leia-me', reason: expect.stringContaining('não correspondem') },
    ]);
  });

  it('devolve os campos com rótulo em português e a confiança de cada coluna', async () => {
    const uploaded = await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');
    const res = await request(app())
      .post(`/api/v1/imports/${uploaded.body.job.id}/preview`)
      .set(as('ana'))
      .send({});
    expect(res.status).toBe(200);

    const fields = res.body.sheets[0].fields as {
      field: string;
      label: string;
      header: string | null;
      confidence: number;
    }[];
    const code = fields.find((field) => field.field === 'external_code');
    expect(code).toMatchObject({ label: 'Código do cliente', header: 'cliente_id' });
    expect(code?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('aceita o mapeamento corrigido à mão quando os cabeçalhos são estranhos', async () => {
    const csv = Buffer.from(
      'codigo_interno,ramo,tamanho,pacote,mensalidade,prazo,desde\n' +
        'X1,Varejo,Medio,Essencial,1000,24,2025-01-01\n',
    );
    const uploaded = await upload(csv, 'estranho.csv', 'text/csv');
    const res = await request(app())
      .post(`/api/v1/imports/${uploaded.body.job.id}/preview`)
      .set(as('ana'))
      .send({
        sheets: [
          {
            sheet: 'csv',
            dataset: 'clients',
            mapping: {
              external_code: 'codigo_interno',
              name: null,
              segment: 'ramo',
              size: 'tamanho',
              plan: 'pacote',
              monthly_value: 'mensalidade',
              contracted_sla_hours: 'prazo',
              contract_start: 'desde',
            },
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.sheets[0].counts).toMatchObject({ total: 1, valid: 1, invalid: 0 });
    expect(res.body.sheets[0].mappingSource).toBe('manual');
  });

  it('recusa tabela que não existe no arquivo com 400', async () => {
    const uploaded = await uploadWorkbook();
    const res = await request(app())
      .post(`/api/v1/imports/${uploaded.body.job.id}/preview`)
      .set(as('ana'))
      .send({ sheets: [{ sheet: 'inexistente', dataset: 'clients' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMPORT_SHEET_NOT_FOUND');
  });

  it('não vaza importação de outra organização (404)', async () => {
    const uploaded = await uploadWorkbook();
    const res = await request(app())
      .post(`/api/v1/imports/${uploaded.body.job.id}/preview`)
      .set(as('bia'))
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/imports/:id/confirm', () => {
  async function confirm(who = 'ana') {
    const uploaded = await uploadWorkbook();
    const id = uploaded.body.job.id;
    await request(app()).post(`/api/v1/imports/${id}/preview`).set(as('ana')).send({});
    const res = await request(app()).post(`/api/v1/imports/${id}/confirm`).set(as(who)).send({});
    return { id, res };
  }

  it('cria planos, clientes e contratos e marca quem cancelou', async () => {
    const { res } = await confirm();
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      plansCreated: 2,
      clientsCreated: 2,
      clientsUpdated: 0,
      clientsCancelled: 1,
      contractsCreated: 2,
    });
    expect(res.body.job.status).toBe('confirmed');
    expect(res.body.job.finishedAt).not.toBeNull();

    const cancelled = ingest.clients.find((client) => client.externalCode === 'C002');
    expect(cancelled?.status).toBe('cancelled');
    // Cancelou em agosto: o contrato termina no último dia do mês.
    expect(cancelled?.contractEnd).toBe('2026-08-31');
  });

  it('reuniões previstas = 0 grava valor NULO, nunca 0 % (§15)', async () => {
    await confirm();
    const c002 = ingest.clients.find((client) => client.externalCode === 'C002');
    const missed = ingest.values.find(
      (value) =>
        value.portfolioClientId === c002?.id &&
        value.metricDefinitionId === ingest.metrics.get('missed_meetings'),
    );
    expect(missed).toBeDefined();
    expect(missed?.value).toBeNull();
  });

  it('NPS não respondido grava valor NULO com answered=false, nunca nota zero (§16)', async () => {
    await confirm();
    const c002 = ingest.clients.find((client) => client.externalCode === 'C002');
    const nps = ingest.values.find(
      (value) =>
        value.portfolioClientId === c002?.id &&
        value.metricDefinitionId === ingest.metrics.get('nps_dissatisfaction'),
    );
    expect(nps?.value).toBeNull();
    expect(nps?.answered).toBe(false);

    const c001 = ingest.clients.find((client) => client.externalCode === 'C001');
    const respondido = ingest.values.find(
      (value) =>
        value.portfolioClientId === c001?.id &&
        value.metricDefinitionId === ingest.metrics.get('nps_dissatisfaction'),
    );
    expect(respondido?.value).toBe(9);
    expect(respondido?.answered).toBe(true);
  });

  it('registra os erros por linha para a pessoa corrigir a planilha', async () => {
    const { res } = await confirm();
    expect(res.body.result.rowErrors).toBeGreaterThan(0);
    const saved = repository.rowErrors.find((error) => error.field === 'monthly_value');
    expect(saved).toMatchObject({ sheet: 'clientes', dataset: 'clients', rowNumber: 3 });
    // A linha crua vai junto: é por ela que a pessoa acha a linha na planilha.
    expect(saved?.rawData).toMatchObject({ cliente_id: 'C003' });
  });

  it('dispara o recálculo da carteira ao final (§62)', async () => {
    const { res } = await confirm();
    expect(recalculate).toHaveBeenCalledWith(ORG_A);
    expect(res.body.result.recalculation).toMatchObject({ clients: 2, alerts: 1 });
  });

  it('recalculate=false grava sem refazer os scores', async () => {
    const uploaded = await uploadWorkbook();
    const id = uploaded.body.job.id;
    const res = await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set(as('ana'))
      .send({ recalculate: false });
    expect(res.status).toBe(200);
    expect(recalculate).not.toHaveBeenCalled();
    expect(res.body.result.recalculation).toBeNull();
  });

  it('falha no recálculo não derruba a importação: o resumo diz o motivo', async () => {
    recalculate = vi.fn(async () => {
      throw new Error('Nenhuma versão de modelo ativa nesta organização.');
    });
    const { res } = await confirm();
    expect(res.status).toBe(200);
    expect(res.body.result.clientsCreated).toBe(2);
    expect(res.body.result.recalculation.skippedReason).toContain('Nenhuma versão');
  });

  it('reimportar o mesmo arquivo atualiza em vez de duplicar', async () => {
    const { id } = await confirm();
    expect(ingest.clients).toHaveLength(2);
    const valuesAfterFirst = ingest.values.length;

    const again = await request(app())
      .post(`/api/v1/imports/${id}/confirm`)
      .set(as('ana'))
      .send({});
    expect(again.status).toBe(200);
    expect(again.body.result).toMatchObject({ clientsCreated: 0, clientsUpdated: 2 });
    expect(ingest.clients).toHaveLength(2);
    expect(ingest.values).toHaveLength(valuesAfterFirst);
    // Os erros também são trocados, não acumulados.
    expect(repository.rowErrors.filter((error) => error.importJobId === id)).toHaveLength(
      again.body.result.rowErrors,
    );
  });

  it('viewer não pode confirmar (403)', async () => {
    const uploaded = await uploadWorkbook();
    const res = await request(app())
      .post(`/api/v1/imports/${uploaded.body.job.id}/confirm`)
      .set(as('caio'))
      .send({});
    expect(res.status).toBe(403);
  });

  it('ignora valor de cliente que não existe e diz o que ficou de fora', async () => {
    const csv = Buffer.from(
      'cliente_id,mes_ref,chamados_abertos,pct_sla_cumprido\nZ999,2026-07,4,88\n',
    );
    const uploaded = await upload(csv, 'mensal.csv', 'text/csv');
    const res = await request(app())
      .post(`/api/v1/imports/${uploaded.body.job.id}/confirm`)
      .set(as('ana'))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.result.metricValues).toBe(0);
    expect(res.body.result.skipped).toContain('cliente Z999 não cadastrado');
  });
});

describe('GET /api/v1/imports', () => {
  it('lista o histórico da organização, do mais recente para o mais antigo', async () => {
    await uploadWorkbook();
    await upload(CLIENTS_CSV, 'clientes.csv', 'text/csv');

    const res = await request(app()).get('/api/v1/imports').set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items[0].fileName).toBe('clientes.csv');
    expect(res.body.items[1].fileName).toBe('base.xlsx');
  });

  it('viewer lê o histórico', async () => {
    await uploadWorkbook();
    const res = await request(app()).get('/api/v1/imports').set(as('caio'));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('não mistura organizações', async () => {
    await uploadWorkbook();
    const res = await request(app()).get('/api/v1/imports').set(as('bia'));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });
});

describe('GET /api/v1/imports/:id', () => {
  it('traz o job, as tabelas do arquivo e os erros gravados', async () => {
    const uploaded = await uploadWorkbook();
    const id = uploaded.body.job.id;
    await request(app()).post(`/api/v1/imports/${id}/confirm`).set(as('ana')).send({});

    const res = await request(app()).get(`/api/v1/imports/${id}`).set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.job.status).toBe('confirmed');
    expect(res.body.sheets).toHaveLength(5);
    expect(res.body.errorTotal).toBeGreaterThan(0);
    expect(res.body.errors[0]).toHaveProperty('message');
  });

  it('404 para importação de outra organização', async () => {
    const uploaded = await uploadWorkbook();
    const res = await request(app()).get(`/api/v1/imports/${uploaded.body.job.id}`).set(as('bia'));
    expect(res.status).toBe(404);
  });

  it('404 para id inexistente', async () => {
    const res = await request(app()).get(`/api/v1/imports/${randomUUID()}`).set(as('ana'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1 (descoberta)', () => {
  it('anuncia as rotas de importação', async () => {
    const res = await request(app()).get('/api/v1');
    const paths = (res.body.routes as { path: string }[]).map((route) => route.path);
    expect(paths).toContain('/api/v1/imports');
    expect(paths).toContain('/api/v1/imports/{id}/confirm');
  });
});
