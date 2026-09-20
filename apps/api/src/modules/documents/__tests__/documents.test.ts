/**
 * Rotas de documentos e sugestões com dublês: token, organizações e persistência em memória,
 * storage em memória e o extrator de texto REAL (os formatos estão em text-extractor.test.ts).
 */
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createFakeDocumentsRepository, type FakeDocumentsRepository } from './fake-repository.js';
import { createApp } from '../../../app.js';
import { parseApiEnv } from '../../../config/env.js';
import {
  createInMemoryDocumentStorage,
  type InMemoryDocumentStorage,
} from '../../../infrastructure/storage/memory-storage.js';
import { createFakeOrganizationsRepository } from '../../organizations/__tests__/fake-repository.js';

import type { DbClient } from '../../../infrastructure/db/index.js';
import type { MetricExtractionProvider } from '../../../infrastructure/extraction/index.js';
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
    createdAt: '2026-09-19T00:00:00.000Z',
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

let repository: FakeDocumentsRepository;
let storage: InMemoryDocumentStorage;
/** Bucket da importação de dados: o arquivo da organização só lê daqui (import-archive.ts). */
let importStorage: InMemoryDocumentStorage;

function app(provider?: MetricExtractionProvider) {
  return createApp(env, {
    db,
    supabase,
    apiV1: {
      getUser,
      organizationsRepository: organizationsRepository(),
      documentsRepository: repository,
      documentStorage: storage,
      importDocumentStorage: importStorage,
      ...(provider ? { metricExtractionProvider: provider } : {}),
    },
  });
}

const as = (name: string) => ({ Authorization: `Bearer token-${name}` });

const CSV = Buffer.from(
  'cliente_id,mes_ref,chamados_abertos,pct_sla_cumprido\nC001,2026-07,12,91.5\nC002,2026-07,3,100\n',
);

async function uploadCsv(who = 'ana', fileName = 'relatorio.csv') {
  const res = await request(app())
    .post('/api/v1/documents')
    .set(as(who))
    .attach('file', CSV, { filename: fileName, contentType: 'text/csv' });
  return res;
}

beforeEach(() => {
  repository = createFakeDocumentsRepository();
  storage = createInMemoryDocumentStorage();
  importStorage = createInMemoryDocumentStorage();
});

