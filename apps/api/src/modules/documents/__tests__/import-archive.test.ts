/**
 * Leitura do bucket da importação de dados (docs/DOCUMENTS.md §8): caminho → job, objeto →
 * linha do arquivo da organização, e o intervalo entre duas varreduras.
 */
import { describe, expect, it } from 'vitest';

import {
  createSyncClock,
  fileNameOfPath,
  importJobIdOfPath,
  toImportedDocumentInputs,
} from '../import-archive.js';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB = '99999999-9999-4999-8999-999999999999';

describe('importJobIdOfPath', () => {
  it('lê o job do caminho <org>/<job>/<arquivo>', () => {
    expect(importJobIdOfPath(ORG, `${ORG}/${JOB}/clientes.xlsx`)).toBe(JOB);
  });

  it('sem pasta de job, ou com pasta que não é uuid, devolve null', () => {
    expect(importJobIdOfPath(ORG, `${ORG}/clientes.xlsx`)).toBeNull();
    expect(importJobIdOfPath(ORG, `${ORG}/julho/clientes.xlsx`)).toBeNull();
  });

  it('ignora caminho de outra organização', () => {
    expect(importJobIdOfPath(ORG, `outra-org/${JOB}/clientes.xlsx`)).toBeNull();
  });
});

describe('toImportedDocumentInputs', () => {
  it('monta a linha com origem, job, nome e o MIME canônico da extensão', () => {
    const [input] = toImportedDocumentInputs(ORG, [
      {
        path: `${ORG}/${JOB}/clientes.xlsx`,
        sizeBytes: 2048,
        mimeType: 'application/octet-stream',
        createdAt: '2026-09-19T12:00:00.000Z',
      },
    ]);
    expect(input).toMatchObject({
      organizationId: ORG,
      storagePath: `${ORG}/${JOB}/clientes.xlsx`,
      fileName: 'clientes.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 2048,
      uploadedBy: null,
      origin: 'import',
      importJobId: JOB,
    });
    expect(input?.createdAt?.toISOString()).toBe('2026-09-19T12:00:00.000Z');
  });

  it('descarta o que a allowlist não aceita e sobrevive a data inválida', () => {
    const inputs = toImportedDocumentInputs(ORG, [
      { path: `${ORG}/notas.exe`, sizeBytes: 10, mimeType: '', createdAt: null },
      { path: `${ORG}/base.csv`, sizeBytes: 10, mimeType: 'text/csv', createdAt: 'ontem' },
    ]);
    expect(inputs.map((i) => i.fileName)).toEqual(['base.csv']);
    expect(inputs[0]?.createdAt).toBeUndefined();
  });

  it('nome sem extensão conhecida não entra no arquivo', () => {
    expect(
      toImportedDocumentInputs(ORG, [
        { path: `${ORG}/${JOB}/planilha`, sizeBytes: 1, mimeType: '', createdAt: null },
      ]),
    ).toEqual([]);
  });
});

describe('createSyncClock', () => {
  it('só libera uma nova varredura depois do intervalo', () => {
    let currentTime = 1_000;
    const clock = createSyncClock(30_000, () => currentTime);
    expect(clock.due(ORG)).toBe(true);
    clock.touch(ORG);
    expect(clock.due(ORG)).toBe(false);
    currentTime += 29_999;
    expect(clock.due(ORG)).toBe(false);
    currentTime += 1;
    expect(clock.due(ORG)).toBe(true);
  });

  it('cada organização tem o seu relógio', () => {
    const clock = createSyncClock(30_000, () => 0);
    clock.touch(ORG);
    expect(clock.due(ORG)).toBe(false);
    expect(clock.due('outra')).toBe(true);
  });
});

describe('fileNameOfPath', () => {
  it('pega o último segmento', () => {
    expect(fileNameOfPath(`${ORG}/${JOB}/relatorio final.csv`)).toBe('relatorio final.csv');
    expect(fileNameOfPath('solto.json')).toBe('solto.json');
  });
});
