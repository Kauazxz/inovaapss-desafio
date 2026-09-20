/**
 * Leitura de XLSX com SheetJS. Datas chegam como `Date` (UTC) e números como número; o texto é
 * preservado como veio. Cada aba vira um `TabularSheet`.
 */
import { readFileSync } from 'node:fs';

import XLSX from 'xlsx';

import { ImportReadError } from '../shared/errors.js';
import { type ReadResult } from '../types.js';
import { sheetFromMatrix } from './sheet.js';

export type WorkbookInput = Buffer | Uint8Array | ArrayBuffer | string;

function toBuffer(input: WorkbookInput): Buffer {
  if (typeof input === 'string') return readFileSync(input);
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

/** Lê um arquivo XLSX (Buffer, Uint8Array, ArrayBuffer ou caminho) e devolve todas as abas. */
export function readWorkbook(input: WorkbookInput): ReadResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(toBuffer(input), { type: 'buffer', cellDates: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ImportReadError(`Não foi possível ler a planilha: ${detail}`);
  }
  const sheets = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const matrix: unknown[][] = worksheet
      ? XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, raw: true })
      : [];
    return sheetFromMatrix(name, matrix);
  });
  return { sheets };
}

/**
 * Gera um XLSX em memória a partir de matrizes (uma por aba). Usado nos testes e útil para a
 * interface oferecer um modelo de planilha para download.
 */
export function writeWorkbook(
  sheets: ReadonlyArray<{ name: string; matrix: unknown[][] }>,
): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.matrix), sheet.name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
