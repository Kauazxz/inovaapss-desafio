import { describe, expect, it } from 'vitest';

import { detectDelimiter, readCsv } from './csv.js';
import { readTabular } from './index.js';
import { readJson } from './json.js';
import { sheetFromMatrix, sheetFromObjects } from './sheet.js';
import { readWorkbook, writeWorkbook } from './xlsx.js';
import { ImportReadError } from '../shared/errors.js';

describe('sheetFromMatrix', () => {
  it('usa a primeira linha preenchida como cabeçalho e ignora linhas vazias', () => {
    const sheet = sheetFromMatrix('t', [
      [null, null],
      ['Cliente ID', 'Valor Mensal (R$)', ''],
      ['C001', 100, null],
      ['', '', ''],
      ['C002', null, 'extra'],
    ]);
    expect(sheet.headers).toEqual(['Cliente ID', 'Valor Mensal (R$)', 'coluna_3']);
    expect(sheet.normalizedHeaders).toEqual(['cliente_id', 'valor_mensal_r', 'coluna_3']);
    expect(sheet.rows).toEqual([
      { 'Cliente ID': 'C001', 'Valor Mensal (R$)': 100, coluna_3: null },
      { 'Cliente ID': 'C002', 'Valor Mensal (R$)': null, coluna_3: 'extra' },
    ]);
  });

  it('matriz vazia vira tabela vazia', () => {
    expect(sheetFromMatrix('vazia', [[null], []])).toEqual({
      name: 'vazia',
      headers: [],
      normalizedHeaders: [],
      rows: [],
    });
  });
});

describe('sheetFromObjects', () => {
  it('une as chaves na ordem de aparição e descarta objetos vazios', () => {
    const sheet = sheetFromObjects('j', [{ a: 1 }, { b: 2, a: null }, { a: '', b: '' }]);
    expect(sheet.headers).toEqual(['a', 'b']);
    expect(sheet.rows).toEqual([
      { a: 1, b: null },
      { a: null, b: 2 },
    ]);
  });
});

describe('readCsv', () => {
  it('detecta ; , tab e |', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c')).toBe(',');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('a|b')).toBe('|');
    expect(detectDelimiter('a;b,c')).toBe(';');
    expect(detectDelimiter('\n\nsozinho')).toBe(',');
  });

  it('lê CSV com ; e BOM, mantendo tudo como texto', () => {
    const text = '﻿cliente_id;valor_mensal;inicio\r\nC001;"1.234,56";01/03/2025\r\n\r\nC002;;\r\n';
    const sheet = readCsv(text);
    expect(sheet.name).toBe('csv');
    expect(sheet.headers).toEqual(['cliente_id', 'valor_mensal', 'inicio']);
    expect(sheet.rows).toEqual([
      { cliente_id: 'C001', valor_mensal: '1.234,56', inicio: '01/03/2025' },
      { cliente_id: 'C002', valor_mensal: null, inicio: null },
    ]);
  });

  it('aceita delimitador explícito, bytes e nome', () => {
    const sheet = readCsv(Buffer.from('a,b\n1,2', 'utf8'), { delimiter: ',', name: 'arquivo' });
    expect(sheet.name).toBe('arquivo');
    expect(sheet.rows).toEqual([{ a: '1', b: '2' }]);
    const bytes = new TextEncoder().encode('x\ty\n3\t4');
    expect(readCsv(bytes).rows).toEqual([{ x: '3', y: '4' }]);
  });

  it('linha mais curta que o cabeçalho vira null nos campos que faltam', () => {
    expect(readCsv('a;b;c\n1;2').rows).toEqual([{ a: '1', b: '2', c: null }]);
  });

  it('CSV vazio é erro de leitura', () => {
    expect(() => readCsv('  \n ')).toThrow(ImportReadError);
  });
});

