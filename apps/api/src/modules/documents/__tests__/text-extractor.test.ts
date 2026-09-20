/**
 * Extração de texto por tipo com fixtures pequenas (fixtures/: csv, json e md escritos à mão;
 * docx, xlsx e pdf gerados por fixtures/generate.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createTextExtractor,
  MAX_EXTRACTED_TEXT_CHARS,
  TextExtractionError,
} from '../../../infrastructure/extraction/index.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name: string) => readFileSync(path.join(fixtures, name));
const extractor = createTextExtractor();

describe('TextExtractor', () => {
  it('CSV: cabeçalhos, amostra de linhas e total', async () => {
    const result = await extractor.extract({ buffer: read('relatorio.csv'), kind: 'csv' });
    expect(result.kind).toBe('csv');
    expect(result.meta).toEqual({ rows: 4, truncated: false });
    expect(result.text).toContain(
      'Colunas (5): cliente_id, mes_ref, chamados_abertos, chamados_criticos, pct_sla_cumprido',
    );
    expect(result.text).toContain('Linhas de dados: 4');
    expect(result.text).toContain('| C003 | 2026-07 | 7 | 1 | 95.2 |');
  });

  it('JSON: chaves de cada nível e amostra dos arrays', async () => {
    const result = await extractor.extract({ buffer: read('kpis.json'), kind: 'json' });
    expect(result.kind).toBe('json');
    expect(result.text).toContain('organizacao: GlobalSys');
    expect(result.text).toContain('kpis:');
    expect(result.text).toContain('[array com 3 itens]');
    expect(result.text).toContain('nome: Tempo médio de resolução');
    expect(result.text).toContain('faixas:');
    expect(result.text).toContain('normal: 80');
  });

  it('JSON inválido: TextExtractionError', async () => {
    await expect(
      extractor.extract({ buffer: Buffer.from('{"a":'), kind: 'json' }),
    ).rejects.toBeInstanceOf(TextExtractionError);
  });

  it('Markdown e TXT: texto como está', async () => {
    const md = await extractor.extract({ buffer: read('politica-sla.md'), kind: 'markdown' });
    expect(md.kind).toBe('markdown');
    expect(md.text.startsWith('# Política de SLA — GlobalSys')).toBe(true);
    expect(md.text).toContain('Resolução em até **8 horas** corridas.');

    const txt = await extractor.extract({
      buffer: Buffer.from('﻿linha 1\r\nlinha 2\r\n'),
      kind: 'text',
    });
    expect(txt.text).toBe('linha 1\nlinha 2');
  });

  it('DOCX: parágrafos como texto corrido', async () => {
    const result = await extractor.extract({ buffer: read('manual-kpi.docx'), kind: 'docx' });
    expect(result.kind).toBe('docx');
    expect(result.text).toContain('Manual de KPI da GlobalSys.');
    expect(result.text).toContain('nao pode passar de 8 horas');
  });

  it('XLSX: uma seção por aba com cabeçalhos e primeiras linhas', async () => {
    const result = await extractor.extract({ buffer: read('atendimento.xlsx'), kind: 'xlsx' });
    expect(result.kind).toBe('xlsx');
    expect(result.meta).toEqual({ sheets: 2, rows: 5, truncated: false });
    expect(result.text).toContain('## Aba: atendimento');
    expect(result.text).toContain(
      'Colunas (4): cliente_id, mes_ref, chamados_abertos, pct_sla_cumprido',
    );
    expect(result.text).toContain('| C001 | 2026-08 | 15 | 88 |');
    expect(result.text).toContain('## Aba: metas');
    expect(result.text).toContain('| Cumprimento de SLA | 95 | % |');
  });

  it('PDF: texto das páginas', async () => {
    const result = await extractor.extract({ buffer: read('politica-sla.pdf'), kind: 'pdf' });
    expect(result.kind).toBe('pdf');
    expect(result.meta.pages).toBe(1);
    expect(result.text).toContain('Politica de SLA');
    expect(result.text).toContain('Meta de cumprimento: 95%');
  });

  it('PDF corrompido: TextExtractionError', async () => {
    await expect(
      extractor.extract({ buffer: Buffer.from('%PDF-1.4 lixo'), kind: 'pdf' }),
    ).rejects.toBeInstanceOf(TextExtractionError);
  });

  it('corta o texto no limite e sinaliza truncated', async () => {
    const huge = Buffer.from('a'.repeat(MAX_EXTRACTED_TEXT_CHARS + 500));
    const result = await extractor.extract({ buffer: huge, kind: 'text' });
    expect(result.text).toHaveLength(MAX_EXTRACTED_TEXT_CHARS);
    expect(result.meta.truncated).toBe(true);
  });
});
