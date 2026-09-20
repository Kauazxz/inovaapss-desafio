/**
 * DocumentStorage: a versão em memória e a do Supabase Storage com um client dublê
 * (bucket privado criado sob demanda, caminhos por organização, URL assinada, remoção).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  buildDocumentObjectPath,
  buildExtractedTextPath,
  sanitizeFileName,
} from '../../../infrastructure/storage/document-storage.js';
import { createInMemoryDocumentStorage } from '../../../infrastructure/storage/memory-storage.js';
import {
  createSupabaseDocumentStorage,
  DOCUMENTS_BUCKET,
  IMPORTS_BUCKET,
  StorageError,
} from '../../../infrastructure/storage/supabase-storage.js';

import type { SupabaseClient } from '@supabase/supabase-js';

describe('caminhos e nomes', () => {
  it('sanitiza o nome: sem pastas, acentos ou caracteres estranhos, com a extensão', () => {
    expect(sanitizeFileName('../../Política de SLA (v2).pdf')).toBe('Politica-de-SLA-v2-.pdf');
    expect(sanitizeFileName('C:\\Users\\ana\\relatório.xlsx')).toBe('relatorio.xlsx');
    expect(sanitizeFileName('   ')).toBe('documento');
    expect(sanitizeFileName('a'.repeat(200) + '.txt')).toHaveLength(120);
  });

  it('monta <organizationId>/<documentId>/<nome-seguro>', () => {
    expect(buildDocumentObjectPath('org', 'doc', 'Manual KPI.docx')).toBe(
      'org/doc/Manual-KPI.docx',
    );
    expect(buildExtractedTextPath('org', 'doc')).toBe('org/doc/extracted.txt');
  });
});

describe('storage em memória', () => {
  it('grava, lê, assina e remove', async () => {
    const storage = createInMemoryDocumentStorage();
    await storage.upload({
      path: 'o/d/a.txt',
      body: Buffer.from('olá'),
      contentType: 'text/plain',
    });
    expect((await storage.download('o/d/a.txt')).toString()).toBe('olá');
    expect(await storage.createSignedUrl('o/d/a.txt', 60)).toBe('memory://o/d/a.txt?expires=60');
    await storage.remove(['o/d/a.txt']);
    await expect(storage.download('o/d/a.txt')).rejects.toThrow(/não encontrado/);
  });

  it('lista os objetos de um prefixo com tamanho e tipo', async () => {
    const storage = createInMemoryDocumentStorage();
    await storage.upload({
      path: 'org/job/a.csv',
      body: Buffer.from('a,b'),
      contentType: 'text/csv',
    });
    await storage.upload({
      path: 'outra/job/b.csv',
      body: Buffer.from('c'),
      contentType: 'text/csv',
    });

    expect(await storage.list('org/')).toEqual([
      { path: 'org/job/a.csv', sizeBytes: 3, mimeType: 'text/csv', createdAt: null },
    ]);
  });
});

interface FakeStorageClient {
  client: SupabaseClient;
  getBucket: ReturnType<typeof vi.fn>;
  createBucket: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  createSignedUrl: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
}

function fakeClient(options: { bucketExists: boolean; bucketPublic?: boolean }): FakeStorageClient {
  const getBucket = vi.fn(async (name: string) =>
    options.bucketExists
      ? { data: { id: name, name, public: options.bucketPublic ?? false }, error: null }
      : { data: null, error: { message: 'Bucket not found' } },
  );
  const createBucket = vi.fn(async () => ({ data: { name: DOCUMENTS_BUCKET }, error: null }));
  const upload = vi.fn(async () => ({ data: { path: 'x' }, error: null }));
  const download = vi.fn(async () => ({ data: new Blob([Buffer.from('conteúdo')]), error: null }));
  const createSignedUrl = vi.fn(async (path: string, expires: number) => ({
    data: { signedUrl: `https://storage.example/sign/${path}?token=abc&expires=${expires}` },
    error: null,
  }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  // Como no Supabase, `list` é por pasta: a pasta do job aparece com id nulo.
  const list = vi.fn(async (folder: string) => {
    if (folder === 'org') {
      return { data: [{ name: 'job', id: null, created_at: null, metadata: null }], error: null };
    }
    if (folder === 'org/job') {
      return {
        data: [
          {
            name: 'clientes.xlsx',
            id: 'obj-1',
            created_at: '2026-09-19T12:00:00.000Z',
            metadata: { size: 2048, mimetype: 'application/octet-stream' },
          },
        ],
        error: null,
      };
    }
    return { data: [], error: null };
  });
  const from = vi.fn(() => ({ upload, download, createSignedUrl, remove, list }));
  const client = { storage: { getBucket, createBucket, from } } as unknown as SupabaseClient;
  return { client, getBucket, createBucket, upload, download, createSignedUrl, remove, list };
}

describe('storage do Supabase (client dublê)', () => {
  it('cria o bucket PRIVADO uma única vez quando não existe e grava com o content type', async () => {
    const fake = fakeClient({ bucketExists: false });
    const storage = createSupabaseDocumentStorage({ getClient: () => fake.client });

    await storage.upload({
      path: 'org/doc/a.csv',
      body: Buffer.from('a,b'),
      contentType: 'text/csv',
    });
    await storage.upload({
      path: 'org/doc/b.csv',
      body: Buffer.from('c,d'),
      contentType: 'text/csv',
    });

    expect(fake.getBucket).toHaveBeenCalledTimes(1);
    expect(fake.createBucket).toHaveBeenCalledTimes(1);
    expect(fake.createBucket).toHaveBeenCalledWith(
      DOCUMENTS_BUCKET,
      expect.objectContaining({ public: false, fileSizeLimit: 10 * 1024 * 1024 }),
    );
    expect(fake.upload).toHaveBeenCalledWith(
      'org/doc/a.csv',
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'text/csv' }),
    );
  });

  it('não recria o bucket quando já existe', async () => {
    const fake = fakeClient({ bucketExists: true });
    const storage = createSupabaseDocumentStorage({ getClient: () => fake.client });
    const url = await storage.createSignedUrl('org/doc/a.csv', 300);
    expect(fake.createBucket).not.toHaveBeenCalled();
    expect(url).toContain('org/doc/a.csv');
    expect(fake.createSignedUrl).toHaveBeenCalledWith('org/doc/a.csv', 300);
  });

  it('força o download com o nome original quando solicitado', async () => {
    const fake = fakeClient({ bucketExists: true });
    const storage = createSupabaseDocumentStorage({ getClient: () => fake.client });
    await storage.createSignedUrl('org/doc/a.csv', 300, 'Relatório mensal.csv');
    expect(fake.createSignedUrl).toHaveBeenCalledWith('org/doc/a.csv', 300, {
      download: 'Relatório mensal.csv',
    });
  });

  it('recusa trabalhar com um bucket público', async () => {
    const fake = fakeClient({ bucketExists: true, bucketPublic: true });
    const storage = createSupabaseDocumentStorage({ getClient: () => fake.client });
    await expect(storage.download('org/doc/a.csv')).rejects.toBeInstanceOf(StorageError);
    expect(fake.download).not.toHaveBeenCalled();
  });

  it('lê como Buffer e remove em lote', async () => {
    const fake = fakeClient({ bucketExists: true });
    const storage = createSupabaseDocumentStorage({ getClient: () => fake.client });
    expect((await storage.download('org/doc/a.csv')).toString()).toBe('conteúdo');
    await storage.remove(['org/doc/a.csv', 'org/doc/extracted.txt']);
    expect(fake.remove).toHaveBeenCalledWith(['org/doc/a.csv', 'org/doc/extracted.txt']);
    await storage.remove([]);
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it('varre o prefixo e a pasta de baixo, devolvendo os arquivos com tamanho e data', async () => {
    const fake = fakeClient({ bucketExists: true });
    const storage = createSupabaseDocumentStorage({ getClient: () => fake.client });
    expect(await storage.list('org/')).toEqual([
      {
        path: 'org/job/clientes.xlsx',
        sizeBytes: 2048,
        mimeType: 'application/octet-stream',
        createdAt: '2026-09-19T12:00:00.000Z',
      },
    ]);
  });

  it('bucket de outro módulo: só lê, nunca cria, e erro na listagem devolve lista vazia', async () => {
    const fake = fakeClient({ bucketExists: false });
    const storage = createSupabaseDocumentStorage({
      getClient: () => fake.client,
      bucket: IMPORTS_BUCKET,
      createBucketIfMissing: false,
    });
    fake.list.mockResolvedValueOnce({ data: null, error: { message: 'Bucket not found' } });

    expect(await storage.list('org/')).toEqual([]);
    expect(fake.createBucket).not.toHaveBeenCalled();
    expect(fake.getBucket).not.toHaveBeenCalled();
  });

  it('erro do provedor vira StorageError (502) sem vazar detalhes', async () => {
    const fake = fakeClient({ bucketExists: true });
    fake.upload.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const storage = createSupabaseDocumentStorage({ getClient: () => fake.client });
    await expect(
      storage.upload({ path: 'p', body: Buffer.from(''), contentType: 'text/plain' }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'STORAGE_ERROR' });
  });
});