describe('POST /api/v1/documents', () => {
  it('responde 401 sem token', async () => {
    const res = await request(app()).post('/api/v1/documents');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('viewer não pode enviar (403)', async () => {
    const res = await uploadCsv('caio');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('analyst pode enviar (201)', async () => {
    const res = await uploadCsv('dani');
    expect(res.status).toBe(201);
    expect(res.body.document.uploadedBy).toBe(DANI.userId);
  });

  it('grava o CSV no storage privado e no banco com status uploaded', async () => {
    const res = await uploadCsv();
    expect(res.status).toBe(201);
    const { document } = res.body;
    expect(document).toMatchObject({
      organizationId: ORG_A,
      fileName: 'relatorio.csv',
      mimeType: 'text/csv',
      kind: 'csv',
      sizeBytes: CSV.length,
      status: 'uploaded',
      hasExtractedText: false,
      extractedTextPreview: null,
    });
    expect(document).not.toHaveProperty('storagePath');
    expect([...storage.objects.keys()]).toEqual([`${ORG_A}/${document.id}/relatorio.csv`]);
  });

  it('aceita o MIME alternativo que o Windows manda para CSV e normaliza para text/csv', async () => {
    const res = await request(app())
      .post('/api/v1/documents')
      .set(as('ana'))
      .attach('file', CSV, { filename: 'base.csv', contentType: 'application/vnd.ms-excel' });
    expect(res.status).toBe(201);
    expect(res.body.document.mimeType).toBe('text/csv');
  });

  it('recusa extensão fora da allowlist com 415', async () => {
    const res = await request(app())
      .post('/api/v1/documents')
      .set(as('ana'))
      .attach('file', Buffer.from('MZ'), {
        filename: 'virus.exe',
        contentType: 'application/octet-stream',
      });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(repository.documents).toHaveLength(0);
    expect(storage.objects.size).toBe(0);
  });

  it('recusa MIME que não corresponde à extensão com 415', async () => {
    const res = await request(app())
      .post('/api/v1/documents')
      .set(as('ana'))
      .attach('file', CSV, { filename: 'relatorio.pdf', contentType: 'text/csv' });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('recusa PDF cujo conteúdo não é PDF (assinatura) com 415', async () => {
    const res = await request(app())
      .post('/api/v1/documents')
      .set(as('ana'))
      .attach('file', Buffer.from('isto não é um pdf'), {
        filename: 'contrato.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(415);
    expect(storage.objects.size).toBe(0);
  });

  it('recusa arquivo acima de 10 MB com 413', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
    const res = await request(app())
      .post('/api/v1/documents')
      .set(as('ana'))
      .attach('file', big, { filename: 'grande.txt', contentType: 'text/plain' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(repository.documents).toHaveLength(0);
  });

  it('responde 400 FILE_REQUIRED sem o campo file', async () => {
    const res = await request(app()).post('/api/v1/documents').set(as('ana')).field('nome', 'x');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });
});

describe('GET /api/v1/documents e /documents/:id', () => {
  it('lista paginada, mais recente primeiro, com busca por nome', async () => {
    await uploadCsv('ana', 'a.csv');
    await uploadCsv('ana', 'b.csv');
    await uploadCsv('ana', 'contrato.csv');

    const all = await request(app()).get('/api/v1/documents').set(as('ana'));
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, total: 3 });
    expect(all.body.items.map((d: { fileName: string }) => d.fileName)).toEqual([
      'contrato.csv',
      'b.csv',
      'a.csv',
    ]);

    const search = await request(app())
      .get('/api/v1/documents?search=contrato&pageSize=1')
      .set(as('ana'));
    expect(search.body.total).toBe(1);
    expect(search.body.items[0].fileName).toBe('contrato.csv');
  });

  it('devolve o documento com URL assinada de validade curta', async () => {
    const { body } = await uploadCsv();
    const res = await request(app()).get(`/api/v1/documents/${body.document.id}`).set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.document.downloadUrl).toMatch(/^memory:\/\//);
    expect(res.body.document.downloadUrlExpiresInSeconds).toBe(300);
  });

  it('filtra por tipo de arquivo e por origem', async () => {
    await uploadCsv('ana', 'a.csv');
    await request(app())
      .post('/api/v1/documents')
      .set(as('ana'))
      .attach('file', Buffer.from('# Manual de KPI'), {
        filename: 'manual.md',
        contentType: 'text/markdown',
      });

    const csvOnly = await request(app()).get('/api/v1/documents?kind=csv').set(as('ana'));
    expect(csvOnly.body.total).toBe(1);
    expect(csvOnly.body.items[0].fileName).toBe('a.csv');

    const markdownOnly = await request(app()).get('/api/v1/documents?kind=markdown').set(as('ana'));
    expect(markdownOnly.body.items.map((d: { fileName: string }) => d.fileName)).toEqual([
      'manual.md',
    ]);

    const uploaded = await request(app()).get('/api/v1/documents?origin=upload').set(as('ana'));
    expect(uploaded.body.total).toBe(2);
    const imported = await request(app()).get('/api/v1/documents?origin=import').set(as('ana'));
    expect(imported.body.total).toBe(0);

    const invalidKind = await request(app()).get('/api/v1/documents?kind=exe').set(as('ana'));
    expect(invalidKind.status).toBe(400);
    expect(invalidKind.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404 para id inexistente e 400 para id inválido', async () => {
    const missing = await request(app()).get(`/api/v1/documents/${randomUUID()}`).set(as('ana'));
    expect(missing.status).toBe(404);
    const invalid = await request(app()).get('/api/v1/documents/abc').set(as('ana'));
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('isolamento entre organizações', () => {
  it('a organização B não vê nem revisa nada da organização A', async () => {
    const { body } = await uploadCsv('ana');
    const id: string = body.document.id;

    const list = await request(app()).get('/api/v1/documents').set(as('bia'));
    expect(list.body.total).toBe(0);

    expect((await request(app()).get(`/api/v1/documents/${id}`).set(as('bia'))).status).toBe(404);
    expect(
      (await request(app()).post(`/api/v1/documents/${id}/extract-metrics`).set(as('bia'))).status,
    ).toBe(404);
    expect(
      (await request(app()).get(`/api/v1/documents/${id}/suggestions`).set(as('bia'))).status,
    ).toBe(404);

    const created = await request(app())
      .post(`/api/v1/documents/${id}/suggestions`)
      .set(as('ana'))
      .send({
        suggestedName: 'SLA',
        suggestedType: 'PERCENTAGE',
        suggestedDirection: 'HIGHER_IS_BETTER',
      });
    expect(created.status).toBe(201);
    const suggestionId: string = created.body.suggestion.id;

    expect(
      (
        await request(app())
          .post(`/api/v1/metric-suggestions/${suggestionId}/accept`)
          .set(as('bia'))
      ).status,
    ).toBe(404);
    expect(repository.suggestions[0]?.status).toBe('pending');
  });
});

describe('arquivo da organização: planilhas da importação de dados', () => {
  const JOB = '99999999-9999-4999-8999-999999999999';
  const XLSX_LIKE = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x61, 0x62]);

  const storeInImportBucket = async (
    path: string,
    body = XLSX_LIKE,
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ) => importStorage.upload({ path, body, contentType });

  it('lista as planilhas do bucket da importação com origin, tamanho e job', async () => {
    await storeInImportBucket(`${ORG_A}/${JOB}/clientes.xlsx`);
    await uploadCsv('ana', 'contrato.csv');

    const res = await request(app()).get('/api/v1/documents').set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    const spreadsheet = res.body.items.find(
      (d: { fileName: string }) => d.fileName === 'clientes.xlsx',
    );
    expect(spreadsheet).toMatchObject({
      origin: 'import',
      importJobId: JOB,
      kind: 'xlsx',
      sizeBytes: XLSX_LIKE.length,
      uploadedBy: null,
      status: 'uploaded',
    });
    expect(
      res.body.items.find((d: { fileName: string }) => d.fileName === 'contrato.csv'),
    ).toMatchObject({ origin: 'upload', importJobId: null, uploadedBy: ANA.userId });
  });

  it('não duplica o que já foi registrado e ignora o que não sabe abrir', async () => {
    await storeInImportBucket(`${ORG_A}/${JOB}/clientes.xlsx`);
    await storeInImportBucket(
      `${ORG_A}/${JOB}/notas.exe`,
      Buffer.from('MZ'),
      'application/octet-stream',
    );

    const first = await request(app()).get('/api/v1/documents').set(as('ana'));
    expect(first.body.total).toBe(1);
    // App novo = varredura nova: a segunda leitura não pode criar a mesma linha de novo.
    const second = await request(app()).get('/api/v1/documents?origin=import').set(as('ana'));
    expect(second.body.total).toBe(1);
    expect(repository.documents).toHaveLength(1);
  });

  it('assina o download da planilha no bucket da importação', async () => {
    await storeInImportBucket(`${ORG_A}/${JOB}/clientes.xlsx`);
    const list = await request(app()).get('/api/v1/documents').set(as('ana'));
    const id = list.body.items[0].id;

    const res = await request(app()).get(`/api/v1/documents/${id}`).set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.document.downloadUrl).toBe(
      `memory://${ORG_A}/${JOB}/clientes.xlsx?expires=300`,
    );
    expect(res.body.document.origin).toBe('import');
  });

  it('não mistura organizações: a planilha da Org A não aparece para a Org B', async () => {
    await storeInImportBucket(`${ORG_A}/${JOB}/clientes.xlsx`);
    const res = await request(app()).get('/api/v1/documents').set(as('bia'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('bucket da importação indisponível não derruba a listagem', async () => {
    await uploadCsv('ana', 'contrato.csv');
    importStorage.list = async () => {
      throw new Error('bucket fora do ar');
    };
    const res = await request(app()).get('/api/v1/documents').set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });
});

describe('POST /api/v1/documents/:id/extract-metrics', () => {
  it('extrai o texto, guarda preview e texto completo, marca extracted; manual não sugere', async () => {
    const { body } = await uploadCsv();
    const id: string = body.document.id;

    const res = await request(app()).post(`/api/v1/documents/${id}/extract-metrics`).set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ id, status: 'extracted', hasExtractedText: true });
    expect(res.body.document.extractedTextPreview).toContain('Colunas (4)');
    expect(res.body.document.extractedTextPreview).toContain('cliente_id');
    expect(res.body.document.extractedAt).toEqual(expect.any(String));
    expect(res.body.suggestions).toEqual([]);
    expect(res.body.extraction).toMatchObject({ provider: 'manual', truncated: false, rows: 2 });

    expect(storage.objects.has(`${ORG_A}/${id}/extracted.txt`)).toBe(true);
    expect(storage.objects.get(`${ORG_A}/${id}/extracted.txt`)?.contentType).toMatch(/text\/plain/);
  });

  it('viewer não pode extrair (403)', async () => {
    const { body } = await uploadCsv();
    const res = await request(app())
      .post(`/api/v1/documents/${body.document.id}/extract-metrics`)
      .set(as('caio'));
    expect(res.status).toBe(403);
  });

  it('JSON inválido: 422, status failed e motivo gravado', async () => {
    const upload = await request(app())
      .post('/api/v1/documents')
      .set(as('ana'))
      .attach('file', Buffer.from('{"quebrado":'), {
        filename: 'kpis.json',
        contentType: 'application/json',
      });
    expect(upload.status).toBe(201);
    const id: string = upload.body.document.id;

    const res = await request(app()).post(`/api/v1/documents/${id}/extract-metrics`).set(as('ana'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TEXT_EXTRACTION_FAILED');

    const detail = await request(app()).get(`/api/v1/documents/${id}`).set(as('ana'));
    expect(detail.body.document.status).toBe('failed');
    expect(detail.body.document.extractionError).toContain('JSON');
  });

  it('um provider externo tem as sugestões validadas: só as seguras são gravadas', async () => {
    const provider: MetricExtractionProvider = {
      name: 'dublê',
      async extract(document, text) {
        expect(document.kind).toBe('csv');
        expect(text.text).toContain('cliente_id');
        return [
          {
            suggestedName: 'Cumprimento de SLA',
            suggestedType: 'PERCENTAGE',
            suggestedDirection: 'HIGHER_IS_BETTER',
            unit: '%',
            suggestedWeight: 0.12,
            confidence: 0.8,
            suggestedFormula: { '>=': [{ var: 'value' }, 95] },
          },
          {
            suggestedName: 'Insegura',
            suggestedType: 'SCORE',
            suggestedDirection: 'HIGHER_IS_BETTER',
            suggestedFormula: { method: [{ var: 'value' }, 'constructor'] },
          },
          // Inválida (tipo inexistente): descartada sem derrubar a extração.
          {
            suggestedName: 'X',
            suggestedType: 'NOPE' as never,
            suggestedDirection: 'CUSTOM',
          },
        ];
      },
    };
    const { body } = await uploadCsv();
    const res = await request(app(provider))
      .post(`/api/v1/documents/${body.document.id}/extract-metrics`)
      .set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0]).toMatchObject({
      suggestedName: 'Cumprimento de SLA',
      provider: 'dublê',
      confidence: 0.8,
      status: 'pending',
      createdBy: null,
    });
  });
});

describe('sugestões manuais e revisão', () => {
  const body = {
    suggestedName: 'Tempo médio de resolução',
    description: 'Horas até resolver chamados críticos',
    suggestedType: 'TIME',
    suggestedDirection: 'HIGHER_IS_WORSE',
    unit: 'h',
    suggestedWeight: 0.16,
    suggestedThresholds: {
      strategy: 'THRESHOLD_BANDS',
      bands: [
        { upTo: 8, health: 100 },
        { upTo: 12, health: 60 },
        { upTo: null, health: 0 },
      ],
    },
    suggestedFormula: { if: [{ '<=': [{ var: 'value' }, 8] }, 100, 40] },
    sourceExcerpt: 'nao pode passar de 8 horas',
  };

  it('cria a sugestão pendente com provider manual e confiança 1', async () => {
    const upload = await uploadCsv();
    const id: string = upload.body.document.id;
    const res = await request(app())
      .post(`/api/v1/documents/${id}/suggestions`)
      .set(as('ana'))
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.suggestion).toMatchObject({
      uploadedDocumentId: id,
      organizationId: ORG_A,
      suggestedName: body.suggestedName,
      suggestedType: 'TIME',
      suggestedDirection: 'HIGHER_IS_WORSE',
      unit: 'h',
      suggestedWeight: 0.16,
      provider: 'manual',
      confidence: 1,
      status: 'pending',
      createdBy: ANA.userId,
      reviewedBy: null,
    });
    expect(res.body.suggestion.suggestedThresholds.bands).toHaveLength(3);

    const list = await request(app()).get(`/api/v1/documents/${id}/suggestions`).set(as('ana'));
    expect(list.body.total).toBe(1);
  });

  it('recusa fórmula fora da allowlist com 400 UNSAFE_FORMULA', async () => {
    const upload = await uploadCsv();
    const res = await request(app())
      .post(`/api/v1/documents/${upload.body.document.id}/suggestions`)
      .set(as('ana'))
      .send({ ...body, suggestedFormula: { method: [{ var: 'value' }, 'toString'] } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSAFE_FORMULA');
    expect(repository.suggestions).toHaveLength(0);
  });

  it('valida o corpo com Zod (400 VALIDATION_ERROR)', async () => {
    const upload = await uploadCsv();
    const res = await request(app())
      .post(`/api/v1/documents/${upload.body.document.id}/suggestions`)
      .set(as('ana'))
      .send({
        suggestedName: 'x',
        suggestedType: 'TIME',
        suggestedDirection: 'UP',
        suggestedWeight: 3,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((issue: { path: string[] }) => issue.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['suggestedName', 'suggestedDirection', 'suggestedWeight']),
    );
  });

  it('viewer não cria sugestão (403)', async () => {
    const upload = await uploadCsv();
    const res = await request(app())
      .post(`/api/v1/documents/${upload.body.document.id}/suggestions`)
      .set(as('caio'))
      .send(body);
    expect(res.status).toBe(403);
  });

  it('aceitar marca accepted e devolve o payload pronto para POST /metrics', async () => {
    const upload = await uploadCsv();
    const id: string = upload.body.document.id;
    const created = await request(app())
      .post(`/api/v1/documents/${id}/suggestions`)
      .set(as('dani'))
      .send(body);
    const suggestionId: string = created.body.suggestion.id;

    const res = await request(app())
      .post(`/api/v1/metric-suggestions/${suggestionId}/accept`)
      .set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.suggestion).toMatchObject({
      id: suggestionId,
      status: 'accepted',
      reviewedBy: ANA.userId,
    });
    expect(res.body.suggestion.reviewedAt).toEqual(expect.any(String));
    expect(res.body.metricPayload).toEqual({
      name: 'Tempo médio de resolução',
      slug: 'tempo-medio-de-resolucao',
      description: body.description,
      category: 'Descoberta em documento',
      metricType: 'TIME',
      unit: 'h',
      direction: 'HIGHER_IS_WORSE',
      sourceType: 'DOCUMENT',
      periodicity: 'MONTHLY',
      weight: 0.16,
      normalization: body.suggestedThresholds,
      formula: body.suggestedFormula,
      isActive: false,
      origin: { documentId: id, suggestionId, fileName: 'relatorio.csv' },
    });
    // A métrica NÃO nasce aqui: nada além da sugestão mudou.
    expect(repository.suggestions).toHaveLength(1);
  });

  it('rejeitar marca rejected; viewer não revisa', async () => {
    const upload = await uploadCsv();
    const created = await request(app())
      .post(`/api/v1/documents/${upload.body.document.id}/suggestions`)
      .set(as('ana'))
      .send(body);
    const suggestionId: string = created.body.suggestion.id;

    const forbidden = await request(app())
      .post(`/api/v1/metric-suggestions/${suggestionId}/reject`)
      .set(as('caio'));
    expect(forbidden.status).toBe(403);

    const res = await request(app())
      .post(`/api/v1/metric-suggestions/${suggestionId}/reject`)
      .set(as('ana'));
    expect(res.status).toBe(200);
    expect(res.body.suggestion).toMatchObject({ status: 'rejected', reviewedBy: ANA.userId });

    const missing = await request(app())
      .post(`/api/v1/metric-suggestions/${randomUUID()}/reject`)
      .set(as('ana'));
    expect(missing.status).toBe(404);
  });
});

describe('documentação', () => {
  it('o OpenAPI e o índice listam as rotas de documentos', async () => {
    const docs = await request(app()).get('/api/docs.json');
    expect(docs.body.paths).toHaveProperty('/api/v1/documents');
    expect(docs.body.paths).toHaveProperty('/api/v1/documents/{id}/extract-metrics');
    expect(docs.body.paths).toHaveProperty('/api/v1/metric-suggestions/{id}/accept');

    const index = await request(app()).get('/api/v1');
    expect(index.body.routes).toContainEqual(
      expect.objectContaining({ method: 'POST', path: '/api/v1/documents' }),
    );
  });
});
