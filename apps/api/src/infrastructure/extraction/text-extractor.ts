/**
 * Extração de texto por tipo de arquivo (§35). Cada extrator devolve texto plano, limitado a
 * MAX_EXTRACTED_TEXT_CHARS, pronto para uma pessoa ler na tela e, mais tarde, para um provider
 * de IA (A5). Nada aqui interpreta fórmulas nem executa conteúdo do arquivo.
 *
 * | Tipo      | Biblioteca | Resultado                                                        |
 * | --------- | ---------- | ---------------------------------------------------------------- |
 * | PDF       | unpdf      | texto das páginas, em ordem                                      |
 * | DOCX      | mammoth    | texto corrido (sem formatação)                                   |
 * | XLSX      | xlsx       | por aba: nome, cabeçalhos e as primeiras linhas, separadas por | |
 * | CSV       | papaparse  | cabeçalhos, primeiras linhas e total de linhas                   |
 * | JSON      | nativo     | chaves de cada nível e uma amostra dos valores                   |
 * | MD / TXT  | nativo     | o texto como está (UTF-8)                                        |
 */
import mammoth from 'mammoth';
import Papa from 'papaparse';
import { extractText as extractPdfText } from 'unpdf';
import * as XLSX from 'xlsx';

import type { DocumentKind } from '@inovaapss/validation';

import { AppError } from '../../shared/errors.js';

import type { ExtractedText } from './types.js';

/** Limite do texto extraído (o preview no banco é menor: 20 kB). */
export const MAX_EXTRACTED_TEXT_CHARS = 200_000;
/** Linhas de dados mostradas por aba/arquivo tabular. */
export const TABULAR_SAMPLE_ROWS = 20;
/** Colunas mostradas por linha tabular. */
export const TABULAR_MAX_COLUMNS = 30;
const JSON_MAX_DEPTH = 4;
const JSON_MAX_KEYS_PER_LEVEL = 40;
const JSON_ARRAY_SAMPLE = 3;

export class TextExtractionError extends AppError {
  constructor(message: string) {
    super(422, 'TEXT_EXTRACTION_FAILED', message);
    this.name = 'TextExtractionError';
  }
}

export interface TextExtractorInput {
  buffer: Buffer;
  kind: DocumentKind;
}

export interface TextExtractor {
  extract(input: TextExtractorInput): Promise<ExtractedText>;
}

function finish(
  kind: DocumentKind,
  text: string,
  meta: Omit<ExtractedText['meta'], 'truncated'> = {},
): ExtractedText {
  const clean = text.replace(/\r\n?/g, '\n').split(NUL).join('').trim();
  const truncated = clean.length > MAX_EXTRACTED_TEXT_CHARS;
  return {
    kind,
    text: truncated ? clean.slice(0, MAX_EXTRACTED_TEXT_CHARS) : clean,
    meta: { ...meta, truncated },
  };
}

const NUL = String.fromCharCode(0);
const BOM_CODE = 0xfeff;

