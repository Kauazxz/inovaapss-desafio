/**
 * Leitura de CSV com PapaParse. O delimitador é detectado entre `;` `,` `\t` `|` (o Excel em
 * português salva com `;`). Todas as células chegam como texto; a coerção de tipos é feita depois,
 * pelo mapeamento, para que "1.234,56" e "01/03/2025" sejam interpretados com as regras do campo.
 */
import Papa from 'papaparse';

import { ImportReadError } from '../shared/errors.js';
import { type CsvDelimiter, type ReadCsvOptions, type TabularSheet } from '../types.js';
import { sheetFromMatrix } from './sheet.js';

export type CsvInput = string | Buffer | Uint8Array;

const DELIMITERS: readonly CsvDelimiter[] = [';', ',', '\t', '|'];

function toText(input: CsvInput): string {
  const text = typeof input === 'string' ? input : Buffer.from(input).toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM
}

/** Conta ocorrências de cada delimitador na primeira linha não vazia; empate favorece `;`. */
export function detectDelimiter(text: string): CsvDelimiter {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  let best: CsvDelimiter = ';';
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return bestCount === 0 ? ',' : best;
}

/** Lê um CSV (texto ou bytes UTF-8, com ou sem BOM) e devolve uma tabela. */
export function readCsv(input: CsvInput, options: ReadCsvOptions = {}): TabularSheet {
  const text = toText(input);
  if (text.trim().length === 0) throw new ImportReadError('O arquivo CSV está vazio.');
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: 'greedy',
    header: false,
    dynamicTyping: false,
  });
  const fatal = parsed.errors.find((error) => error.type !== 'FieldMismatch');
  if (fatal) throw new ImportReadError(`Não foi possível ler o CSV: ${fatal.message}`);
  const matrix = parsed.data.map((cells) => cells.map((cell) => (cell === '' ? null : cell)));
  return sheetFromMatrix(options.name ?? 'csv', matrix);
}