describe('readJson', () => {
  it('array de objetos → uma tabela', () => {
    const { sheets } = readJson('[{"cliente_id":"C001","valor":10},{"cliente_id":"C002"}]');
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.name).toBe('json');
    expect(sheets[0]?.headers).toEqual(['cliente_id', 'valor']);
    expect(sheets[0]?.rows).toEqual([
      { cliente_id: 'C001', valor: 10 },
      { cliente_id: 'C002', valor: null },
    ]);
  });

  it('objeto de arrays de objetos → uma tabela por chave', () => {
    const { sheets } = readJson({
      clientes: [{ cliente_id: 'C001' }],
      nps: [{ cliente_id: 'C001', nota: 9 }],
    });
    expect(sheets.map((s) => s.name)).toEqual(['clientes', 'nps']);
    expect(sheets[1]?.rows).toEqual([{ cliente_id: 'C001', nota: 9 }]);
  });

  it('objeto de colunas → linhas alinhadas pelo índice', () => {
    const { sheets } = readJson(Buffer.from('{"cliente_id":["C001","C002"],"valor":[10]}'));
    expect(sheets[0]?.rows).toEqual([
      { cliente_id: 'C001', valor: 10 },
      { cliente_id: 'C002', valor: null },
    ]);
  });

  it('aceita BOM e bytes', () => {
    const bytes = new TextEncoder().encode('﻿[{"a":1}]');
    expect(readJson(bytes).sheets[0]?.rows).toEqual([{ a: 1 }]);
  });

  it('JSON vazio, inválido ou em formato desconhecido é erro de leitura', () => {
    expect(() => readJson('')).toThrow(ImportReadError);
    expect(() => readJson('{')).toThrow(/JSON inválido/);
    expect(() => readJson('42')).toThrow(/formato não reconhecido/);
    expect(() => readJson('{}')).toThrow(ImportReadError);
    expect(() => readJson({ a: [1], b: [{ x: 1 }] })).toThrow(ImportReadError);
    expect(() => readJson([1, 2])).toThrow(ImportReadError);
  });
});

describe('readWorkbook', () => {
  const buffer = writeWorkbook([
    { name: 'Leia-me', matrix: [['Texto livre'], [], ['outra linha']] },
    {
      name: 'clientes',
      matrix: [
        ['cliente_id', 'valor_mensal', 'inicio_contrato'],
        ['C001', 3848, new Date(2020, 8, 1)],
        [],
        ['C002', 10742, '2020-02-01'],
      ],
    },
    { name: 'vazia', matrix: [] },
  ]);

  it('lê todas as abas de um Buffer, com datas como Date e números como número', () => {
    const { sheets } = readWorkbook(buffer);
    expect(sheets.map((s) => s.name)).toEqual(['Leia-me', 'clientes', 'vazia']);
    const clientes = sheets[1]!;
    expect(clientes.headers).toEqual(['cliente_id', 'valor_mensal', 'inicio_contrato']);
    expect(clientes.rows).toHaveLength(2);
    expect(clientes.rows[0]?.valor_mensal).toBe(3848);
    expect(clientes.rows[0]?.inicio_contrato).toBeInstanceOf(Date);
    expect(clientes.rows[1]?.inicio_contrato).toBe('2020-02-01');
    expect(sheets[2]?.rows).toEqual([]);
  });

  it('aceita Uint8Array e ArrayBuffer', () => {
    const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    expect(readWorkbook(view).sheets).toHaveLength(3);
    const copy = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(copy).set(buffer);
    expect(readWorkbook(copy).sheets).toHaveLength(3);
  });

  it('arquivo corrompido vira erro de leitura', () => {
    // O SheetJS aceita quase qualquer byte como texto; um ZIP truncado é o que ele recusa.
    expect(() => readWorkbook(Buffer.from('PK\u0003\u0004lixo'))).toThrow(ImportReadError);
    expect(() => readWorkbook(Buffer.from('PK\u0003\u0004lixo'))).toThrow(/Não foi possível ler/);
  });
});

describe('readTabular', () => {
  it('escolhe o leitor pelo tipo do arquivo', () => {
    expect(readTabular('a;b\n1;2', 'CSV').sheets[0]?.rows).toEqual([{ a: '1', b: '2' }]);
    expect(readTabular('[{"a":1}]', 'JSON').sheets[0]?.rows).toEqual([{ a: 1 }]);
    const xlsx = writeWorkbook([{ name: 's', matrix: [['a'], [1]] }]);
    expect(readTabular(xlsx, 'XLSX').sheets[0]?.rows).toEqual([{ a: 1 }]);
  });
});