/** Remove o BOM do início de arquivos de texto salvos pelo Excel/Bloco de notas. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === BOM_CODE ? text.slice(1) : text;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatRow(cells: readonly unknown[]): string {
  const visible = cells.slice(0, TABULAR_MAX_COLUMNS).map(cellToString);
  const extra = cells.length - visible.length;
  return `| ${visible.join(' | ')} |${extra > 0 ? ` (+${extra} colunas)` : ''}`;
}

async function fromPdf(buffer: Buffer): Promise<ExtractedText> {
  try {
    const { totalPages, text } = await extractPdfText(new Uint8Array(buffer), {
      mergePages: true,
    });
    return finish('pdf', text, { pages: totalPages });
  } catch {
    throw new TextExtractionError(
      'Não foi possível ler o PDF. O arquivo pode estar corrompido ou protegido.',
    );
  }
}

async function fromDocx(buffer: Buffer): Promise<ExtractedText> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return finish('docx', result.value);
  } catch {
    throw new TextExtractionError(
      'Não foi possível ler o DOCX. Confira se o arquivo abre no Word.',
    );
  }
}

function fromXlsx(buffer: Buffer): ExtractedText {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      sheetRows: TABULAR_SAMPLE_ROWS + 1,
    });
  } catch {
    throw new TextExtractionError('Não foi possível ler a planilha XLSX.');
  }
  const parts: string[] = [];
  let totalRows = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet === undefined) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    const [header = [], ...body] = rows;
    const sample = body.slice(0, TABULAR_SAMPLE_ROWS);
    totalRows += body.length;
    parts.push(
      [
        `## Aba: ${sheetName}`,
        `Colunas (${header.length}): ${header.map(cellToString).filter(Boolean).join(', ') || '(sem cabeçalho)'}`,
        ...(sample.length > 0 ? [formatRow(header), ...sample.map(formatRow)] : ['(aba vazia)']),
      ].join('\n'),
    );
  }
  return finish('xlsx', parts.join('\n\n'), {
    sheets: workbook.SheetNames.length,
    rows: totalRows,
  });
}

function fromCsv(buffer: Buffer): ExtractedText {
  const text = stripBom(buffer.toString('utf8'));
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    preview: TABULAR_SAMPLE_ROWS + 1,
  });
  const [header = [], ...sample] = parsed.data;
  const totalLines = text.split(/\r?\n/).filter((line) => line.trim() !== '').length;
  const rows = Math.max(totalLines - 1, 0);
  const body = [
    `Colunas (${header.length}): ${header.join(', ') || '(sem cabeçalho)'}`,
    `Linhas de dados: ${rows}${rows > sample.length ? ` (mostrando as ${sample.length} primeiras)` : ''}`,
    ...(header.length > 0 ? [formatRow(header)] : []),
    ...sample.map(formatRow),
  ].join('\n');
  return finish('csv', body, { rows });
}

function describeJson(value: unknown, depth: number, indent: string, lines: string[]): void {
  if (Array.isArray(value)) {
    lines.push(`${indent}[array com ${value.length} itens]`);
    if (depth >= JSON_MAX_DEPTH) return;
    for (const item of value.slice(0, JSON_ARRAY_SAMPLE)) {
      describeJson(item, depth + 1, `${indent}  - `, lines);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      lines.push(`${indent}{}`);
      return;
    }
    for (const [key, item] of entries.slice(0, JSON_MAX_KEYS_PER_LEVEL)) {
      if (item !== null && typeof item === 'object') {
        lines.push(`${indent}${key}:`);
        if (depth < JSON_MAX_DEPTH) describeJson(item, depth + 1, `${indent}  `, lines);
      } else {
        lines.push(`${indent}${key}: ${cellToString(item).slice(0, 120)}`);
      }
    }
    if (entries.length > JSON_MAX_KEYS_PER_LEVEL) {
      lines.push(`${indent}(+${entries.length - JSON_MAX_KEYS_PER_LEVEL} chaves)`);
    }
    return;
  }
  lines.push(`${indent}${cellToString(value).slice(0, 120)}`);
}

function fromJson(buffer: Buffer): ExtractedText {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(buffer.toString('utf8')));
  } catch {
    throw new TextExtractionError('O arquivo não é um JSON válido.');
  }
  const lines: string[] = [];
  describeJson(parsed, 0, '', lines);
  const rows = Array.isArray(parsed) ? parsed.length : undefined;
  return finish('json', lines.join('\n'), rows === undefined ? {} : { rows });
}

function fromPlainText(kind: 'markdown' | 'text', buffer: Buffer): ExtractedText {
  return finish(kind, stripBom(buffer.toString('utf8')));
}

/** Extrator padrão: escolhe a rotina pelo tipo lógico do documento. */
export function createTextExtractor(): TextExtractor {
  return {
    async extract({ buffer, kind }) {
      switch (kind) {
        case 'pdf':
          return fromPdf(buffer);
        case 'docx':
          return fromDocx(buffer);
        case 'xlsx':
          return fromXlsx(buffer);
        case 'csv':
          return fromCsv(buffer);
        case 'json':
          return fromJson(buffer);
        case 'markdown':
        case 'text':
          return fromPlainText(kind, buffer);
      }
    },
  };
}
